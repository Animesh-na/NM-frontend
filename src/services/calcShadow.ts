/**
 * Calculation shadow mode (migration stages 1–2, M1).
 *
 * Behind VITE_CALC_SHADOW=true (default off). The app keeps showing its own
 * results. In the background, after edits settle, the current sheet is sent to
 * the Go engine and the two results are compared field by field; mismatching
 * field paths and difference magnitudes (never sheet contents or values) are
 * reported to the backend. When the flag is off nothing is scheduled, sent or
 * computed.
 */
import { useEffect, useRef } from "react";
import { compareResults, toResultDTO, type FieldDiff } from "@/contracts/calc/normalize";
import type { CalculationInput, CalculationResponse } from "@/contracts/calc/types.generated";
import { calculateVoyageOnBackend, reportShadowMismatch, type ShadowReport } from "@/services/voyageCalculationApi";
import { getApiMode } from "@/services/apiMode";

export const CALC_SHADOW_ENABLED = import.meta.env.VITE_CALC_SHADOW === "true";

export const SHADOW_DEBOUNCE_MS = 2000;
export const SHADOW_MIN_INTERVAL_MS = 5000;
const MAX_REPORTED_MISMATCHES = 200;

interface Snapshot {
  seq: number;
  sheet: Record<string, unknown>;
  frontendResult: unknown;
  sheetId: string | null;
  segment: CalculationInput["segment"];
}

export interface ShadowDeps {
  calculate: (input: CalculationInput) => Promise<CalculationResponse>;
  report: (report: ShadowReport) => Promise<unknown>;
  now: () => number;
  uuid: () => string;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

const defaultDeps: ShadowDeps = {
  calculate: calculateVoyageOnBackend,
  report: reportShadowMismatch,
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Debounced, single-flight, rate-limited shadow comparison runner. The frontend
 * result is captured together with the sheet snapshot, so every comparison
 * pairs the server result with the frontend result for the same input.
 */
export class ShadowRunner {
  private seq = 0;
  private latest: Snapshot | null = null;
  private timer: unknown = null;
  private inFlight = false;
  private pending = false;
  private lastStart = -Infinity;
  private disposed = false;

  constructor(private readonly deps: ShadowDeps = defaultDeps) {}

  schedule(sheet: Record<string, unknown>, frontendResult: unknown, sheetId: string | null, segment: CalculationInput["segment"]) {
    if (this.disposed) return;
    this.latest = { seq: ++this.seq, sheet, frontendResult, sheetId, segment };
    this.arm(SHADOW_DEBOUNCE_MS);
  }

  dispose() {
    this.disposed = true;
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  private arm(ms: number) {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  async run(): Promise<void> {
    if (this.disposed || !this.latest) return;
    if (this.inFlight) {
      this.pending = true;
      return;
    }
    const wait = this.lastStart + SHADOW_MIN_INTERVAL_MS - this.deps.now();
    if (wait > 0) {
      this.arm(wait);
      return;
    }
    const snap = this.latest;
    this.latest = null;
    this.inFlight = true;
    this.lastStart = this.deps.now();
    try {
      const calculationId = this.deps.uuid();
      const response = await this.deps.calculate({
        contract_version: "calc.v1",
        calculation_id: calculationId,
        sheet_id: snap.sheetId,
        segment: snap.segment,
        working_sequence: snap.seq,
        calculation_date: new Date(this.deps.now()).toISOString().slice(0, 10),
        sheet: snap.sheet as unknown as CalculationInput["sheet"],
      });
      const frontend = toResultDTO(snap.frontendResult).result;
      const diffs = compareResults(frontend, response.result, response.not_computed).filter(
        (d) => d.class !== "NOT_COMPUTED",
      );
      if (diffs.length > 0 && !this.disposed) {
        await this.deps.report({
          calculation_id: response.calculation_id || calculationId,
          contract_version: "calc.v1",
          engine_version: response.engine_version,
          segment: snap.segment,
          working_sequence: snap.seq,
          compared_at: new Date(this.deps.now()).toISOString(),
          mismatches: diffs.slice(0, MAX_REPORTED_MISMATCHES).map(pickReportFields),
        });
      }
    } catch (err) {
      // Shadow mode must never affect the user: failures are only logged locally.
      console.debug("[calc-shadow] comparison skipped:", err instanceof Error ? err.message : err);
    } finally {
      this.inFlight = false;
      if (this.pending && this.latest) {
        this.pending = false;
        this.arm(0);
      }
    }
  }
}

function pickReportFields(d: FieldDiff): ShadowReport["mismatches"][number] {
  const out: ShadowReport["mismatches"][number] = { path: d.path, class: d.class };
  if (d.kind) out.kind = d.kind;
  if (d.abs_diff !== undefined) out.abs_diff = d.abs_diff;
  if (d.rel_diff !== undefined) out.rel_diff = d.rel_diff;
  return out;
}

/**
 * Mount once per open sheet. `getSheet` must return the same document the
 * sheet save sends (Index.tsx gatherData); `results` is the app's own result.
 */
export function useCalcShadow(
  getSheet: () => Record<string, unknown>,
  results: unknown,
  sheetId: string | null,
  enabled: boolean = CALC_SHADOW_ENABLED,
  deps?: ShadowDeps,
) {
  const runnerRef = useRef<ShadowRunner | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const runner = new ShadowRunner(deps);
    runnerRef.current = runner;
    return () => {
      runner.dispose();
      runnerRef.current = null;
    };
  }, [enabled, sheetId, deps]);

  useEffect(() => {
    if (!enabled || !runnerRef.current) return;
    runnerRef.current.schedule(getSheet(), results, sheetId, getApiMode() === "tanker" ? "tanker" : "dry_bulk");
    // results changes whenever any calculation input changes, so it is the edit signal.
  }, [enabled, results, getSheet, sheetId]);
}
