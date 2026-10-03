/**
 * Bridge between the server calculation session (owned by the page) and the
 * voyage context that renders results (M10 stage 3).
 *
 * The page publishes, per sheet, the server response that was computed for
 * EXACTLY the sheet on screen (VoyageSession.currentResult), or null while the
 * server result is pending, stale or unavailable. The context then shows that
 * result, or falls back to the browser's own result with an indicator.
 */
import { useSyncExternalStore } from "react";
import type { CalculationResponse } from "@/contracts/calc/types.generated";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";

interface Entry {
  sheetId: string | null;
  response: CalculationResponse | null;
  /** The provider's inputs token the page evaluated the response against. */
  inputsToken: object | null;
  /** A live server session owns this sheet (results can come from the server). */
  available: boolean;
  /** Changes whenever the page loads another document into the editor (recovery, conflict reload). */
  epoch: number;
}

let entry: Entry = { sheetId: null, response: null, inputsToken: null, available: false, epoch: 0 };
const listeners = new Set<() => void>();

export function publishServerResult(sheetId: string | null, response: CalculationResponse | null, inputsToken: object | null = null,
  available = response !== null, epoch = 0): void {
  if (entry.sheetId === sheetId && entry.response === response && entry.inputsToken === inputsToken && entry.available === available && entry.epoch === epoch) return;
  entry = { sheetId, response, inputsToken, available, epoch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export interface ServerDisplay {
  response: CalculationResponse | null;
  available: boolean;
  epoch: number;
}

/** What the server side offers this sheet: availability, document epoch, and the current response (as useServerResult). */
export function useServerDisplay(sheetId: string | null, inputsToken: object | null): ServerDisplay {
  const e = useSyncExternalStore(subscribe, () => entry, () => entry);
  if (sheetId === null || e.sheetId !== sheetId) return { response: null, available: false, epoch: 0 };
  return { response: e.inputsToken !== null && e.inputsToken === inputsToken ? e.response : null, available: e.available, epoch: e.epoch };
}

/**
 * The server response for this sheet if it was evaluated against exactly the
 * provider's current inputs (`inputsToken` changes with every sheet edit), so
 * a response published for the previous state is never rendered — not even for
 * one frame before the page re-evaluates after an edit.
 */
export function useServerResult(sheetId: string | null, inputsToken: object | null): CalculationResponse | null {
  const e = useSyncExternalStore(subscribe, () => entry, () => entry);
  return sheetId !== null && e.sheetId === sheetId && e.inputsToken !== null && e.inputsToken === inputsToken ? e.response : null;
}

/**
 * The server response as the app's own result type. calc.v1 carries
 * non-finite numbers as 0 plus a `non_finite` path map (JSON has no NaN /
 * Infinity); they are restored here so the screen shows exactly what the
 * browser's calculation would (parity is tested on the same paths).
 */
export function fromResultDTO(response: CalculationResponse): VoyageResults {
  const out = structuredClone(response.result) as unknown as Record<string, unknown>;
  for (const [path, kind] of Object.entries(response.non_finite ?? {})) {
    const value = kind === "NaN" ? NaN : kind === "Infinity" ? Infinity : -Infinity;
    setPath(out, path, value);
  }
  return out as unknown as VoyageResults;
}

function setPath(root: Record<string, unknown>, path: string, value: number) {
  const steps: Array<string | number> = [];
  for (const part of path.split(".")) {
    const m = /^([^[]*)((?:\[\d+\])*)$/.exec(part);
    if (!m) return;
    if (m[1]) steps.push(m[1]);
    for (const idx of m[2].matchAll(/\[(\d+)\]/g)) steps.push(Number(idx[1]));
  }
  let node: unknown = root;
  for (let i = 0; i < steps.length - 1; i++) {
    if (node === null || typeof node !== "object") return;
    node = (node as Record<string | number, unknown>)[steps[i]];
  }
  if (node !== null && typeof node === "object") (node as Record<string | number, unknown>)[steps[steps.length - 1]] = value;
}
