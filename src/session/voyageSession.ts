/**
 * Voyage calculation session (M7): the browser side of the server-authoritative
 * calculation session (ws.v1). A small external store (useSyncExternalStore)
 * holding the session's sequence state, pending patches, latest server result
 * and the save state machine. Components never talk to the socket.
 *
 * Model:
 * - serverDoc: the sheet as the server has it (connected/resumed sheet plus
 *   every acknowledged patch). sentDoc: serverDoc plus the patches sent but
 *   not yet acknowledged; new patches are diffs from sentDoc to the user's
 *   current document (localDoc).
 * - client_sequence is per session: next = last acknowledged + 1, never lower.
 * - Results older than the latest acknowledged working_sequence are ignored.
 * - "Saved" only on save_completed, or on a resume reporting no unsaved edits.
 * - Whenever the server's copy has moved since this tab last knew it (another
 *   tab or device saved, a newer session), the tab adopts it and reloads the
 *   UI if the user has no unsent edits, or raises a conflict if they do —
 *   it never diffs old local data onto a newer server copy.
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
  serverDoc: unknown | null; // the newer server version (null while loading)
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
  /** A newer server document the UI must load (another tab/device, a crash, a resolved conflict). */
  recoveredDoc: unknown | null;
  heldPaths: string[]; // edits held back (incomplete input, or rejected by the server)
  notice: string | null; // last human-readable problem
}

export interface SessionDeps {
  socket: SocketDeps;
  /** Latest saved sheet from PostgreSQL (REST), for the conflict view. */
  loadSavedDoc(sheetId: string): Promise<{ data: unknown; version: number | null }>;
  tabs?: TabCoordinator;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
  now?: () => number;
}

interface Pending {
  seq: number;
  ops: PatchOp[];
  sent: boolean;
}

interface Resolving {
  choice: "reload" | "reapply";
  revertSeq: number | null; // the patch making the working sheet equal the saved one
  reopened: boolean; // the outcome is judged only on the open that answers our own reopen
}

const MAX_DIFF_PATHS = 12;

/**
 * Sequence-row fields the browser derives from the primary inputs and stores in
 * the sheet; the Go engine recomputes its own leg times and never reads them
 * (backend TestBrowserDerivedRowFieldsAreNotEngineInputs, D-055). A server
 * result therefore belongs to the sheet on screen even when only these differ
 * (they are recomputed on load and not sent until the user edits, D-044).
 */
export const BROWSER_DERIVED_ROW_FIELDS = ["seaTime", "baseSeaTime", "seaMarginTime", "ecaTime", "totalLegTime", "calculatedPortDays", "legDepartureUtc", "legArrivalUtc"] as const;

function withoutDerivedRowFields(doc: unknown): unknown {
  if (doc === null || typeof doc !== "object") return doc;
  const d = doc as Record<string, unknown>;
  if (!Array.isArray(d.sequence)) return doc;
  return {
    ...d,
    sequence: d.sequence.map((row) => {
      if (row === null || typeof row !== "object") return row;
      const r = { ...(row as Record<string, unknown>) };
      for (const f of BROWSER_DERIVED_ROW_FIELDS) delete r[f];
      return r;
    }),
  };
}
/** Kept for tests that wait out app start-up; load normalisation is detected by user input, not time. */
export const SETTLE_MS = 2500;
const MAX_RESYNCS = 5;

export class VoyageSession {
  private socket: CalculationSocket | null = null;
  private listeners = new Set<() => void>();
  private snap: SessionSnapshot;
  private disposed = false;

  private readonly loadedDoc: unknown; // the page's REST load (raw saved data)
  private localDoc: unknown;
  private serverDoc: unknown = null;
  private sentDoc: unknown = null;
  private quietDoc: unknown | null; // see `quiet`
  private userEdited = false; // the user changed something since the last (re)load
  private pending: Pending[] = [];
  private lastAcked = 0;
  private nextSeq = 1;
  private savedSequence = 0;
  private connectionId: string | null = null;
  private takeOver = false;
  private ackEngine = false;
  private saveRequested = false;
  private resolving: Resolving | null = null;
  private resendTimer: unknown = null;
  private resyncs = 0;
  private held = new Map<string, string>(); // path → JSON value the server rejected
  private docProvider: (() => unknown) | null = null;

