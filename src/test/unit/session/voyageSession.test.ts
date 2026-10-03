import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTLE_MS, VoyageSession } from "@/session/voyageSession";
import { OWNER_PROBE_MS, createTabCoordinator } from "@/session/tabCoordinator";
import { FakeServer, channelBus, sessionDeps, sessionState, settle, type FakeSocket } from "./fakeServer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DOC = { vessel: { name: "V", dwt: 81000 }, sequence: [{ id: 1 }] };

type Opts = { doc?: unknown; loaded?: unknown; state?: Record<string, unknown>; deps?: Parameters<typeof sessionDeps>[1]; settled?: boolean };

async function openSession(server: FakeServer, opts: Opts = {}) {
  const session = new VoyageSession("sheet-1", "dry_bulk", opts.doc ?? DOC, sessionDeps(server, opts.deps), opts.loaded ?? opts.doc ?? DOC);
  const started = session.start();
  await vi.advanceTimersByTimeAsync(OWNER_PROBE_MS + 50); // the other-tab probe
  await started;
  await settle();
  const sock = server.last;
  sock.accept();
  const st = sessionState(opts.state);
  sock.push({ type: "connected", request_id: "c-1", connection_id: "conn-1", ...st });
  sock.push({ type: "calculation_started", client_sequence: st.last_client_sequence, working_sequence: st.working_sequence, generation: st.working_sequence, calculation_id: "calc-0" });
  if (opts.settled !== false) await vi.advanceTimersByTimeAsync(SETTLE_MS); // past the load-settle window
  return { session, sock };
}

const lastPatch = (server: FakeServer) => server.ofType("patch").at(-1)!;

/** A real user edit: the editor reports input, then the debounced document arrives. */
function edit(session: VoyageSession, doc: unknown) {
  session.markUserEdit();
  session.update(doc);
}

function ack(sock: FakeSocket, seq: number, ws = seq) {
  sock.push({ type: "calculation_started", client_sequence: seq, working_sequence: ws, generation: ws, calculation_id: `calc-${ws}` });
}

async function reconnect(server: FakeServer) {
  await vi.advanceTimersByTimeAsync(1000);
  await settle();
  const s = server.last;
  s.accept();
  return s;
}

