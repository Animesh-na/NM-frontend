// Sector mode ("dry-bulk" | "tanker") — every sheet/vessel endpoint is namespaced
// under the active mode, e.g. /dry-bulk/sheets or /tanker/sheets.
export type ApiMode = "dry-bulk" | "tanker";

const STORAGE_KEY = "voyagecalc_mode";
export const API_MODE_CHANGED_EVENT = "voyagecalc:mode-changed";

let currentMode: ApiMode = (() => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "tanker" || v === "dry-bulk" ? v : "dry-bulk";
  } catch {
    return "dry-bulk";
  }
})();

export function getApiMode(): ApiMode {
  return currentMode;
}

export function setApiMode(mode: ApiMode) {
  if (mode === currentMode) return;
  currentMode = mode;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(API_MODE_CHANGED_EVENT, { detail: { mode } }));
  }
}

/** Prefix a mode-scoped endpoint: modePath("/sheets") -> "/dry-bulk/sheets" */
export function modePath(endpoint: string): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `/${currentMode}${path}`;
}

export const MODE_LABELS: Record<ApiMode, string> = {
  "dry-bulk": "Dry Bulk",
  tanker: "Tanker",
};
