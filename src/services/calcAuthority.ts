/**
 * Calculation authority stage (M10, D-007, D-055).
 *
 *   local           stages 0–2: the browser's own result is displayed
 *   server_display  stage 3: the Go result is displayed when it matches the
 *                   sheet on screen; the browser still computes, is shown
 *                   while the server result is pending, and is compared
 *   server_only     stage 4 (not enabled yet)
 *
 * The stage is read at runtime from GET /api/v1/config (backend
 * CALC_AUTHORITY), so a rollback is an API environment change — no frontend
 * rebuild. Until the backend answers (or if it cannot), the build default
 * VITE_CALC_AUTHORITY applies (default "local").
 */
import { useSyncExternalStore } from "react";
import { apiRequest } from "@/services/marineApi";

export type CalcAuthority = "local" | "server_display" | "server_only";

const isAuthority = (v: unknown): v is CalcAuthority => v === "local" || v === "server_display" || v === "server_only";

const buildDefault = import.meta.env.VITE_CALC_AUTHORITY;
export const DEFAULT_CALC_AUTHORITY: CalcAuthority = isAuthority(buildDefault) ? buildDefault : "local";

let current: CalcAuthority = DEFAULT_CALC_AUTHORITY;
const listeners = new Set<() => void>();

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

/** Fetches the stage from the backend; failures keep the current stage. */
export async function refreshCalcAuthority(
  fetchConfig: () => Promise<{ calc_authority?: unknown }> = () => apiRequest<{ calc_authority?: unknown }>("/config"),
): Promise<CalcAuthority> {
  try {
    const cfg = await fetchConfig();
    setCalcAuthority(cfg.calc_authority);
  } catch {
    /* not signed in or backend unavailable: keep the current stage */
  }
  return current;
}
