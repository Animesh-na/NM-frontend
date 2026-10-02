/**
 * Save state machine for the server session (M7).
 *
 * SAVED is only ever entered on `save_completed` (the PostgreSQL commit) or on
 * an authoritative resume that reports no unsaved edits — never because a
 * patch was accepted or a save was queued.
 */
export type SaveState =
  | "LOCAL_ONLY" // edits not yet accepted by the server
  | "CALCULATING" // accepted; the server is calculating (unsaved)
  | "SAVE_PENDING" // a save is queued (save_started), not committed yet
  | "SAVED" // committed in PostgreSQL, no newer edits
  | "SAVE_FAILED" // the last save failed (edits kept)
  | "CONFLICT" // a newer version exists: user decision needed
  | "OFFLINE" // no connection
  | "RECOVERING"; // connecting, reconnecting or resuming

export type SaveEvent =
  | { type: "LOCAL_EDIT" } // a change not yet acknowledged
  | { type: "PATCH_ACKED"; dirty: boolean } // calculation_started for our patch
  | { type: "RESULT"; dirty: boolean } // current calculation finished (never makes it SAVED)
  | { type: "SAVE_STARTED" }
  | { type: "SAVE_COMPLETED"; dirty: boolean } // dirty: edits made after the saved sequence
  | { type: "SAVE_FAILED" }
  | { type: "CONFLICT" }
  | { type: "CONFLICT_RESOLVED"; dirty: boolean }
  | { type: "DISCONNECTED" }
  | { type: "RECONNECTING" }
  | { type: "RESUMED"; dirty: boolean };

export const SAVE_STATES: SaveState[] = [
  "LOCAL_ONLY", "CALCULATING", "SAVE_PENDING", "SAVED", "SAVE_FAILED", "CONFLICT", "OFFLINE", "RECOVERING",
];

export const SAVE_EVENT_TYPES: SaveEvent["type"][] = [
  "LOCAL_EDIT", "PATCH_ACKED", "RESULT", "SAVE_STARTED", "SAVE_COMPLETED", "SAVE_FAILED",
  "CONFLICT", "CONFLICT_RESOLVED", "DISCONNECTED", "RECONNECTING", "RESUMED",
];

type Rule = SaveState | "IGNORE" | ((e: SaveEvent) => SaveState);

/**
 * The transition table. Every (state, event) pair is listed; "IGNORE" keeps
 * the state. CONFLICT is sticky until resolved; OFFLINE/RECOVERING only leave
 * through RESUMED (or a conflict found while resuming).
 */