describe("voyage session", () => {
  it("connects with a ticket, owns the sheet, and is SAVED when the server has nothing unsaved", async () => {
    const server = new FakeServer();
    const { session } = await openSession(server);
    expect(server.ofType("connect")[0]).toMatchObject({ sheet_id: "sheet-1", segment: "dry_bulk", take_over: false });
    expect(session.getSnapshot()).toMatchObject({ role: "owner", saveState: "SAVED", persistedVersion: 1 });
  });

  it("coalesces several edits into one patch with the next client_sequence", async () => {
    const server = new FakeServer();
    const { session } = await openSession(server);
    edit(session, { ...DOC, vessel: { name: "W", dwt: 82000 }, hireRate: 15000 });
    expect(server.ofType("patch")).toHaveLength(1);
    expect(lastPatch(server)).toMatchObject({
      client_sequence: 1,
      ops: [{ op: "set", path: "/vessel/name", value: "W" }, { op: "set", path: "/vessel/dwt", value: 82000 }, { op: "set", path: "/hireRate", value: 15000 }],
    });
    expect(session.getSnapshot().saveState).toBe("LOCAL_ONLY");
  });

  it("ignores a calculation_result older than the latest acknowledged sequence", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    edit(session, { ...DOC, hireRate: 1 });
    edit(session, { ...DOC, hireRate: 2 });
    ack(sock, 1);
    ack(sock, 2);
    sock.push({ type: "calculation_result", generation: 1, working_sequence: 1, calculation_id: "calc-1", result: { calculation_id: "calc-1", status: "completed", result: { stale: true } } });
    expect(session.getSnapshot().result).toBeNull();
    expect(session.getSnapshot().calculating).toBe(true);
    sock.push({ type: "calculation_result", generation: 2, working_sequence: 2, calculation_id: "calc-2", result: { calculation_id: "calc-2", status: "completed", result: {} } });
    expect(session.getSnapshot()).toMatchObject({ resultWorkingSequence: 2, calculating: false });
  });

  it("SAVED only on save_completed, with the committed version", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    edit(session, { ...DOC, hireRate: 1 });
    ack(sock, 1);
    session.save();
    expect(server.ofType("save")).toHaveLength(1);
    sock.push({ type: "save_started", working_sequence: 1 });
    expect(session.getSnapshot().saveState).toBe("SAVE_PENDING");
    sock.push({ type: "save_completed", working_sequence: 1, persisted_version: 2, engine_version: "2026.10.0", engine_version_changed: false });
    expect(session.getSnapshot()).toMatchObject({ saveState: "SAVED", persistedVersion: 2 });
  });

  it("acceptance: save succeeds, the socket drops, reconnect → resume shows SAVED with the right version", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    edit(session, { ...DOC, hireRate: 1 });
    ack(sock, 1);
    session.save();
    sock.push({ type: "save_started", working_sequence: 1 });
    sock.drop(); // save_completed never reaches this socket
    expect(session.getSnapshot().saveState).toBe("OFFLINE");
    const s2 = await reconnect(server);
    expect(s2).not.toBe(sock);
    // Resume reclaims only our own previous connection — never a take over.
    expect(server.ofType("resume")[0]).toMatchObject({ session_id: "sess-1", last_client_sequence: 1, last_working_sequence: 1, take_over_from: "conn-1" });
    expect(server.ofType("resume")[0]).not.toHaveProperty("take_over");
    expect(session.getSnapshot().saveState).toBe("RECOVERING");
    s2.push({ type: "resumed", connection_id: "conn-2", ...sessionState({ working_sequence: 1, last_client_sequence: 1, persisted_version: 2, dirty: false, sheet: { ...DOC, hireRate: 1 } }) });
    expect(session.getSnapshot()).toMatchObject({ saveState: "SAVED", persistedVersion: 2, conflict: null });
  });

  it("replays unacknowledged patches after a reconnect (and drops those the server already applied)", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    edit(session, { ...DOC, hireRate: 1 }); // seq 1
    edit(session, { ...DOC, hireRate: 2 }); // seq 2
    sock.drop(); // no acks
    edit(session, { ...DOC, hireRate: 3 }); // offline: diffed after resume
    const s2 = await reconnect(server);
    // The server applied seq 1 before the drop; seq 2 was lost.
    s2.push({ type: "resumed", connection_id: "conn-2", ...sessionState({ working_sequence: 1, last_client_sequence: 1, dirty: true, sheet: { ...DOC, hireRate: 1 } }) });
    const replay = s2.sent.filter((m) => m.type === "patch");
    expect(replay.map((p) => p.client_sequence)).toEqual([2, 3]);
    expect(replay[1]).toMatchObject({ ops: [{ op: "set", path: "/hireRate", value: 3 }] });
    expect(session.getSnapshot().conflict).toBeNull();
  });

  it("never assumes state after a resume into a different session with unsaved local edits: CONFLICT", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    edit(session, { ...DOC, hireRate: 5 });
    sock.drop();
    const s2 = await reconnect(server);
    s2.push({ type: "resumed", connection_id: "conn-2", ...sessionState({ session_id: "sess-OTHER", sheet: { ...DOC, hireRate: 9 } }) });
    const snap = session.getSnapshot();
    expect(snap.saveState).toBe("CONFLICT");
    expect(snap.conflict).toMatchObject({ reason: "RESUME_MISMATCH", differences: ["/hireRate"] });
  });

  it("recovers newer unsaved edits held by the server instead of overwriting them", async () => {
    const server = new FakeServer();
    const serverDoc = { ...DOC, hireRate: 777 };
    const { session } = await openSession(server, { state: { dirty: true, working_sequence: 3, last_client_sequence: 3, sheet: serverDoc } });
    expect(session.getSnapshot().recoveredDoc).toEqual(serverDoc);
    expect(server.ofType("patch")).toHaveLength(0); // the stale local doc was not pushed over it
    expect(session.getSnapshot().saveState).toBe("LOCAL_ONLY");
  });

  it("conflict flow: VERSION_CONFLICT shows the differences; 'keep my changes' rebases them on the saved version, never SAVED early", async () => {
    const server = new FakeServer();
    const saved = { ...DOC, hireRate: 900 };
    const { session, sock } = await openSession(server, { deps: { loadSavedDoc: async () => ({ data: saved, version: 3 }) } });
    const states: string[] = [];
    session.subscribe(() => states.push(session.getSnapshot().saveState));
    edit(session, { ...DOC, hireRate: 100 });
    ack(sock, 1);
    session.save();
    sock.push({ type: "save_failed", working_sequence: 1, code: "VERSION_CONFLICT", retryable: false });
    sock.push({ type: "conflict", code: "VERSION_CONFLICT", current_version: 3, expected_version: 1, fatal: false });
    await settle();
    expect(session.getSnapshot().saveState).toBe("CONFLICT");
    expect(session.getSnapshot().conflict).toMatchObject({ reason: "VERSION_CONFLICT", currentVersion: 3, differences: ["/hireRate"] });
    edit(session, { ...DOC, hireRate: 111 }); // edits during a conflict are not sent
    expect(server.ofType("patch")).toHaveLength(1);

    await session.resolveConflict("reapply");
    // 1) working sheet := saved version
    expect(lastPatch(server)).toMatchObject({ client_sequence: 2, ops: [{ op: "set", path: "/hireRate", value: 900 }] });
    edit(session, { ...DOC, hireRate: 112 }); // still resolving: not sent
    expect(server.ofType("patch")).toHaveLength(2);
    expect(session.getSnapshot().saveState).toBe("RECOVERING");
    ack(sock, 2); // 2) acknowledged → reopen
    await settle();
    const s2 = server.last;
    expect(s2).not.toBe(sock);
    s2.accept();
    expect(server.ofType("resume").at(-1)).toMatchObject({ take_over_from: "conn-1" });
    s2.push({ type: "resumed", connection_id: "conn-2", ...sessionState({ session_id: "sess-1", working_sequence: 2, last_client_sequence: 2, persisted_version: 3, dirty: false, sheet: saved }) });
    // 3) my latest change goes on top of the new base
    expect(lastPatch(server)).toMatchObject({ client_sequence: 3, ops: [{ op: "set", path: "/hireRate", value: 112 }] });
    expect(session.getSnapshot().conflict).toBeNull();
    expect(states.slice(states.indexOf("CONFLICT"))).not.toContain("SAVED");
  });

  it("acceptance: two tabs — the second is read-only, take over moves editing, no silent overwrite", async () => {
    const server = new FakeServer();
    const bus = channelBus();
    const tabs1 = createTabCoordinator("sheet-1", { channel: bus.channel(), tabId: "t1" });
    const tabs2 = createTabCoordinator("sheet-1", { channel: bus.channel(), tabId: "t2" });
    const { session: tab1, sock } = await openSession(server, { deps: { tabs: tabs1 } });
    expect(tab1.getSnapshot().role).toBe("owner");

    const tab2 = new VoyageSession("sheet-1", "dry_bulk", DOC, sessionDeps(server, { tabs: tabs2 }));
    const started = tab2.start();
    await vi.advanceTimersByTimeAsync(200);
    await started;
    expect(tab2.getSnapshot().role).toBe("readonly");
    expect(server.sockets).toHaveLength(1); // did not even contend for the lease
    tab2.update({ ...DOC, hireRate: 1 }); // read-only: nothing sent
    tab2.save();
    expect(server.ofType("patch")).toHaveLength(0);
    expect(server.ofType("save")).toHaveLength(0);

    tab2.takeOverEditing();
    await settle();
    const s2 = server.last;
    s2.accept();
    expect(server.ofType("connect").at(-1)).toMatchObject({ take_over: true });
    s2.push({ type: "connected", connection_id: "conn-2", ...sessionState() });
    expect(tab2.getSnapshot().role).toBe("owner");
    expect(tab1.getSnapshot().role).toBe("readonly"); // told at once over BroadcastChannel
    sock.push({ type: "conflict", code: "STALE_FENCE", fatal: true }); // and the server fences it anyway
    expect(tab1.getSnapshot().role).toBe("readonly");
  });

  it("a second device (no shared channel) is refused by the server lease and becomes read-only", async () => {
    const server = new FakeServer();
    const session = new VoyageSession("sheet-1", "dry_bulk", DOC, sessionDeps(server));
    await session.start();
    await settle();
    server.last.accept();
    server.last.push({ type: "conflict", code: "LEASE_HELD", fatal: true });
    expect(session.getSnapshot()).toMatchObject({ role: "readonly" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.sockets).toHaveLength(1); // no reconnect storm while read-only
  });

  it("an invalid patch rejected by the server is held back and the sequence continues", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    edit(session, { ...DOC, hireRate: 1, notes: "n" });
    sock.push({ type: "error", code: "INVALID_PATCH", message: "x", retryable: false, fatal: false, client_sequence: 1, path: "/notes" });
    expect(lastPatch(server)).toMatchObject({ client_sequence: 1, ops: [{ op: "set", path: "/hireRate", value: 1 }] });
    sock.push({ type: "error", code: "INVALID_PATCH", message: "x", retryable: false, fatal: false, client_sequence: 1 }); // no path: hold the whole patch
    const sends = server.ofType("patch").length;
    session.flush();
    expect(server.ofType("patch")).toHaveLength(sends); // no resend loop
    edit(session, { ...DOC, hireRate: 2, notes: "n" }); // a changed value is sent again
    expect(lastPatch(server)).toMatchObject({ client_sequence: 1, ops: [{ op: "set", path: "/hireRate", value: 2 }] });
  });
});

