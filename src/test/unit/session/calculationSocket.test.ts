import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF_CAP_MS, CalculationSocket, backoffDelay, newTraceparent } from "@/transport/calculationSocket";
import { FakeServer, settle, socketDeps } from "./fakeServer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function make(server: FakeServer, opts: Parameters<typeof socketDeps>[1] = {}) {
  const opened = vi.fn();
  const statuses: string[] = [];
  const s = new CalculationSocket("sheet-1", "dry_bulk", {
    onOpen: opened, onMessage: vi.fn(), onStatus: (st) => statuses.push(st),
  }, socketDeps(server, opts));
  return { s, opened, statuses };
}

describe("calculation socket", () => {
  it("full jitter: delays are uniform in [0, min(cap, base·2^n))", () => {
    expect(backoffDelay(0, () => 0.999)).toBe(499);
    expect(backoffDelay(3, () => 0.5)).toBe(2000);
    expect(backoffDelay(20, () => 0.999)).toBe(BACKOFF_CAP_MS - 30);
    expect(backoffDelay(5, () => 0)).toBe(0);
  });

  it("reconnects after a drop with growing jittered delays, and resets only once the session is healthy", async () => {
    const server = new FakeServer();
    const { s, opened } = make(server, { random: () => 0.5 });
    s.start();
    await settle();
    server.last.accept();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(server.last.url).toBe("ws://test/ws?ticket=ticket-1"); // a fresh single-use ticket, never a JWT

    server.last.drop();
    expect(server.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(249); // attempt 0: 0.5 × 500
    expect(server.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(server.sockets).toHaveLength(2);
    server.last.drop(); // never opened: attempt 1 → 500 ms
    await vi.advanceTimersByTimeAsync(499);
    expect(server.sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(server.sockets).toHaveLength(3);
    expect(server.tickets).toBe(3);
    server.last.accept();
    s.markHealthy(); // the session reports connected/resumed: backoff resets
    server.last.drop();
    await vi.advanceTimersByTimeAsync(250);
    await settle();
    expect(server.sockets).toHaveLength(4);
    s.stop();
  });

  it("reconnects at once when the browser comes back online or the page becomes visible", async () => {
    const server = new FakeServer();
    const events = new EventTarget();
    const visibility = Object.assign(new EventTarget(), { visibilityState: "hidden" });
    const { s } = make(server, { random: () => 0.99, events, visibility });
    s.start();
    await settle();
    server.last.accept();
    server.last.drop(); // next retry ~495 ms away
    events.dispatchEvent(new Event("online"));
    await settle();
    expect(server.sockets).toHaveLength(2);
    server.last.drop();
    visibility.visibilityState = "visible";
    visibility.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(server.sockets).toHaveLength(3);
    s.stop();
  });

  it("sends heartbeats while open and stops for good on stop()", async () => {
    const server = new FakeServer();
    const { s } = make(server);
    s.start();
    await settle();
    server.last.accept();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(server.ofType("ping")).toHaveLength(1);
    s.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.sockets).toHaveLength(1);
  });

  it("does not retry when the ticket is refused (403)", async () => {
    const server = new FakeServer();
    server.ticketError = 403;
    const { s, statuses } = make(server);
    s.start();
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.sockets).toHaveLength(0);
    expect(statuses.at(-1)).toBe("stopped");
  });
});

describe("socket URL", () => {
  it("derives ws(s):// from the API base, absolute or relative; the ticket is the only credential", async () => {
    const { socketUrl } = await import("@/transport/calculationSocket");
    expect(socketUrl("T", "https://api.example.com/marine/api/v1")).toBe("wss://api.example.com/marine/api/v1/ws?ticket=T");
    expect(socketUrl("T", "http://localhost:8090/api/v1/")).toBe("ws://localhost:8090/api/v1/ws?ticket=T");
    expect(socketUrl("T", "/api/v1", "https://app.example.com/sheets")).toBe("wss://app.example.com/api/v1/ws?ticket=T");
  });
});

describe("liveness", () => {
  it("a half-open socket (no messages, close never completes) is abandoned and reconnected", async () => {
    vi.useFakeTimers();
    const server = new FakeServer();
    const { s } = make(server, { random: () => 0 });
    s.start();
    await settle();
    server.last.accept();
    server.last.close = () => undefined; // the closing handshake never completes
    await vi.advanceTimersByTimeAsync(3 * 20_000 + 1000);
    await settle();
    expect(server.sockets.length).toBeGreaterThan(1);
    s.stop();
  });
});

describe("trace context (M8, D-045)", () => {
  it("every client message except ping carries its own valid W3C traceparent", async () => {
    const server = new FakeServer();
    const { s } = make(server);
    s.start();
    await settle();
    server.last.accept();
    s.send({ type: "patch", client_sequence: 1, ops: [] } as never);
    s.send({ type: "save" } as never);
    await vi.advanceTimersByTimeAsync(20_000);
    const [patch] = server.ofType("patch");
    const [save] = server.ofType("save");
    const [ping] = server.ofType("ping");
    const re = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;
    expect(patch.traceparent).toMatch(re);
    expect(save.traceparent).toMatch(re);
    expect(patch.traceparent).not.toBe(save.traceparent);
    expect(ping.traceparent).toBeUndefined();
  });

  it("never emits all-zero ids", () => {
    let calls = 0;
    const tp = newTraceparent((b) => b.fill(calls++ < 1 ? 0 : 7));
    expect(tp).toBe(`00-${"07".repeat(16)}-${"07".repeat(8)}-01`);
  });
});

describe("server shutdown hint (M9)", () => {
  it("after a reconnect hint the close is a planned move: resume within the jitter window, backoff not grown", async () => {
    const server = new FakeServer();
    const { s, statuses } = make(server, { random: () => 0.9 });
    s.start();
    await settle();
    // Two failed attempts grow the backoff to attempt 2 (0.9 × 2000 = 1800 ms).
    server.last.drop();
    await vi.advanceTimersByTimeAsync(450);
    await settle();
    server.last.drop();
    await vi.advanceTimersByTimeAsync(900);
    await settle();
    expect(server.sockets).toHaveLength(3);
    server.last.accept();

    server.last.push({ type: "reconnect", reason: "server_shutdown" });
    server.last.drop(1001);
    expect(statuses.at(-1)).toBe("waiting");
    await vi.advanceTimersByTimeAsync(899); // planned: 0.9 × RECONNECT_HINT_JITTER_MS, not the 1800 ms backoff
    expect(server.sockets).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(server.sockets).toHaveLength(4);

    // The hint covers that one close only, and did not grow the backoff:
    // an unplanned drop waits attempt 2 (1800 ms).
    server.last.drop();
    await vi.advanceTimersByTimeAsync(1799);
    expect(server.sockets).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(server.sockets).toHaveLength(5);
    s.stop();
  });
});

describe("server shutdown hint is per socket (M9 review)", () => {
  it("a hint on a socket later abandoned by the heartbeat check does not make the next socket's close look planned", async () => {
    const server = new FakeServer();
    const { s } = make(server, { random: () => 0.9 });
    s.start();
    await settle();
    server.last.accept();
    server.last.push({ type: "reconnect", reason: "server_shutdown" });
    // The hinted socket goes silent and is abandoned (attempt 0 → 450 ms).
    await vi.advanceTimersByTimeAsync(3 * 20_000 + 450);
    await settle();
    expect(server.sockets).toHaveLength(2);
    // Socket 2 fails before opening: a real failure (attempt 1 → 900 ms).
    server.last.drop(1006);
    await vi.advanceTimersByTimeAsync(900);
    await settle();
    expect(server.sockets).toHaveLength(3);
    // Socket 3 fails too: attempt 2 → 0.9 × 2000 = 1800 ms. Had the stale hint
    // made socket 2's close "planned", the backoff would not have grown and
    // this would reconnect after 900 ms.
    server.last.drop(1006);
    await vi.advanceTimersByTimeAsync(1799);
    await settle();
    expect(server.sockets).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(server.sockets).toHaveLength(4);
    s.stop();
  });
});