export const TRANSITIONS: Record<SaveState, Record<SaveEvent["type"], Rule>> = {
  LOCAL_ONLY: {
    LOCAL_EDIT: "LOCAL_ONLY", PATCH_ACKED: "CALCULATING", RESULT: "LOCAL_ONLY", SAVE_STARTED: "SAVE_PENDING",
    SAVE_COMPLETED: unsavedOrSavedLocal(), SAVE_FAILED: "SAVE_FAILED", CONFLICT: "CONFLICT",
    CONFLICT_RESOLVED: "IGNORE", DISCONNECTED: "OFFLINE", RECONNECTING: "RECOVERING", RESUMED: "IGNORE",
  },
  CALCULATING: {
    LOCAL_EDIT: "LOCAL_ONLY", PATCH_ACKED: "CALCULATING", RESULT: "LOCAL_ONLY", SAVE_STARTED: "SAVE_PENDING",
    SAVE_COMPLETED: unsavedOrSavedLocal(), SAVE_FAILED: "SAVE_FAILED", CONFLICT: "CONFLICT",
    CONFLICT_RESOLVED: "IGNORE", DISCONNECTED: "OFFLINE", RECONNECTING: "RECOVERING", RESUMED: "IGNORE",
  },
  SAVE_PENDING: {
    LOCAL_EDIT: "SAVE_PENDING", PATCH_ACKED: "SAVE_PENDING", RESULT: "SAVE_PENDING", SAVE_STARTED: "SAVE_PENDING",
    SAVE_COMPLETED: unsavedOrSavedLocal(), SAVE_FAILED: "SAVE_FAILED", CONFLICT: "CONFLICT",
    CONFLICT_RESOLVED: "IGNORE", DISCONNECTED: "OFFLINE", RECONNECTING: "RECOVERING", RESUMED: "IGNORE",
  },
  SAVED: {
    LOCAL_EDIT: "LOCAL_ONLY", PATCH_ACKED: "CALCULATING", RESULT: "SAVED", SAVE_STARTED: "SAVE_PENDING",
    SAVE_COMPLETED: unsavedOrSavedLocal(), SAVE_FAILED: "SAVE_FAILED", CONFLICT: "CONFLICT",
    CONFLICT_RESOLVED: "IGNORE", DISCONNECTED: "OFFLINE", RECONNECTING: "RECOVERING", RESUMED: "IGNORE",
  },
  SAVE_FAILED: {
    LOCAL_EDIT: "SAVE_FAILED", PATCH_ACKED: "SAVE_FAILED", RESULT: "SAVE_FAILED", SAVE_STARTED: "SAVE_PENDING",
    SAVE_COMPLETED: unsavedOrSavedLocal(), SAVE_FAILED: "SAVE_FAILED", CONFLICT: "CONFLICT",
    CONFLICT_RESOLVED: "IGNORE", DISCONNECTED: "OFFLINE", RECONNECTING: "RECOVERING", RESUMED: "IGNORE",
  },
  CONFLICT: {
    LOCAL_EDIT: "CONFLICT", PATCH_ACKED: "CONFLICT", RESULT: "CONFLICT", SAVE_STARTED: "CONFLICT",
    SAVE_COMPLETED: "CONFLICT", SAVE_FAILED: "CONFLICT", CONFLICT: "CONFLICT",
    CONFLICT_RESOLVED: (e) => ("dirty" in e && e.dirty ? "LOCAL_ONLY" : "SAVED"),
    DISCONNECTED: "CONFLICT", RECONNECTING: "CONFLICT", RESUMED: "CONFLICT",
  },
  OFFLINE: {
    LOCAL_EDIT: "OFFLINE", PATCH_ACKED: "IGNORE", RESULT: "IGNORE", SAVE_STARTED: "IGNORE",
    SAVE_COMPLETED: "IGNORE", SAVE_FAILED: "IGNORE", CONFLICT: "CONFLICT",
    CONFLICT_RESOLVED: "IGNORE", DISCONNECTED: "OFFLINE", RECONNECTING: "RECOVERING", RESUMED: afterResumeFn(),
  },
  RECOVERING: {
    LOCAL_EDIT: "RECOVERING", PATCH_ACKED: "IGNORE", RESULT: "IGNORE", SAVE_STARTED: "IGNORE",
    SAVE_COMPLETED: "IGNORE", SAVE_FAILED: "IGNORE", CONFLICT: "CONFLICT",
    CONFLICT_RESOLVED: "IGNORE", DISCONNECTED: "OFFLINE", RECONNECTING: "RECOVERING", RESUMED: afterResumeFn(),
  },
};

function unsavedOrSavedLocal(): (e: SaveEvent) => SaveState {
  // A save of an older sequence completed while newer edits exist: still unsaved.
  return (e) => ("dirty" in e && e.dirty ? "LOCAL_ONLY" : "SAVED");
}

function afterResumeFn(): (e: SaveEvent) => SaveState {
  return (e) => ("dirty" in e && e.dirty ? "LOCAL_ONLY" : "SAVED");
}

export function saveReducer(state: SaveState, event: SaveEvent): SaveState {
  const rule = TRANSITIONS[state][event.type];
  if (rule === "IGNORE") return state;
  return typeof rule === "function" ? rule(event) : rule;
}

/** Accessible label (text, never colour only). */
export const SAVE_STATE_LABEL: Record<SaveState, string> = {
  LOCAL_ONLY: "Unsaved changes",
  CALCULATING: "Calculating…",
  SAVE_PENDING: "Saving…",
  SAVED: "Saved",
  SAVE_FAILED: "Save failed — changes kept",
  CONFLICT: "Conflict — newer version on server",
  OFFLINE: "Offline — changes kept",
  RECOVERING: "Connecting…",
};