describe("M7 review regressions", () => {
  it("BLOCKER: a newer saved version on connect is adopted and shown, never reverted by the next edit", async () => {
    const server = new FakeServer();
    const v40 = { ...DOC, hireRate: 40 };
    const v41 = { ...DOC, hireRate: 41, notes: "saved elsewhere" };
    const { session } = await openSession(server, { doc: v40, state: { dirty: false, persisted_version: 41, sheet: v41 } });
    expect(session.getSnapshot().recoveredDoc).toEqual(v41);
    expect(server.ofType("patch")).toHaveLength(0);
    // The UI hydrates v41, settles, then the user edits.
    session.clearRecovered();
    session.update(v41); // the UI hydrated v41
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    edit(session, { ...v41, vessel: { name: "X", dwt: 81000 } });
    expect(lastPatch(server).ops).toEqual([{ op: "set", path: "/vessel/name", value: "X" }]);
  });

  it("BLOCKER: a resume into a newer session with nothing unsent adopts it (no diff of old data onto it)", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    sock.drop();
    const s2 = await reconnect(server);
    const v2 = { ...DOC, hireRate: 2 };
    s2.push({ type: "resumed", connection_id: "conn-2", ...sessionState({ session_id: "sess-NEW", persisted_version: 2, sheet: v2 }) });
    expect(session.getSnapshot()).toMatchObject({ recoveredDoc: v2, conflict: null, sessionId: "sess-NEW" });
    expect(server.ofType("patch")).toHaveLength(0);
  });

  it("an edit typed while connecting is not overwritten by newer server edits: conflict", async () => {
    const server = new FakeServer();
    const session = new VoyageSession("sheet-1", "dry_bulk", DOC, sessionDeps(server), DOC);
    void session.start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    edit(session, { ...DOC, hireRate: 5 }); // typed before the connection is up
    await settle();
    server.last.accept();
    server.last.push({ type: "connected", connection_id: "c", ...sessionState({ dirty: true, working_sequence: 3, last_client_sequence: 3, sheet: { ...DOC, hireRate: 9 } }) });
    expect(session.getSnapshot().conflict).toMatchObject({ reason: "RESUME_MISMATCH" });
  });

  it("sequence errors: an in-flight patch is not re-planned, the resend after UNAVAILABLE is bounded, and the sequence never goes back", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    edit(session, { ...DOC, hireRate: 1 }); // 1
    ack(sock, 1);
    edit(session, { ...DOC, hireRate: 2 }); // 2
    edit(session, { ...DOC, hireRate: 3 }); // 3 (pipelined)
    sock.push({ type: "error", code: "UNAVAILABLE", message: "x", retryable: true, fatal: false, client_sequence: 2 });
    sock.push({ type: "error", code: "INVALID_PATCH", message: "gap", retryable: false, fatal: false, client_sequence: 3, expected_sequence: 2 });
    expect(server.ofType("patch")).toHaveLength(3); // 2 is in flight: nothing re-planned
    await vi.advanceTimersByTimeAsync(1000); // resend 2, 3 in order
    expect(server.ofType("patch").slice(3).map((p) => p.client_sequence)).toEqual([2, 3]);
    ack(sock, 2);
    ack(sock, 3);
    edit(session, { ...DOC, hireRate: 4 });
    expect(lastPatch(server)).toMatchObject({ client_sequence: 4 });
  });

  it("a server behind our acknowledgements resynchronises through a reopen, never by lowering the sequence", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    edit(session, { ...DOC, hireRate: 1 });
    ack(sock, 1);
    edit(session, { ...DOC, hireRate: 2 });
    sock.push({ type: "error", code: "INVALID_PATCH", message: "regression", retryable: false, fatal: false, client_sequence: 2, expected_sequence: 1 });
    await settle();
    expect(server.sockets.length).toBe(2); // reopened
  });

  it("a resume mismatch clears stale pending patches: 'reload' never sends the discarded edits", async () => {
    const server = new FakeServer();
    const saved = { ...DOC, hireRate: 50 };
    const { session, sock } = await openSession(server, { deps: { loadSavedDoc: async () => ({ data: saved, version: 2 }) } });
    edit(session, { ...DOC, hireRate: 5 }); // seq 1, never acked
    sock.drop();
    const s2 = await reconnect(server);
    s2.push({ type: "resumed", connection_id: "conn-2", ...sessionState({ session_id: "sess-OTHER", sheet: saved }) });
    expect(session.getSnapshot().conflict?.reason).toBe("RESUME_MISMATCH");
    await session.resolveConflict("reload");
    expect(session.getSnapshot().recoveredDoc).toEqual(saved);
    const after = s2.sent.filter((m) => m.type === "patch");
    expect(after.every((p) => !JSON.stringify(p.ops).includes(":5}"))).toBe(true);
  });

  it("a disposed session never connects (probe still pending at dispose)", async () => {
    const server = new FakeServer();
    const bus = channelBus();
    const session = new VoyageSession("sheet-1", "dry_bulk", DOC, sessionDeps(server, { tabs: createTabCoordinator("sheet-1", { channel: bus.channel(), tabId: "t" }) }));
    const started = session.start();
    session.dispose();
    await vi.advanceTimersByTimeAsync(OWNER_PROBE_MS + 50);
    await started;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.sockets).toHaveLength(0);
  });

  it("dispose sends edits still waiting in the debounce", async () => {
    const server = new FakeServer();
    const { session } = await openSession(server);
    session.markUserEdit(); // typed; still in the debounce
    session.setDocumentProvider(() => ({ ...DOC, hireRate: 99 }));
    session.dispose();
    expect(lastPatch(server)).toMatchObject({ ops: [{ op: "set", path: "/hireRate", value: 99 }] });
  });

  it("losing the lease with unsent edits is not shown as Saved", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    sock.drop(); // edits from now on are not sent
    edit(session, { ...DOC, hireRate: 7 });
    const s2 = await reconnect(server);
    s2.push({ type: "conflict", code: "LEASE_HELD", fatal: true });
    expect(session.getSnapshot().role).toBe("readonly");
    expect(session.getSnapshot().saveState).not.toBe("SAVED");
    expect(session.getSnapshot().notice).toMatch(/not sent/);
  });
});