  constructor(
    readonly sheetId: string,
    readonly segment: "dry_bulk" | "tanker",
    initialDoc: unknown,
    private readonly deps: SessionDeps,
    loadedDoc?: unknown,
  ) {
    this.localDoc = projectDocument(initialDoc);
    this.loadedDoc = projectDocument(loadedDoc ?? initialDoc);
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
    if (this.disposed) return;
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }
  private event(e: SaveEvent) {
    const next = saveReducer(this.snap.saveState, e);
    if (next !== this.snap.saveState) this.set({ saveState: next });
  }

  /**
   * Load normalisation: until the user really edits (markUserEdit: an input,
   * change, key or control click in the editor, or an explicit save), changes
   * to the document come from the app loading and recomputing values. They
   * are absorbed — not sent, not "unsaved" — and travel with the first real
   * edit, as with a REST save. Detection is by user input, never by time, so
   * a real edit is never swallowed.
   */
  private get quiet(): boolean {
    if (this.quietDoc === null) return false;
    if (!this.userEdited) {
      this.quietDoc = this.localDoc;
      return true;
    }
    this.quietDoc = null;
    return false;
  }

  /**
   * The user changed something (or saved): from now on every change is sent.
   * Contract: any editor that changes the sheet without an input, change,
   * key or control-click event in the editor panels (drag-and-drop, a custom
   * pointer-only control, an import) must call this itself.
   */
  markUserEdit(): void {
    if (this.disposed || this.snap.role === "readonly") return;
    this.userEdited = true;
  }
  private get unsaved(): boolean {
    return this.pending.length > 0 || this.snap.workingSequence > this.savedSequence || (!this.quiet && !jsonEqual(this.sentDoc, this.localDoc));
  }
  private get hasUnsentEdits(): boolean {
    return this.pending.length > 0 || (this.userEdited && !jsonEqual(this.serverDoc ?? this.loadedDoc, this.localDoc));
  }

  // ── lifecycle ────────────────────────────────────────────────────────────
  async start(): Promise<void> {
    const tabs = this.deps.tabs;
    if (tabs && (await tabs.otherOwnerAlive())) {
      if (this.disposed) return;
      this.set({ role: "readonly", notice: "This sheet is being edited in another tab." });
      return;
    }
    if (this.disposed) return;
    this.connect(false);
  }

  /** Supplies the latest document at dispose (edits still in the debounce). */
  setDocumentProvider(fn: (() => unknown) | null): void {
    this.docProvider = fn;
  }

