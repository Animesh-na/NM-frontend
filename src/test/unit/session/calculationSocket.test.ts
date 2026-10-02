import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF_CAP_MS, CalculationSocket, backoffDelay } from "@/transport/calculationSocket";
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

  it("reconnects after a drop with growing jittered delays, and resets after a successful open", async () => {
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
    server.last.accept(); // success resets the backoff
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
