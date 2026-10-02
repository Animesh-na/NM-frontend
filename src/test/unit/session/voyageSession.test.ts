import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoyageSession } from "@/session/voyageSession";
import { OWNER_PROBE_MS, createTabCoordinator } from "@/session/tabCoordinator";
import { FakeServer, channelBus, sessionDeps, sessionState, settle, type FakeSocket } from "./fakeServer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DOC = { vessel: { name: "V", dwt: 81000 }, sequence: [{ id: 1 }] };

async function openSession(server: FakeServer, opts: { doc?: unknown; state?: Record<string, unknown>; deps?: Parameters<typeof sessionDeps>[1] } = {}) {
  const session = new VoyageSession("sheet-1", "dry_bulk", opts.doc ?? DOC, sessionDeps(server, opts.deps));
  const started = session.start();
  await vi.advanceTimersByTimeAsync(OWNER_PROBE_MS + 50); // the other-tab probe
  await started;
  await settle();
  const sock = server.last;
  sock.accept();
  const st = sessionState(opts.state);
  sock.push({ type: "connected", request_id: "c-1", ...st });
  sock.push({ type: "calculation_started", client_sequence: st.last_client_sequence, working_sequence: st.working_sequence, generation: st.working_sequence, calculation_id: "calc-0" });
  return { session, sock };
}

const lastPatch = (server: FakeServer) => server.ofType("patch").at(-1)!;