  /** "Take over editing" (D-006). */
  takeOverEditing(): void {
    if (this.disposed || this.snap.role === "owner") return;
    this.clearTimers();
    this.socket?.stop();
    this.socket = null;
    this.pending = [];
    this.snap = { ...this.snap, sessionId: null };
    this.connect(true);
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.docProvider) {
      try {
        this.update(this.docProvider());
      } catch {
        /* best effort */
      }
    }
    this.flush();
    this.disposed = true;
    this.clearTimers();
    this.socket?.stop(1000, "closed");
    this.socket = null;
    this.deps.tabs?.close();
    this.listeners.clear();
  }

  private clearTimers() {
    if (this.resendTimer !== null) this.deps.clearTimeout(this.resendTimer);
    this.resendTimer = null;
  }

  private connect(takeOver: boolean) {
    if (this.disposed) return;
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
    if (this.disposed) return;
    this.set({ connection: s });
    if (s === "waiting" && this.snap.role === "owner") this.event({ type: "DISCONNECTED" });
    if (s === "connecting" && this.snap.sessionId) this.event({ type: "RECONNECTING" });
    if (s === "stopped" && detail?.ticketStatus) {
      this.set({ role: "stopped", notice: detail.ticketStatus === 403 ? "You can't edit this sheet." : "Sign in again to keep editing." });
    }
  }

  private onOpen() {
    const s = this.socket;
    if (!s || this.disposed) return;
    if (this.snap.sessionId) {
      s.send({
        type: "resume", sheet_id: this.sheetId, segment: this.segment, session_id: this.snap.sessionId,
        last_client_sequence: this.lastAcked, last_working_sequence: this.snap.workingSequence,
        acknowledge_engine_change: this.ackEngine,
        // Reclaim only our own previous connection (dead with the network) —
        // never another tab's or device's later take over.
        ...(this.connectionId ? { take_over_from: this.connectionId } : {}),
      });
    } else {
      s.send({ type: "connect", sheet_id: this.sheetId, segment: this.segment, acknowledge_engine_change: this.ackEngine, take_over: this.takeOver });
    }
  }

  // ── editing ──────────────────────────────────────────────────────────────
  /** The user's current document (call debounced). Sends what changed. */
  update(doc: unknown): void {
    if (this.disposed) return;
    this.localDoc = projectDocument(doc);
    if (this.snap.role !== "owner" || this.snap.conflict || this.resolving || this.quiet) return;
    if (!jsonEqual(this.sentDoc, this.localDoc)) this.event({ type: "LOCAL_EDIT" });
    this.sendDiff();
  }

  /**
   * The server result computed for exactly `doc` (the sheet on screen), or
   * null while it is pending, stale or unavailable (M10 stage 3): the latest
   * server generation has its result, nothing is unacknowledged, and the
   * server's copy of the sheet equals `doc` — ignoring the row values the
   * browser derives on load and the engine never reads (BROWSER_DERIVED_ROW_FIELDS).
   */
  currentResult(doc: unknown): CalculationResponse | null {
    const s = this.snap;
    if (this.disposed || !s.result || s.calculating || s.resultWorkingSequence !== s.workingSequence) return null;
    if (this.pending.length > 0 || this.serverDoc === null) return null;
    return jsonEqual(withoutDerivedRowFields(this.serverDoc), withoutDerivedRowFields(projectDocument(doc))) ? s.result : null;
  }

  /** Sends anything not yet sent (blur, Enter, save, unload). */
  flush(): void {
    if (!this.disposed && this.snap.role === "owner" && !this.snap.conflict && !this.resolving) this.sendDiff();
  }

  save(): void {
    if (this.disposed || this.snap.role !== "owner" || this.snap.conflict) return;
    if (this.resolving) {
      this.saveRequested = true;
      return;
    }
    this.markUserEdit(); // an explicit save sends everything, like the REST save
    this.flush();
    this.saveRequested = !(this.socket?.send({ type: "save" }) ?? false);
  }

  private isHeld = (op: PatchOp): boolean => {
    const v = this.held.get(op.path);
    return v !== undefined && op.op === "set" && v === JSON.stringify(op.value);
  };

  private sendDiff(target: unknown = this.localDoc, force = false): number | null {
    if (this.sentDoc === null || this.disposed) return null; // not open yet: sent after (re)open
    if (!force && this.quiet) return null;
    let last: number | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const plan = planPatch(this.sentDoc, target, this.isHeld);
      this.set({ heldPaths: plan.held.map((o) => o.path) });
      if (plan.ops.length === 0) return last;
      const p: Pending = { seq: this.nextSeq++, ops: plan.ops, sent: false };
      this.pending.push(p);
      this.sentDoc = applyOps(this.sentDoc, plan.ops);
      this.transmit(p);
      last = p.seq;
      if (!plan.overflow) return last;
    }
    return last;
  }

  private transmit(p: Pending) {
    p.sent = this.socket?.send({ type: "patch", client_sequence: p.seq, ops: p.ops as never }) ?? false;
  }

  // ── server messages ──────────────────────────────────────────────────────
  private onMessage(m: ServerMessage) {
    if (this.disposed) return;
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
        return this.onError(m);
      case "pong":
        return;
      case "reconnect":
        // The server instance is draining (M9): it still sends the in-flight
        // result and saves our edits before closing; the transport resumes
        // elsewhere right after the close.
        return;
    }
  }

  private onOpened(m: Extract<ServerMessage, { type: "connected" | "resumed" }>) {
    this.clearTimers();
    this.socket?.setHeartbeat(m.limits.heartbeat_seconds);
    this.socket?.markHealthy();
    this.connectionId = m.connection_id;
    const L = m.last_client_sequence;
    const sameSession = this.snap.sessionId !== null && m.session_id === this.snap.sessionId;
    const hadPending = this.pending.length > 0;
    const unsentBefore = this.hasUnsentEdits;
    // What the server copy should be if nothing happened elsewhere: our last
    // known copy plus, on a same-session resume, our patches it reports applied.
    let expected = this.serverDoc ?? this.loadedDoc;
    let remaining = this.pending;
    if (sameSession) {
      for (const p of this.pending.filter((q) => q.seq <= L)) expected = applyOps(expected, p.ops);
      remaining = this.pending.filter((p) => p.seq > L);
    } else {
      remaining = []; // another session's sequence space
    }
    const server = projectDocument(m.sheet);
    if (!jsonEqual(server, projectDocument(expected))) {
      // The server moved: another tab/device saved or took over (its patches
      // share the sequence space, so L alone proves nothing), a newer session,
      // or unsaved edits after a crash. Never assume our work is in there.
      if ((unsentBefore || hadPending) && !(this.resolving && this.resolving.choice === "reload")) return this.mismatch(m);
      this.adopt(m.sheet);
      remaining = [];
    } else {
      this.serverDoc = expected;
    }
    this.pending = remaining;
    this.lastAcked = L;
    this.nextSeq = Math.max(L + 1, (this.pending.at(-1)?.seq ?? L) + 1);
    this.serverDoc = m.sheet;
    this.savedSequence = m.dirty ? Math.min(this.savedSequence, m.working_sequence - 1) : m.working_sequence;
    this.set({ role: "owner", sessionId: m.session_id, persistedVersion: m.persisted_version, workingSequence: m.working_sequence, notice: null });
    this.deps.tabs?.claimOwnership(this.takeOver);
    this.takeOver = false;
    // Rebuild the send model and replay unacknowledged patches in order.
    this.sentDoc = this.serverDoc;
    for (const p of this.pending) {
      this.sentDoc = applyOps(this.sentDoc, p.ops);
      this.transmit(p);
    }
    if (this.resolving?.reopened) {
      if (m.dirty) {
        // The server did not adopt the saved version (it moved again): decide anew.
        this.resolving = null;
        return this.raiseConflict({ reason: "VERSION_CONFLICT", serverDoc: null });
      }
      if (this.resolving.choice === "reapply") this.quietDoc = null; // send my edits on the new base
      this.resolving = null;
    }
    this.sendDiff();
    this.event({ type: "RESUMED", dirty: m.dirty || this.unsaved });
    if (this.saveRequested) {
      this.saveRequested = false;
      this.save();
    }
  }

  /** Take the server document as the truth and reload the UI from it. */
  private adopt(sheet: unknown) {
    this.pending = [];
    this.serverDoc = sheet;
    this.localDoc = projectDocument(sheet);
    this.quietDoc = this.localDoc;
    this.userEdited = false; // the UI re-normalises after hydration
    this.set({ recoveredDoc: sheet });
  }

  private mismatch(m: { sheet: unknown; persisted_version: number; session_id: string; last_client_sequence: number; working_sequence: number }) {
    this.clearTimers();
    this.pending = []; // the edits stay in localDoc, for "keep my changes"
    this.serverDoc = m.sheet;
    this.sentDoc = m.sheet;
    this.lastAcked = m.last_client_sequence;
    this.nextSeq = this.lastAcked + 1;
    this.set({ role: "owner", sessionId: m.session_id, persistedVersion: m.persisted_version, workingSequence: m.working_sequence });
    this.deps.tabs?.claimOwnership(this.takeOver);
    this.takeOver = false;
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
    this.nextSeq = Math.max(this.nextSeq, this.lastAcked + 1);
    this.resyncs = 0;
    this.set({ workingSequence: Math.max(this.snap.workingSequence, workingSeq), calculating: true });
    if (acked && !this.resolving) this.event({ type: "PATCH_ACKED", dirty: true });
    if (this.resolving?.revertSeq != null && clientSeq >= this.resolving.revertSeq) this.reopen();
  }

  private onConflict(code: string, current?: number, expected?: number) {
    switch (code) {
      case "LEASE_HELD":
      case "STALE_FENCE": {
        // Another tab/device edits this sheet now: read-only, no silent overwrite.
        const lost = this.pending.some((p) => !p.sent) || (!this.quiet && !jsonEqual(this.sentDoc ?? this.loadedDoc, this.localDoc));
        this.clearTimers();
        this.socket?.stop(1000, "read-only");
        this.socket = null;
        this.resolving = null;
        const where = code === "STALE_FENCE" ? "Editing moved to another tab or device." : "This sheet is being edited in another tab or device.";
        this.set({ role: "readonly", notice: lost ? `${where} Your latest changes in this tab were not sent.` : where });
        if (lost) this.event({ type: "LOCAL_EDIT" }); // never "Saved" over changes that were not sent
        this.deps.tabs?.release();
        return;
      }
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
        if (this.disposed || this.snap.conflict !== info) return;
        const serverDoc = projectDocument(data);
        this.set({ conflict: { ...info, serverDoc, differences: changedPaths(serverDoc, this.localDoc) } });
      }, () => undefined);
    } else if (c.serverDoc !== null) {
      const serverDoc = projectDocument(c.serverDoc);
      this.set({ conflict: { ...info, serverDoc, differences: changedPaths(serverDoc, this.localDoc) } });
    }
  }

  private onError(m: Extract<ServerMessage, { type: "error" }>) {
    const seq = m.client_sequence;
    if (m.code === "INVALID_PATCH" && m.expected_sequence !== undefined) {
      return this.onSequenceError(m.expected_sequence);
    }
    if (m.code === "INVALID_PATCH" && seq !== undefined) {
      // A validation rejection of patch `seq` (the server expects `seq` again):
      // rebuild from what is acknowledged and hold the rejected values until
      // the user changes them — never resend the same rejected op.
      const rejected = this.pending.find((p) => p.seq === seq);
      const holdOps = m.path ? (rejected?.ops ?? []).filter((o) => o.path === m.path) : rejected?.ops ?? [];
      for (const o of holdOps) if (o.op === "set") this.held.set(o.path, JSON.stringify(o.value));
      if (m.path && holdOps.length === 0) this.held.set(m.path, JSON.stringify(valueAt(this.localDoc, m.path)));
      this.pending = this.pending.filter((p) => p.seq < seq);
      this.nextSeq = Math.max(seq, this.lastAcked + 1);
      this.sentDoc = this.pending.reduce((d, p) => applyOps(d, p.ops), this.serverDoc);
      this.set({ notice: m.path ? `A change was not accepted (${m.path}).` : "A change was not accepted." });
      this.sendDiff();
      return;
    }
    if (m.code === "UNAVAILABLE" && seq !== undefined && m.retryable) {
      // Not applied: resend the unacknowledged patches shortly, in order.
      if (this.resendTimer === null) {
        this.resendTimer = this.deps.setTimeout(() => {
          this.resendTimer = null;
          if (this.disposed) return;
          for (const p of this.pending) if (p.seq > this.lastAcked) this.transmit(p);
        }, 1000);
      }
      return;
    }
    if (m.code === "ENGINE_VERSION_NEWER") {
      this.set({ notice: "This sheet was calculated by a newer version; reconnecting." });
      return;
    }
    if (m.fatal && m.code === "UNAUTHORIZED" && !m.retryable) {
      this.socket?.stop();
      this.set({ role: "stopped", notice: "Your access to this sheet changed." });
    }
    // Retryable fatal errors (auth expiry, unavailable): the socket reconnects and resumes.
  }

  /** The server rejected a patch for its sequence; it accepts `expected` next. */
  private onSequenceError(expected: number) {
    if (this.pending.some((p) => p.seq === expected)) return; // that one is in flight
    if (expected - 1 < this.lastAcked || ++this.resyncs > MAX_RESYNCS) {
      // The server lost acknowledged patches (or we keep disagreeing):
      // resynchronise through a fresh open instead of guessing.
      this.resyncs = 0;
      return this.reopen();
    }
    // The server applied up to expected-1; re-plan everything else from there.
    this.onAck(expected - 1, this.snap.workingSequence);
    this.pending = [];
    this.nextSeq = expected;
    this.sentDoc = this.serverDoc;
    this.sendDiff();
  }

  // ── conflict resolution ──────────────────────────────────────────────────
  /**
   * reload: discard local edits and continue from the saved server version.
   * reapply: continue from the saved server version with the local edits on
   * top (a new patch against the new base). Never silent: the user chooses.
   * The save state is RECOVERING until the server confirms the new base.
   */
  async resolveConflict(choice: "reload" | "reapply" | "acknowledge-engine"): Promise<void> {
    const c = this.snap.conflict;
    if (!c || this.disposed) return;
    if (choice === "acknowledge-engine") {
      this.ackEngine = true;
      this.set({ conflict: null });
      this.event({ type: "CONFLICT_RESOLVED", dirty: this.unsaved });
      this.reopen();
      return;
    }
    let saved = c.serverDoc;
    if (saved === null) saved = projectDocument((await this.deps.loadSavedDoc(this.sheetId)).data);
    if (this.disposed) return;
    this.resolving = { choice, revertSeq: null, reopened: false };
    this.set({ conflict: null });
    this.event({ type: "CONFLICT_RESOLVED", dirty: false });
    if (choice === "reload") {
      this.localDoc = saved;
      this.quietDoc = saved;
      this.userEdited = false; // the UI re-normalises the saved version
      this.set({ recoveredDoc: saved });
    }
    // 1) Make the server's working sheet equal the saved version…
    const last = this.sendDiff(saved, true);
    // 2) …once acknowledged, reopen: the server adopts the saved version as the
    //    new base (working sheet equals saved data, D-034); for reapply, the
    //    local edits then go out as a patch on that base.
    if (last === null) this.reopen();
    else this.resolving.revertSeq = last;
  }

  private reopen() {
    if (this.disposed) return;
    if (this.resolving) this.resolving.reopened = true;
    // A fresh connection: the server reconciles the session with PostgreSQL.
    this.clearTimers();
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