describe("load normalisation", () => {
  it("opening a sheet sends nothing and stays SAVED until the user really edits; then the edit carries everything", async () => {
    const server = new FakeServer();
    // The page's document differs from the server copy only by values the app
    // recomputed on load (e.g. a derived sea time).
    const loaded = { ...DOC, sequence: [{ id: 1, seaTime: 2.5 }] };
    const { session } = await openSession(server, { doc: loaded, loaded: DOC });
    session.update(loaded); // the app recomputed: not a user edit
    await vi.advanceTimersByTimeAsync(10_000);
    session.update(loaded);
    session.flush();
    expect(server.ofType("patch")).toHaveLength(0);
    expect(session.getSnapshot().saveState).toBe("SAVED");
    edit(session, { ...loaded, hireRate: 15000 }); // a real edit
    expect(lastPatch(server).ops).toEqual([
      { op: "set", path: "/sequence/0/seaTime", value: 2.5 },
      { op: "set", path: "/hireRate", value: 15000 },
    ]);
    expect(session.getSnapshot().saveState).toBe("LOCAL_ONLY");
  });
});

describe("M7 re-review regressions", () => {
  it("BLOCKER: an edit made right after opening is never swallowed — save sends it and SAVED waits for the commit", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server, { settled: false });
    edit(session, { ...DOC, hireRate: 5 }); // typed ~immediately after connect
    await vi.advanceTimersByTimeAsync(3000);
    session.save();
    expect(server.ofType("patch").flatMap((p) => p.ops as { path: string }[]).some((o) => o.path === "/hireRate")).toBe(true);
    expect(session.getSnapshot().saveState).not.toBe("SAVED");
    ack(sock, 1);
    sock.push({ type: "save_completed", working_sequence: 1, persisted_version: 2, engine_version: "2026.10.0", engine_version_changed: false });
    expect(session.getSnapshot().saveState).toBe("SAVED");
  });

  it("an explicit save sends everything, even values only the app changed", async () => {
    const server = new FakeServer();
    const loaded = { ...DOC, sequence: [{ id: 1, seaTime: 2.5 }] };
    const { session } = await openSession(server, { doc: loaded, loaded: DOC });
    session.save();
    expect(lastPatch(server).ops).toEqual([{ op: "set", path: "/sequence/0/seaTime", value: 2.5 }]);
  });

  it("an edit typed while connecting (no wait) is not overwritten by newer server edits: conflict", async () => {
    const server = new FakeServer();
    const session = new VoyageSession("sheet-1", "dry_bulk", DOC, sessionDeps(server), DOC);
    void session.start();
    edit(session, { ...DOC, hireRate: 5 });
    await settle();
    server.last.accept();
    server.last.push({ type: "connected", connection_id: "c", ...sessionState({ dirty: true, working_sequence: 3, last_client_sequence: 3, sheet: { ...DOC, hireRate: 9 } }) });
    expect(session.getSnapshot().conflict).toMatchObject({ reason: "RESUME_MISMATCH" });
  });

  it("MAJOR: a same-session resume whose sequence counts another device's patches is a conflict, not 'applied'", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    edit(session, { ...DOC, hireRate: 5 }); // seq 1, never acked
    sock.drop();
    const s2 = await reconnect(server);
    // Meanwhile another device of the same user took over, sent 1 and 2, and left.
    s2.push({ type: "resumed", connection_id: "conn-2", ...sessionState({ working_sequence: 2, last_client_sequence: 2, dirty: true, sheet: { ...DOC, notes: "other device" } }) });
    expect(session.getSnapshot().conflict).toMatchObject({ reason: "RESUME_MISMATCH" });
    expect(session.getSnapshot().recoveredDoc).toBeNull(); // my document was not replaced
  });

  it("an ordinary reconnect while resolving does not re-raise the conflict; the reopen follows the ack", async () => {
    const server = new FakeServer();
    const saved = { ...DOC, hireRate: 900 };
    const { session, sock } = await openSession(server, { deps: { loadSavedDoc: async () => ({ data: saved, version: 3 }) } });
    edit(session, { ...DOC, hireRate: 100 });
    ack(sock, 1);
    sock.push({ type: "conflict", code: "VERSION_CONFLICT", current_version: 3, expected_version: 1, fatal: false });
    await settle();
    await session.resolveConflict("reload");
    sock.drop(); // before the revert is acknowledged
    const s2 = await reconnect(server);
    s2.push({ type: "resumed", connection_id: "conn-2", ...sessionState({ working_sequence: 1, last_client_sequence: 1, dirty: true, sheet: { ...DOC, hireRate: 100 } }) });
    expect(session.getSnapshot().conflict).toBeNull();
    const revert = s2.sent.filter((m) => m.type === "patch").at(-1)!;
    expect(revert).toMatchObject({ client_sequence: 2 });
    ack(s2, 2);
    await settle();
    expect(server.sockets.length).toBe(3); // reopened after the ack
  });

  it("'keep my changes' meeting a newer server copy raises a conflict instead of discarding the changes", async () => {
    const server = new FakeServer();
    const saved = { ...DOC, hireRate: 900 };
    const { session, sock } = await openSession(server, { deps: { loadSavedDoc: async () => ({ data: saved, version: 3 }) } });
    edit(session, { ...DOC, hireRate: 100 });
    ack(sock, 1);
    sock.push({ type: "conflict", code: "VERSION_CONFLICT", current_version: 3, expected_version: 1, fatal: false });
    await settle();
    await session.resolveConflict("reapply");
    ack(sock, 2);
    await settle();
    server.last.accept();
    server.last.push({ type: "resumed", connection_id: "conn-2", ...sessionState({ session_id: "sess-NEW", persisted_version: 42, sheet: { ...DOC, hireRate: 4242 } }) });
    expect(session.getSnapshot().conflict).not.toBeNull();
    expect(session.getSnapshot().recoveredDoc).toBeNull();
  });
});

