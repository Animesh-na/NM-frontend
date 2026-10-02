/**
 * Voyage calculation session (M7): the browser side of the server-authoritative
 * calculation session (ws.v1). A small external store (useSyncExternalStore)
 * holding the session's sequence state, pending patches, latest server result
 * and the save state machine. Components never talk to the socket.
 *
 * Model:
 * - serverDoc: the sheet as the server has it (connected/resumed sheet plus
 *   every acknowledged patch).
 * - sentDoc: serverDoc plus the patches sent but not yet acknowledged; new
 *   patches are diffs from sentDoc to the user's current document.
 * - client_sequence is per session: next = last acknowledged + 1. A resend of
 *   the last patch is answered identically by the server (idempotent).
 * - Results older than the latest acknowledged working_sequence are ignored.
 * - "Saved" only on save_completed, or on a resume reporting no unsaved edits.
 */
import type { CalculationResponse } from "@/contracts/calc/types.generated";
import type { ServerMessage } from "@/contracts/ws/protocol.generated";
import { CalculationSocket, type SocketDeps, type SocketStatus } from "@/transport/calculationSocket";
import { projectDocument, type PatchOp } from "./patchAllowlist";
import { applyOps, diffDocuments, jsonEqual, planPatch } from "./patchDiff";
import { saveReducer, type SaveEvent, type SaveState } from "./saveState";
import type { TabCoordinator } from "./tabCoordinator";

export type SessionRole = "starting" | "owner" | "readonly" | "stopped";

export type ConflictReason = "VERSION_CONFLICT" | "RESUME_MISMATCH" | "ENGINE_VERSION_CHANGED";

export interface ConflictInfo {
  reason: ConflictReason;
  currentVersion?: number;
  expectedVersion?: number;
  serverDoc: unknown | null; // the newer saved version (null while loading)
  localDoc: unknown;
  differences: string[]; // changed paths, for display
}

export interface SessionSnapshot {
  role: SessionRole;
  connection: SocketStatus;
  saveState: SaveState;
  sessionId: string | null;
  persistedVersion: number | null;
  workingSequence: number;
  calculating: boolean;
  result: CalculationResponse | null;
  resultWorkingSequence: number | null;
  conflict: ConflictInfo | null;
  /** The server holds newer unsaved edits than the page loaded: hydrate the UI from this. */
  recoveredDoc: unknown | null;
  heldPaths: string[]; // edits held back (invalid for now)
  notice: string | null; // last human-readable problem
}

export interface SessionDeps {
  socket: SocketDeps;
  /** Latest saved sheet from PostgreSQL (REST), for the conflict view. */
  loadSavedDoc(sheetId: string): Promise<{ data: unknown; version: number | null }>;
  tabs?: TabCoordinator;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

interface Pending {
  seq: number;
  ops: PatchOp[];
  sent: boolean;
}

const MAX_DIFF_PATHS = 12;

export class VoyageSession {
  private socket: CalculationSocket | null = null;
  private listeners = new Set<() => void>();
  private snap: SessionSnapshot;

  private localDoc: unknown;
  private serverDoc: unknown = null;
  private sentDoc: unknown = null;
  private pending: Pending[] = [];
  private lastAcked = 0;
  private nextSeq = 1;
  private savedSequence = 0;
  private takeOver = false;
  private ackEngine = false;
  private saveRequested = false;
  private resendTimer: unknown = null;
  private afterResumeDoc: unknown | null = null; // reapply flow: diff to send once resumed
  // The document as the page loaded it. Differences between it and the
  // server copy come from the app normalising/recomputing on load, not from
  // the user: like the REST flow, they are not sent (and not "unsaved") until
  // the user really edits, then travel with that edit.
  private quietDoc: unknown | null;

