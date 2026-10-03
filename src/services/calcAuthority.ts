/**
 * Calculation authority stage (M10, D-007, D-055).
 *
 *   local           stages 0–2: the browser's own result is displayed
 *   server_display  stage 3: the Go result is displayed when it matches the
 *                   sheet on screen; the browser still computes, is shown
 *                   while the server result is pending, and is compared
 *   server_only     stage 4: only Go results; the browser does not calculate (D-057)
 *
 * The stage is read at runtime from GET /api/v1/config (backend
 * CALC_AUTHORITY), so a rollback is an API environment change — no frontend
 * rebuild. It is FIXED PER PAGE LOAD (D-059): the first successful answer after
 * sign-in is kept until the page is reloaded, so the save model of an open sheet
 * never changes mid-edit; a rollback applies on the next load. Until the
 * backend answers, the build default VITE_CALC_AUTHORITY applies (default
 * "local") and `ready` is false.
 */
import { useSyncExternalStore } from "react";
import { apiRequest } from "@/services/marineApi";

export type CalcAuthority = "local" | "server_display" | "server_only";

const isAuthority = (v: unknown): v is CalcAuthority => v === "local" || v === "server_display" || v === "server_only";

const buildDefault = import.meta.env.VITE_CALC_AUTHORITY;
export const DEFAULT_CALC_AUTHORITY: CalcAuthority = isAuthority(buildDefault) ? buildDefault : "local";

let current: CalcAuthority = DEFAULT_CALC_AUTHORITY;
let ready = false; // the backend answered (the stage is fixed from now on)
const listeners = new Set<() => void>();

/** Whether the stage of this page load is known (fixed). */
export function isCalcAuthorityReady(): boolean {
  return ready;
}

export function useCalcAuthorityReady(): boolean {
  return useSyncExternalStore(subscribeCalcAuthority, isCalcAuthorityReady, isCalcAuthorityReady);
}

/** Tests only: forget the fixed stage. */
export function resetCalcAuthorityForTests(): void {
  current = DEFAULT_CALC_AUTHORITY;
  ready = false;
  listeners.forEach((l) => l());
}

export function getCalcAuthority(): CalcAuthority {
  return current;
}

/** Sets the stage (tests, and the config fetch). Unknown values are ignored. */
export function setCalcAuthority(v: unknown): void {
  if (!isAuthority(v) || v === current) return;
  current = v;
  listeners.forEach((l) => l());
}

export function subscribeCalcAuthority(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCalcAuthority(): CalcAuthority {
  return useSyncExternalStore(subscribeCalcAuthority, getCalcAuthority, getCalcAuthority);
}

/**
 * Fetches the stage once per page load: the first successful answer fixes it;
 * later calls are no-ops. Failures (not signed in, backend unavailable) keep
 * the default and allow a retry.
 */
export async function refreshCalcAuthority(
  fetchConfig: () => Promise<{ calc_authority?: unknown }> = () => apiRequest<{ calc_authority?: unknown }>("/config"),
): Promise<CalcAuthority> {
  if (ready) return current;
  try {
    const cfg = await fetchConfig();
    if (ready) return current; // a concurrent fetch fixed it first
    if (isAuthority(cfg.calc_authority)) current = cfg.calc_authority;
    ready = true;
    listeners.forEach((l) => l());
  } catch {
    /* keep the default; the next sign-in retries */
  }
  return current;
}
