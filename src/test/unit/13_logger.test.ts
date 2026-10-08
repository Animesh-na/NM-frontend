import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The logger reads MARINE_API_BASE at import: load it fresh with a same-origin
// API base, as the deployed app (edge proxy) uses.
async function loadLogger(apiBase = "/api/v1") {
  vi.resetModules();
  vi.stubEnv("VITE_MARINE_API_BASE", apiBase);
  return import("@/services/logger");
}

const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-01$/;

describe("logger: trace context on API calls", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("adds a W3C traceparent to same-origin API calls and returns its trace id", async () => {
    const { withTraceparent } = await loadLogger();
    const out = withTraceparent("/api/v1/dry-bulk/sheets/1", { method: "GET", headers: { Accept: "application/json" } });
    const header = new Headers(out.init?.headers).get("traceparent") ?? "";
    expect(header).toMatch(TRACEPARENT);
    expect(header.split("-")[1]).toBe(out.traceId);
    expect(new Headers(out.init?.headers).get("Accept")).toBe("application/json");
  });

  it("leaves other origins, non-API paths and existing traceparents alone", async () => {
    const { withTraceparent } = await loadLogger();
    expect(withTraceparent("https://api.mapbox.com/styles/v1", undefined)).toEqual({ init: undefined });
    expect(withTraceparent("/assets/app.js", undefined).traceId).toBeUndefined();
    const existing = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const kept = withTraceparent("/api/v1/config", { headers: { traceparent: existing } });
    expect(kept.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(new Headers(kept.init?.headers).get("traceparent")).toBe(existing);
  });

  it("never adds the header when the API is on another origin (no CORS preflight)", async () => {
    const { withTraceparent } = await loadLogger("https://development.effimove.in/marine/api/v1");
    expect(withTraceparent("https://development.effimove.in/marine/api/v1/config", undefined).traceId).toBeUndefined();
  });
});

describe("logger: delivery", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends buffered entries as one batch without the user's email", async () => {
    const { logger, setLoggerUser } = await loadLogger();
    setLoggerUser({ id: "user-1", email: "someone@example.com", token: "tok" } as never);
    logger.info("one");
    logger.warn("two", { component: "X" });
    logger.error("three");
    await logger.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/logs");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
    const body = JSON.parse(String(init.body));
    expect(body.logs.map((l: { message: string }) => l.message)).toEqual(["one", "two", "three"]);
    expect(body.logs[0].user_id).toBe("user-1");
    expect(JSON.stringify(body)).not.toContain("someone@example.com");
  });

  it("logs a failing API call with its path (no query) and the trace id it sent", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("/logs") ? new Response("{}", { status: 202 }) : new Response("{}", { status: 500 }));
    const mod = await loadLogger();
    mod.initLogger();
    mod.setLoggerUser({ id: "user-1", token: "tok" });
    await window.fetch("/api/v1/dry-bulk/vessels?q=SECRET-SEARCH", { method: "GET" });

    const apiCall = fetchMock.mock.calls.find(([u]) => String(u).startsWith("/api/v1/dry-bulk"));
    const sentTrace = (new Headers((apiCall?.[1] as RequestInit).headers).get("traceparent") ?? "").split("-")[1];
    expect(sentTrace).toMatch(/^[0-9a-f]{32}$/);

    await mod.logger.flush();
    const logPost = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/logs"));
    const entry = JSON.parse(String((logPost?.[1] as RequestInit).body)).logs.find(
      (l: { message: string }) => l.message.startsWith("API 500"));
    expect(entry.message).toBe("API 500 GET /api/v1/dry-bulk/vessels");
    expect(entry.trace_id).toBe(sentTrace);
    expect(entry.context.component).toBe("fetch");
    mod.shutdownLogger();
  });
});

describe("logger: attribution", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const posts = () => fetchMock.mock.calls
    .filter(([u]) => String(u).endsWith("/logs"))
    .map(([, init]) => ({
      auth: new Headers((init as RequestInit).headers).get("Authorization"),
      logs: JSON.parse(String((init as RequestInit).body)).logs as Array<{ message: string; user_id?: string; anonymous?: boolean }>,
    }));

  it("marks entries recorded while signed out as anonymous", async () => {
    const { logger, setLoggerUser } = await loadLogger();
    logger.info("before sign-in");
    setLoggerUser({ id: "user-1", token: "tok-1" });
    logger.info("after sign-in");
    await logger.flush();
    const [p] = posts();
    expect(p.auth).toBe("Bearer tok-1");
    expect(p.logs.find((l) => l.message === "before sign-in")).toMatchObject({ anonymous: true });
    expect(p.logs.find((l) => l.message === "before sign-in")?.user_id).toBeUndefined();
    expect(p.logs.find((l) => l.message === "after sign-in")).toMatchObject({ user_id: "user-1" });
    expect(p.logs.find((l) => l.message === "after sign-in")?.anonymous).toBeUndefined();
  });

  it("sends a user's pending entries with their own token when they sign out, never under the next user", async () => {
    const { logger, setLoggerUser } = await loadLogger();
    setLoggerUser({ id: "user-1", token: "tok-1" });
    logger.info("user-1 action");
    logger.info("User logged out");
    setLoggerUser(null);
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({ auth: "Bearer tok-1" });
    expect(posts()[0].logs.map((l) => l.message)).toEqual(["user-1 action", "User logged out"]);

    setLoggerUser({ id: "user-2", token: "tok-2" });
    logger.info("user-2 action");
    await logger.flush();
    const second = posts()[1];
    expect(second.auth).toBe("Bearer tok-2");
    expect(second.logs.map((l) => l.message)).toEqual(["user-2 action"]);
  });

  it("drops another user's leftovers instead of sending them under the current token", async () => {
    localStorage.setItem("voyagecalc_pending_logs", JSON.stringify([
      { level: "info", message: "old user's entry", user_id: "someone-else", client_timestamp: new Date().toISOString() },
    ]));
    const mod = await loadLogger();
    mod.initLogger();
    mod.setLoggerUser({ id: "user-1", token: "tok-1" });
    mod.logger.info("mine");
    await mod.logger.flush();
    const sent = posts().flatMap((p) => p.logs.map((l) => l.message));
    expect(sent).toContain("mine");
    expect(sent).not.toContain("old user's entry");
    mod.shutdownLogger();
  });
});