describe("M7 final review", () => {
  it("an edit recorded before the session connects is sent on connect, not absorbed as load normalisation", async () => {
    const server = new FakeServer();
    const typed = { ...DOC, hireRate: 8 };
    const session = new VoyageSession("sheet-1", "dry_bulk", typed, sessionDeps(server), DOC);
    session.markUserEdit(); // Index applies the edit noted before the session existed
    void session.start();
    await settle();
    server.last.accept();
    server.last.push({ type: "connected", connection_id: "c", ...sessionState() });
    expect(lastPatch(server).ops).toEqual([{ op: "set", path: "/hireRate", value: 8 }]);
    expect(session.getSnapshot().saveState).not.toBe("SAVED");
  });
});

describe("current server result for the sheet on screen (M10 stage 3)", () => {
  const result = (ws: number) => ({ type: "calculation_result", generation: ws, working_sequence: ws, calculation_id: `calc-${ws}`, result: { calculation_id: `calc-${ws}`, status: "completed", result: { totalDistance: ws } } });

  it("is the latest result only when the server's sheet equals the sheet on screen and nothing is pending", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    sock.push(result(0));
    expect(session.currentResult(DOC)).toMatchObject({ calculation_id: "calc-0" });
    const edited = { ...DOC, hireRate: 1 };
    expect(session.currentResult(edited)).toBeNull(); // the user typed: stale
    edit(session, edited);
    expect(session.currentResult(edited)).toBeNull(); // sent, not acknowledged
    ack(sock, 1);
    expect(session.currentResult(edited)).toBeNull(); // acknowledged, calculating
    sock.push(result(1));
    expect(session.currentResult(edited)).toMatchObject({ calculation_id: "calc-1" });
    expect(session.currentResult(DOC)).toBeNull();
  });
});