function ack(sock: FakeSocket, seq: number, ws = seq) {
  sock.push({ type: "calculation_started", client_sequence: seq, working_sequence: ws, generation: ws, calculation_id: `calc-${ws}` });
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
    session.update({ ...DOC, vessel: { name: "W", dwt: 82000 }, hireRate: 15000 });
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
    session.update({ ...DOC, hireRate: 1 });
    session.update({ ...DOC, hireRate: 2 });
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
    session.update({ ...DOC, hireRate: 1 });
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
    session.update({ ...DOC, hireRate: 1 });
    ack(sock, 1);
    session.save();
    sock.push({ type: "save_started", working_sequence: 1 });
    sock.drop(); // save_completed never reaches this socket
    expect(session.getSnapshot().saveState).toBe("OFFLINE");
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    const s2 = server.last;
    expect(s2).not.toBe(sock);
    s2.accept();
    expect(server.ofType("resume")[0]).toMatchObject({ session_id: "sess-1", last_client_sequence: 1, last_working_sequence: 1 });
    expect(session.getSnapshot().saveState).toBe("RECOVERING");
    s2.push({ type: "resumed", ...sessionState({ working_sequence: 1, last_client_sequence: 1, persisted_version: 2, dirty: false, sheet: { ...DOC, hireRate: 1 } }) });
    expect(session.getSnapshot()).toMatchObject({ saveState: "SAVED", persistedVersion: 2, conflict: null });
  });

  it("replays unacknowledged patches after a reconnect (and drops those the server already applied)", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    session.update({ ...DOC, hireRate: 1 }); // seq 1
    session.update({ ...DOC, hireRate: 2 }); // seq 2
    sock.drop(); // no acks
    session.update({ ...DOC, hireRate: 3 }); // offline: diffed after resume
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    const s2 = server.last;
    s2.accept();
    // The server applied seq 1 before the drop; seq 2 was lost.
    s2.push({ type: "resumed", ...sessionState({ working_sequence: 1, last_client_sequence: 1, dirty: true, sheet: { ...DOC, hireRate: 1 } }) });
    const replay = s2.sent.filter((m) => m.type === "patch");
    expect(replay.map((p) => p.client_sequence)).toEqual([2, 3]);
    expect(replay[1]).toMatchObject({ ops: [{ op: "set", path: "/hireRate", value: 3 }] });
    expect(session.getSnapshot().conflict).toBeNull();
  });

  it("never assumes state after a resume into a different session with unsaved local edits: CONFLICT", async () => {
    const server = new FakeServer();
    const { session, sock } = await openSession(server);
    session.update({ ...DOC, hireRate: 5 });
    sock.drop();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    server.last.accept();
    server.last.push({ type: "resumed", ...sessionState({ session_id: "sess-OTHER", sheet: { ...DOC, hireRate: 9 } }) });
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

  it("conflict flow: VERSION_CONFLICT shows the differences; 'keep my changes' rebases them on the saved version", async () => {
    const server = new FakeServer();
    const saved = { ...DOC, hireRate: 900 };
    const { session, sock } = await openSession(server, { deps: { loadSavedDoc: async () => ({ data: saved, version: 3 }) } });
    session.update({ ...DOC, hireRate: 100 });
    ack(sock, 1);
    session.save();
    sock.push({ type: "save_failed", working_sequence: 1, code: "VERSION_CONFLICT", retryable: false });
    sock.push({ type: "conflict", code: "VERSION_CONFLICT", current_version: 3, expected_version: 1, fatal: false });
    await settle();
    expect(session.getSnapshot().saveState).toBe("CONFLICT");
    expect(session.getSnapshot().conflict).toMatchObject({ reason: "VERSION_CONFLICT", currentVersion: 3, differences: ["/hireRate"] });
    session.update({ ...DOC, hireRate: 111 }); // edits during a conflict are not sent
    expect(server.ofType("patch")).toHaveLength(1);

    await session.resolveConflict("reapply");
    // 1) working sheet := saved version
    expect(lastPatch(server)).toMatchObject({ client_sequence: 2, ops: [{ op: "set", path: "/hireRate", value: 900 }] });
    ack(sock, 2);
    await vi.advanceTimersByTimeAsync(200);
    await settle();
    // 2) reopen: the server adopts version 3 as the base
    const s2 = server.last;
    expect(s2).not.toBe(sock);
    s2.accept();
    expect(server.ofType("connect").at(-1)).toMatchObject({ take_over: false });
    s2.push({ type: "connected", ...sessionState({ session_id: "sess-1", working_sequence: 2, last_client_sequence: 2, persisted_version: 3, dirty: false, sheet: saved }) });
    // 3) my change (as of the conflict) goes on top of the new base
    expect(lastPatch(server)).toMatchObject({ client_sequence: 3, ops: [{ op: "set", path: "/hireRate", value: 111 }] });
    expect(session.getSnapshot().conflict).toBeNull();
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
    s2.push({ type: "connected", ...sessionState() });
    expect(tab2.getSnapshot().role).toBe("owner");
    expect(tab1.getSnapshot().role).toBe("readonly"); // told at once over BroadcastChannel
    // Even without the channel, the server rejects the old tab's write:
    sock.push({ type: "conflict", code: "STALE_FENCE", fatal: true });
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
    session.update({ ...DOC, hireRate: 1, notes: "n" });
    sock.push({ type: "error", code: "INVALID_PATCH", message: "x", retryable: false, fatal: false, client_sequence: 1, path: "/notes" });
    expect(lastPatch(server)).toMatchObject({ client_sequence: 1, ops: [{ op: "set", path: "/hireRate", value: 1 }] });
  });
});

describe("load normalisation", () => {
  it("opening a sheet sends nothing and stays SAVED until the user really edits; then the edit carries everything", async () => {
    const server = new FakeServer();
    // The page's document differs from the server copy only by values the app
    // recomputed on load (e.g. a derived sea time).
    const loaded = { ...DOC, sequence: [{ id: 1, seaTime: 2.5 }] };
    const { session } = await openSession(server, { doc: loaded });
    session.update(loaded);
    session.flush();
    expect(server.ofType("patch")).toHaveLength(0);
    expect(session.getSnapshot().saveState).toBe("SAVED");
    session.update({ ...loaded, hireRate: 15000 }); // a real edit
    expect(lastPatch(server).ops).toEqual([
      { op: "set", path: "/sequence/0/seaTime", value: 2.5 },
      { op: "set", path: "/hireRate", value: 15000 },
    ]);
    expect(session.getSnapshot().saveState).toBe("LOCAL_ONLY");
  });
});