  constructor(
    readonly sheetId: string,
    readonly segment: "dry_bulk" | "tanker",
    initialDoc: unknown,
    private readonly deps: SessionDeps,
  ) {
    this.localDoc = projectDocument(initialDoc);
    this.quietDoc = this.localDoc;
    deps.tabs?.onTakenOver(() => this.onConflict("STALE_FENCE"));
    this.snap = {
      role: "starting", connection: "idle", saveState: "RECOVERING", sessionId: null, persistedVersion: null,
      workingSequence: 0, calculating: false, result: null, resultWorkingSequence: null, conflict: null,
      recoveredDoc: null, heldPaths: [], notice: null,
    };
  }

  // ── store ────────────────────────────────────────────────────────────────
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): SessionSnapshot => this.snap;
  private set(patch: Partial<SessionSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }
  private event(e: SaveEvent) {
    const next = saveReducer(this.snap.saveState, e);
    if (next !== this.snap.saveState) this.set({ saveState: next });
  }
  private get unsaved(): boolean {
    return this.pending.length > 0 || this.snap.workingSequence > this.savedSequence || (!this.quiet && !jsonEqual(this.sentDoc, this.localDoc));
  }
  private get quiet(): boolean {
    if (this.quietDoc !== null && !jsonEqual(this.localDoc, this.quietDoc)) this.quietDoc = null; // a real edit
    return this.quietDoc !== null;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────
  async start(): Promise<void> {
    const tabs = this.deps.tabs;
    if (tabs && (await tabs.otherOwnerAlive())) {
      this.set({ role: "readonly", notice: "This sheet is being edited in another tab." });
      return;
    }
    this.connect(false);
  }

  /** "Take over editing" (D-006). */
  takeOverEditing(): void {
    if (this.snap.role === "owner") return;
    this.socket?.stop();
    this.socket = null;
    this.snap = { ...this.snap, sessionId: null };
    this.pending = [];
    this.connect(true);
  }

  dispose(): void {
    if (this.resendTimer !== null) this.deps.clearTimeout(this.resendTimer);
    this.flush();
    this.socket?.stop(1000, "closed");
    this.socket = null;
    this.deps.tabs?.close();
    this.listeners.clear();
  }

  private connect(takeOver: boolean) {
    this.takeOver = takeOver;
    this.set({ role: "starting" });
    this.socket = new CalculationSocket(this.sheetId, this.segment, {
      onOpen: () => this.onOpen(),
      onMessage: (m) => this.onMessage(m),
      onStatus: (s, detail) => this.onStatus(s, detail),
    }, this.deps.socket);
    this.socket.start();
  }

  private onStatus(s: SocketStatus, detail?: { ticketStatus?: number }) {
    this.set({ connection: s });
    if (s === "waiting" && this.snap.role === "owner") this.event({ type: "DISCONNECTED" });
    if (s === "connecting" && this.snap.sessionId) this.event({ type: "RECONNECTING" });
    if (s === "stopped" && detail?.ticketStatus) {
      this.set({ role: "stopped", notice: detail.ticketStatus === 403 ? "You can't edit this sheet." : "Sign in again to keep editing." });
    }
  }

  private onOpen() {
    const s = this.socket;
    if (!s) return;
    if (this.snap.sessionId) {
      s.send({
        type: "resume", sheet_id: this.sheetId, segment: this.segment, session_id: this.snap.sessionId,
        last_client_sequence: this.lastAcked, last_working_sequence: this.snap.workingSequence,
        acknowledge_engine_change: this.ackEngine, take_over: true, // our own (possibly stale) connection
      });
    } else {
      s.send({ type: "connect", sheet_id: this.sheetId, segment: this.segment, acknowledge_engine_change: this.ackEngine, take_over: this.takeOver });
    }
  }

  // ── editing ──────────────────────────────────────────────────────────────
  /** The user's current document (call debounced). Sends what changed. */
  update(doc: unknown): void {
    this.localDoc = projectDocument(doc);
    if (this.snap.role !== "owner" || this.snap.conflict || this.quiet) return;
    if (!jsonEqual(this.sentDoc, this.localDoc)) this.event({ type: "LOCAL_EDIT" });
    this.sendDiff();
  }

  /** Sends anything not yet sent (blur, Enter, save, unload). */
  flush(): void {
    if (this.snap.role === "owner" && !this.snap.conflict) this.sendDiff();
  }

  save(): void {
    if (this.snap.role !== "owner" || this.snap.conflict) return;
    this.flush();
    this.saveRequested = !(this.socket?.send({ type: "save" }) ?? false);
  }

  private sendDiff() {
    if (this.sentDoc === null || this.quiet) return; // not open yet / no user edit yet
    for (let guard = 0; guard < 20; guard++) {
      const plan = planPatch(this.sentDoc, this.localDoc);
      this.set({ heldPaths: plan.held.map((o) => o.path) });
      if (plan.ops.length === 0) return;
      const p: Pending = { seq: this.nextSeq++, ops: plan.ops, sent: false };
      this.pending.push(p);
      this.sentDoc = applyOps(this.sentDoc, plan.ops);
      this.transmit(p);
      if (!plan.overflow) return;
    }
  }

  private transmit(p: Pending) {
    p.sent = this.socket?.send({ type: "patch", client_sequence: p.seq, ops: p.ops as never }) ?? false;
  }

  // ── server messages ──────────────────────────────────────────────────────
  private onMessage(m: ServerMessage) {
    switch (m.type) {
      case "connected":
      case "resumed":
        return this.onOpened(m);
      case "calculation_started":
        return this.onAck(m.client_sequence, m.working_sequence);
      case "calculation_result":
        if (m.working_sequence < this.snap.workingSequence) return; // stale: ignore
        this.set({ result: m.result, resultWorkingSequence: m.working_sequence, calculating: false });
        return this.event({ type: "RESULT", dirty: this.unsaved });
      case "calculation_superseded":
        return;
      case "save_started":
        return this.event({ type: "SAVE_STARTED" });
      case "save_completed":
        this.savedSequence = Math.max(this.savedSequence, m.working_sequence);
        this.set({ persistedVersion: m.persisted_version });
        this.deps.tabs?.announceSaved(m.persisted_version);
        return this.event({ type: "SAVE_COMPLETED", dirty: this.unsaved });
      case "save_failed":
        if (m.code !== "VERSION_CONFLICT") {
          this.set({ notice: m.retryable ? "Save failed — your changes are kept and will be retried." : "Save failed." });
          this.event({ type: "SAVE_FAILED" });
        }
        return;
      case "conflict":
        return this.onConflict(m.code, m.current_version, m.expected_version);
      case "error":
        return this.onError(m.code, m.client_sequence, m.path, m.fatal, m.retryable);
      case "pong":
        return;
    }
  }

  private onOpened(m: Extract<ServerMessage, { type: "connected" | "resumed" }>) {
    this.socket?.setHeartbeat(m.limits.heartbeat_seconds);
    const sameSession = this.snap.sessionId !== null && m.session_id === this.snap.sessionId;
    const L = m.last_client_sequence;
    if (sameSession) {
      // Patches the server applied while we lost the acknowledgement.
      for (const p of this.pending.filter((q) => q.seq <= L)) this.serverDoc = applyOps(this.serverDoc, p.ops);
      this.pending = this.pending.filter((p) => p.seq > L);
      if (!jsonEqual(this.serverDoc, m.sheet)) return this.mismatch(m);
    } else if (this.snap.sessionId !== null || this.pending.length > 0) {
      // A different session (rebuilt or taken over): never assume our state is
      // current. Adopt it only if we have nothing unsaved that it lacks.
      if (!jsonEqual(projectDocument(m.sheet), this.localDoc) && this.unsavedLocally()) return this.mismatch(m);
      this.pending = [];
    }
    this.lastAcked = L;
    this.nextSeq = L + 1 + this.pending.length;
    this.serverDoc = m.sheet;
    this.savedSequence = m.dirty ? Math.min(this.savedSequence, m.working_sequence - 1) : m.working_sequence;
    const first = this.snap.sessionId === null;
    this.set({ role: "owner", sessionId: m.session_id, persistedVersion: m.persisted_version, workingSequence: m.working_sequence, notice: null });
    this.deps.tabs?.claimOwnership(this.takeOver);
    this.takeOver = false;

    if (first && m.dirty && !jsonEqual(projectDocument(m.sheet), this.localDoc)) {
      // The server has unsaved edits newer than what this page loaded
      // (another tab, a crash): show them instead of overwriting them.
      this.localDoc = projectDocument(m.sheet);
      this.quietDoc = this.localDoc;
      this.set({ recoveredDoc: m.sheet });
    }
    // Rebuild the send model and replay unacknowledged patches in order.
    this.sentDoc = this.serverDoc;
    for (const p of this.pending) {
      this.sentDoc = applyOps(this.sentDoc, p.ops);
      this.transmit(p);
    }
    if (this.afterResumeDoc !== null) {
      this.localDoc = this.afterResumeDoc;
      this.afterResumeDoc = null;
    }
    this.sendDiff();
    this.event({ type: "RESUMED", dirty: m.dirty || this.unsaved });
    if (this.saveRequested) {
      this.saveRequested = false;
      this.save();
    }
  }

  private unsavedLocally(): boolean {
    return this.pending.length > 0 || this.snap.workingSequence > this.savedSequence || !jsonEqual(this.serverDoc, this.localDoc);
  }

  private mismatch(m: { sheet: unknown; persisted_version: number; session_id: string; last_client_sequence: number; working_sequence: number }) {
    this.serverDoc = m.sheet;
    this.sentDoc = m.sheet;
    this.lastAcked = m.last_client_sequence;
    this.nextSeq = this.lastAcked + 1;
    this.set({ role: "owner", sessionId: m.session_id, persistedVersion: m.persisted_version, workingSequence: m.working_sequence });
    this.raiseConflict({ reason: "RESUME_MISMATCH", serverDoc: m.sheet });
  }

  private onAck(clientSeq: number, workingSeq: number) {
    let acked = false;
    for (const p of this.pending) {
      if (p.seq <= clientSeq) {
        this.serverDoc = applyOps(this.serverDoc, p.ops);
        acked = true;
      }
    }
    this.pending = this.pending.filter((p) => p.seq > clientSeq);
    this.lastAcked = Math.max(this.lastAcked, clientSeq);
    this.set({ workingSequence: Math.max(this.snap.workingSequence, workingSeq), calculating: true });
    if (acked) this.event({ type: "PATCH_ACKED", dirty: true });
  }

  private onConflict(code: string, current?: number, expected?: number) {
    switch (code) {
      case "LEASE_HELD":
      case "STALE_FENCE":
        // Another tab/device edits this sheet now: read-only, no silent overwrite.
        this.socket?.stop(1000, "read-only");
        this.socket = null;
        this.set({
          role: "readonly",
          notice: code === "STALE_FENCE" ? "Editing moved to another tab or device." : "This sheet is being edited in another tab or device.",
        });
        this.deps.tabs?.release();
        return;
      case "VERSION_CONFLICT":
        return this.raiseConflict({ reason: "VERSION_CONFLICT", currentVersion: current, expectedVersion: expected, serverDoc: null });
      case "ENGINE_VERSION_CHANGED":
        return this.raiseConflict({ reason: "ENGINE_VERSION_CHANGED", serverDoc: null });
    }
  }

  private raiseConflict(c: { reason: ConflictReason; currentVersion?: number; expectedVersion?: number; serverDoc: unknown | null }) {
    const info: ConflictInfo = { ...c, localDoc: this.localDoc, differences: [] };
    this.set({ conflict: info });
    this.event({ type: "CONFLICT" });
    if (c.reason === "VERSION_CONFLICT" && c.serverDoc === null) {
      void this.deps.loadSavedDoc(this.sheetId).then(({ data }) => {
        if (this.snap.conflict !== info) return;
        const serverDoc = projectDocument(data);
        this.set({ conflict: { ...info, serverDoc, differences: changedPaths(serverDoc, this.localDoc) } });
      }, () => undefined);
    } else if (c.serverDoc !== null) {
      const serverDoc = projectDocument(c.serverDoc);
      this.set({ conflict: { ...info, serverDoc, differences: changedPaths(serverDoc, this.localDoc) } });
    }
  }

  private onError(code: string, clientSeq?: number, path?: string, fatal?: boolean, retryable?: boolean) {
    if (code === "INVALID_PATCH" && clientSeq !== undefined) {
      // The server rejected this patch (and expects the same sequence again):
      // rebuild from what it has acknowledged and hold the offending path.
      this.pending = this.pending.filter((p) => p.seq < clientSeq);
      this.nextSeq = clientSeq;
      this.sentDoc = this.pending.reduce((d, p) => applyOps(d, p.ops), this.serverDoc);
      if (path) {
        this.localDoc = applyOps(this.localDoc, [{ op: "set", path, value: valueAt(this.sentDoc, path) }]);
        this.set({ notice: `A change was not accepted (${path}).` });
      }
      this.sendDiff();
      return;
    }
    if (code === "UNAVAILABLE" && clientSeq !== undefined && retryable) {
      // Not applied: resend the same patch shortly (same sequence).
      if (this.resendTimer === null) {
        this.resendTimer = this.deps.setTimeout(() => {
          this.resendTimer = null;
          for (const p of this.pending) this.transmit(p);
        }, 1000);
      }
      return;
    }
    if (code === "ENGINE_VERSION_NEWER") {
      this.set({ notice: "This sheet was calculated by a newer version; reconnecting." });
      return;
    }
    if (fatal && code === "UNAUTHORIZED" && !retryable) {
      this.socket?.stop();
      this.set({ role: "stopped", notice: "Your access to this sheet changed." });
    }
    // Retryable fatal errors (auth expiry, unavailable): the socket reconnects and resumes.
  }

  // ── conflict resolution ──────────────────────────────────────────────────
  /**
   * reload: discard local edits and continue from the saved server version.
   * reapply: continue from the saved server version with the local edits on
   * top (a new patch against the new base). Never silent: the user chooses.
   */
  async resolveConflict(choice: "reload" | "reapply" | "acknowledge-engine"): Promise<void> {
    const c = this.snap.conflict;
    if (!c) return;
    if (choice === "acknowledge-engine") {
      this.ackEngine = true;
      this.set({ conflict: null });
      this.event({ type: "CONFLICT_RESOLVED", dirty: this.unsaved });
      this.reopen();
      return;
    }
    const saved = c.serverDoc ?? projectDocument((await this.deps.loadSavedDoc(this.sheetId)).data);
    const mine = this.localDoc; // including edits made while the conflict was shown
    // 1) Make the server's working sheet equal the saved version…
    this.set({ conflict: null });
    this.localDoc = saved;
    this.sendDiff();
    // 2) …then reopen: the server adopts the saved version as the new base
    //    (working sheet equals saved data, D-034), and
    // 3) for reapply, the local edits are sent as a patch on that base.
    this.afterResumeDoc = choice === "reapply" ? mine : null;
    this.set({ recoveredDoc: choice === "reload" ? saved : mine });
    this.event({ type: "CONFLICT_RESOLVED", dirty: choice === "reapply" });
    this.reopenAfterAcks();
  }

  private reopenAfterAcks(tries = 0) {
    if (this.pending.length === 0 || tries > 50) return this.reopen();
    this.deps.setTimeout(() => this.reopenAfterAcks(tries + 1), 100);
  }

  private reopen() {
    // A fresh connection: the server reconciles the session with PostgreSQL.
    this.socket?.stop(1000, "reopen");
    this.socket = null;
    this.connect(false);
  }

  /** The app hydrated recoveredDoc into its state. */
  clearRecovered(): void {
    if (this.snap.recoveredDoc !== null) this.set({ recoveredDoc: null });
  }
}

function changedPaths(a: unknown, b: unknown): string[] {
  const ops = diffDocuments(a, b);
  return ops.slice(0, MAX_DIFF_PATHS).map((o) => o.path);
}

function valueAt(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const raw of path.slice(1).split("/")) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}
