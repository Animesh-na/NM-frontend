/**
 * React bindings for the server calculation session (M7). Behind the
 * VITE_SERVER_CALCULATION flag (off by default): when it is off nothing here
 * runs and the app behaves exactly as before.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSheet } from "@/services/marineApi";
import { browserSocketDeps } from "@/transport/calculationSocket";
import { createTabCoordinator } from "@/session/tabCoordinator";
import { VoyageSession, type SessionSnapshot } from "@/session/voyageSession";

export const SERVER_CALCULATION_ENABLED = import.meta.env.VITE_SERVER_CALCULATION === "true";

export const PATCH_DEBOUNCE_MS = 200;

export function createBrowserSession(sheetId: string, segment: "dry_bulk" | "tanker", initialDoc: unknown, loadedDoc?: unknown): VoyageSession {
  return new VoyageSession(sheetId, segment, initialDoc, {
    socket: browserSocketDeps(),
    loadSavedDoc: async (id) => {
      const sheet = await getSheet(id);
      if (!sheet) throw new Error("saved sheet unavailable");
      return { data: sheet.data, version: (sheet as { version?: number }).version ?? null };
    },
    tabs: createTabCoordinator(sheetId),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }, loadedDoc);
}

/**
 * Opens a session for the sheet while `enabled`, closing it on change or
 * unmount. `getInitialDoc` is read once, when the session starts.
 */
export function useVoyageSession(opts: {
  enabled: boolean;
  sheetId: string | null;
  segment: "dry_bulk" | "tanker";
  getInitialDoc: () => unknown;
  /** The sheet as loaded from the server (raw REST payload), to detect newer saves. */
  getLoadedDoc?: () => unknown;
  factory?: typeof createBrowserSession;
}): VoyageSession | null {
  const [session, setSession] = useState<VoyageSession | null>(null);
  const getDoc = useRef(opts.getInitialDoc);
  getDoc.current = opts.getInitialDoc;
  const getLoaded = useRef(opts.getLoadedDoc);
  getLoaded.current = opts.getLoadedDoc;
  const factory = opts.factory ?? createBrowserSession;
  useEffect(() => {
    if (!opts.enabled || !opts.sheetId) {
      setSession(null);
      return;
    }
    const s = factory(opts.sheetId, opts.segment, getDoc.current(), getLoaded.current?.());
    setSession(s);
    void s.start();
    return () => s.dispose();
  }, [opts.enabled, opts.sheetId, opts.segment, factory]);
  return session;
}

const EMPTY: SessionSnapshot | null = null;
const noopSubscribe = () => () => undefined;

export function useSessionSnapshot(session: VoyageSession | null): SessionSnapshot | null {
  return useSyncExternalStore(
    session ? session.subscribe : noopSubscribe,
    session ? session.getSnapshot : () => EMPTY,
    session ? session.getSnapshot : () => EMPTY,
  );
}

/**
 * Debounced patch propagation: the UI updates immediately; the session gets
 * the document `delayMs` after the last change (trailing), at once on blur,
 * Enter, page hide/unload, and before a save. Several field changes within
 * the window become one patch.
 */
export function useDebouncedPatch(session: VoyageSession | null, doc: unknown, delayMs = PATCH_DEBOUNCE_MS): () => void {
  const latest = useRef(doc);
  latest.current = doc;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => undefined);
  flushRef.current = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (session) {
      session.update(latest.current);
      session.flush();
    }
  };

  useEffect(() => {
    if (!session) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      session.update(latest.current);
    }, delayMs);
  }, [session, doc, delayMs]);

  // The session pulls the latest document itself when it is disposed (sheet
  // switch, unmount), so edits still in the debounce reach it; the timer
  // belongs to that session and is cleared with it.
  useEffect(() => {
    if (!session) return;
    session.setDocumentProvider(() => latest.current);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [session]);

  // An idle save may complete while an edit is still buffered: send it at
  // once, so "Saved" is never shown over an unsent edit for long.
  const saveState = useSessionSnapshot(session)?.saveState;
  useEffect(() => {
    if (saveState === "SAVED" && timer.current !== null) flushRef.current();
  }, [saveState]);

  useEffect(() => {
    if (!session) return;
    const flush = () => flushRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") flush();
    };
    window.addEventListener("focusout", flush, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      window.removeEventListener("focusout", flush, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [session]);

  return () => flushRef.current();
}

/** The server's result for the latest acknowledged input (never an older one). */
export function useCalculationResult(session: VoyageSession | null) {
  const snap = useSessionSnapshot(session);
  return {
    result: snap?.result ?? null,
    workingSequence: snap?.resultWorkingSequence ?? null,
    calculating: snap?.calculating ?? false,
  };
}

/** The transport status (for diagnostics and the status badge). */
export function useCalculationSocket(session: VoyageSession | null) {
  return useSessionSnapshot(session)?.connection ?? "idle";
}