describe("current result ignores browser-derived row values (M10, D-055)", () => {
  it("a sheet differing only in derived leg times still gets the server result; a primary input does not", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    sock.push({ type: "calculation_result", generation: 0, working_sequence: 0, calculation_id: "calc-0", result: { calculation_id: "calc-0", status: "completed", result: {} } });
    const derived = { ...DOC, sequence: [{ id: 1, seaTime: 3.2, ecaTime: 0.4, totalLegTime: 4, calculatedPortDays: 1, legDepartureUtc: "2026-01-01T00:00:00Z" }] };
    expect(session.currentResult(derived)).toMatchObject({ calculation_id: "calc-0" });
    expect(session.currentResult({ ...DOC, sequence: [{ id: 1, distance: 100 }] })).toBeNull();
  });
});

describe("a result belongs to one opened session (parity review MAJOR-1)", () => {
  it("a resume onto another document under the same working_sequence clears the old result", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    sock.push({ type: "calculation_result", generation: 0, working_sequence: 0, calculation_id: "calc-0", result: { calculation_id: "calc-0", status: "completed", result: { old: true } } });
    expect(session.currentResult(DOC)).not.toBeNull();
    sock.drop();
    const s2 = await reconnect(server);
    const other = { vessel: { name: "OTHER", dwt: 1 }, sequence: [{ id: 1 }] };
    s2.push({ type: "resumed", request_id: "c-9", connection_id: "conn-2", ...sessionState({ sheet: other, persisted_version: 2 }) });
    expect(session.getSnapshot()).toMatchObject({ result: null, resultWorkingSequence: null, calculating: true });
    expect(session.currentResult(other)).toBeNull();
    expect(session.currentResult(DOC)).toBeNull();
  });
});
