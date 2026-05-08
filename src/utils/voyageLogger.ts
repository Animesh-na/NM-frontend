/**
 * Voyage calculation logger.
 *
 * Goals:
 *  - One collapsible "Voyage Calculation" group per run (instead of dozens of top-level lines)
 *  - A clean final `console.table` summary of the most important KPIs
 *  - A `window.__voyage` inspector so you can poke at the latest inputs/result from DevTools
 *  - A single switch to silence everything: `localStorage.VOYAGE_DEBUG = 'off'`
 *
 * Modes (set in DevTools, then reload):
 *   localStorage.VOYAGE_DEBUG = 'off'      // no logs at all
 *   localStorage.VOYAGE_DEBUG = 'summary'  // only the final summary table
 *   localStorage.VOYAGE_DEBUG = 'on'       // collapsed group with all steps (default)
 *   localStorage.VOYAGE_DEBUG = 'verbose'  // expanded group with all steps
 */

type Mode = "off" | "summary" | "on" | "verbose";

function getMode(): Mode {
  try {
    const m = (typeof localStorage !== "undefined" && localStorage.getItem("VOYAGE_DEBUG")) as Mode | null;
    if (m === "off" || m === "summary" || m === "on" || m === "verbose") return m;
  } catch {
    /* ignore (SSR / sandboxed) */
  }
  return "on";
}

let groupOpen = false;

export function vlogBegin(title: string): void {
  const mode = getMode();
  if (mode === "off" || mode === "summary") return;
  const opener = mode === "verbose" ? console.group : console.groupCollapsed;
  opener(`🚢 ${title}`);
  groupOpen = true;
}

/** Drop-in replacement for console.log inside a voyage calc. Respects VOYAGE_DEBUG. */
export function vlog(...args: unknown[]): void {
  const mode = getMode();
  if (mode === "off" || mode === "summary") return;
  // eslint-disable-next-line no-console
  console.log(...args);
}

export interface VoyageLogSummary {
  vessel: string;
  totalDistance: number;
  totalSeaDays: number;
  totalPortDays: number;
  totalVoyageDays: number;
  hsfo: number;
  vlsfo: number;
  lsmgo: number;
  bunkerCost: number;
  grossFreight: number;
  netFreight: number;
  hireCost: number;
  totalVoyageCosts: number;
  pAndL: number;
  tce: number;
  totalCo2: number;
  ciiRating: string;
  etsCost: number;
  fuelEuCost: number;
}

export function vlogEnd(summary: VoyageLogSummary): void {
  const mode = getMode();
  if (mode === "off") {
    return;
  }

  // Always print a tidy summary table at the end (unless mode === 'off').
  const fmt = (n: number) =>
    Number.isFinite(n) ? Number(n.toFixed(2)) : n;

  const rows: Record<string, { value: string | number }> = {
    Vessel:               { value: summary.vessel },
    "Distance (nm)":      { value: fmt(summary.totalDistance) },
    "Sea Days":           { value: fmt(summary.totalSeaDays) },
    "Port Days":          { value: fmt(summary.totalPortDays) },
    "Voyage Days":        { value: fmt(summary.totalVoyageDays) },
    "HSFO (mt)":          { value: fmt(summary.hsfo) },
    "VLSFO (mt)":         { value: fmt(summary.vlsfo) },
    "LSMGO (mt)":         { value: fmt(summary.lsmgo) },
    "Bunker Cost ($)":    { value: fmt(summary.bunkerCost) },
    "Gross Freight ($)":  { value: fmt(summary.grossFreight) },
    "Net Freight ($)":    { value: fmt(summary.netFreight) },
    "Hire Cost ($)":      { value: fmt(summary.hireCost) },
    "Voyage Costs ($)":   { value: fmt(summary.totalVoyageCosts) },
    "P&L ($)":            { value: fmt(summary.pAndL) },
    "TCE ($/d)":          { value: fmt(summary.tce) },
    "Total CO2 (mt)":     { value: fmt(summary.totalCo2) },
    "CII Rating":         { value: summary.ciiRating },
    "ETS Cost ($)":       { value: fmt(summary.etsCost) },
    "FuelEU Cost ($)":    { value: fmt(summary.fuelEuCost) },
  };

  // eslint-disable-next-line no-console
  console.table(rows);

  if (groupOpen) {
    // eslint-disable-next-line no-console
    console.groupEnd();
    groupOpen = false;
  }
}

/**
 * Expose the latest voyage inputs + result to `window.__voyage` so users can
 * inspect any computed value from the browser console:
 *   > __voyage.result.tce
 *   > __voyage.result.etsResult.legBreakdown
 *   > copy(JSON.stringify(__voyage, null, 2))
 */
export function exposeVoyageDebug(payload: { inputs: unknown; result: unknown }): void {
  if (typeof window === "undefined") return;
  try {
    (window as unknown as { __voyage: unknown }).__voyage = payload;
  } catch {
    /* ignore */
  }
}