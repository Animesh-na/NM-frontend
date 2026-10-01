import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { ShadowRunner, useCalcShadow, SHADOW_DEBOUNCE_MS, SHADOW_MIN_INTERVAL_MS, type ShadowDeps } from "@/services/calcShadow";
import { toResultDTO } from "@/contracts/calc/normalize";
import type { CalculationResponse } from "@/contracts/calc/types.generated";
import type { ShadowReport } from "@/services/voyageCalculationApi";

// A minimal frontend result; normalisation only keeps schema fields.
const feResult = { totalVoyageDays: 20, pAndL: 1000, hireCost: 500, ciiRating: "C" };
const sheet = { vessel: { name: "SECRET VESSEL" }, sequence: [], notes: "confidential note" };

function response(result: Record<string, unknown>): CalculationResponse {
  return {
    calculation_id: "a68c7453-0f23-4f6e-82ea-15f2fe130581",
    working_sequence: 1,
    engine_version: "voyagecalc-captures-v1",
    reference_data_version: "embedded-v1",
    status: "completed",
    result: toResultDTO(result).result,
    not_computed: ["ciiResult.boundaries"],
  };
}

function makeDeps(calc: ShadowDeps["calculate"]) {
  const report = vi.fn<(r: ShadowReport) => Promise<unknown>>(async () => ({ status: "logged" }));
  const calculate = vi.fn(calc);
  const deps: ShadowDeps = {
    calculate,
    report,
    now: () => Date.now(),
    uuid: () => "a68c7453-0f23-4f6e-82ea-15f2fe130581",
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  return { deps, calculate, report };
}

describe("calculation shadow mode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("does nothing when the flag is off", async () => {
    const { deps, calculate, report } = makeDeps(async () => response(feResult));
    const { rerender } = renderHook(({ r }) => useCalcShadow(() => sheet, r, "sheet-1", false, deps), {
      initialProps: { r: feResult as unknown },
    });
    rerender({ r: { ...feResult, pAndL: 2 } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calculate).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("debounces edits into one request carrying the latest working sequence", async () => {
    const { deps, calculate } = makeDeps(async () => response(feResult));
    const runner = new ShadowRunner(deps);
    for (let i = 0; i < 5; i++) {
      runner.schedule(sheet, feResult, "sheet-1", "dry_bulk");
      await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS / 4);
    }
    expect(calculate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS);
    expect(calculate).toHaveBeenCalledTimes(1);
    const input = calculate.mock.calls[0][0];
    expect(input).toMatchObject({ contract_version: "calc.v1", segment: "dry_bulk", working_sequence: 5, sheet_id: "sheet-1", calculation_date: "2026-10-01" });
  });

  it("keeps one request in flight and spaces requests by the minimum interval", async () => {
    let resolve: (r: CalculationResponse) => void = () => {};
    const { deps, calculate } = makeDeps(() => new Promise((r) => { resolve = r; }));
    const runner = new ShadowRunner(deps);
    runner.schedule(sheet, feResult, null, "dry_bulk");
    await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS);
    expect(calculate).toHaveBeenCalledTimes(1);

    runner.schedule(sheet, feResult, null, "dry_bulk");
    await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS * 3);
    expect(calculate).toHaveBeenCalledTimes(1); // first still in flight

    resolve(response(feResult));
    await vi.advanceTimersByTimeAsync(0);
    const started = calculate.mock.calls.length;
    expect(started).toBe(2); // pending edit runs once the first finishes (≥ min interval elapsed)

    runner.schedule(sheet, feResult, null, "dry_bulk");
    resolve(response(feResult));
    await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS);
    expect(calculate).toHaveBeenCalledTimes(2); // inside the min interval of the 2nd start
    await vi.advanceTimersByTimeAsync(SHADOW_MIN_INTERVAL_MS);
    expect(calculate).toHaveBeenCalledTimes(3);
  });

  it("reports only paths, classes and magnitudes — no values or sheet contents", async () => {
    const { deps, report } = makeDeps(async () => response({ ...feResult, pAndL: 1250, hireCost: 480 }));
    const runner = new ShadowRunner(deps);
    runner.schedule(sheet, feResult, "sheet-1", "dry_bulk");
    await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS);
    expect(report).toHaveBeenCalledTimes(1);
    const sent = report.mock.calls[0][0];
    const paths = sent.mismatches.map((m) => m.path);
    expect(paths).toEqual(expect.arrayContaining(["pAndL", "hireCost"]));
    for (const m of sent.mismatches) {
      expect(Object.keys(m).sort()).toEqual(expect.arrayContaining(["class", "path"]));
      expect(Object.keys(m).every((k) => ["path", "class", "kind", "abs_diff", "rel_diff"].includes(k))).toBe(true);
    }
    const raw = JSON.stringify(sent);
    expect(raw).not.toContain("SECRET VESSEL");
    expect(raw).not.toContain("confidential");
    expect(raw).not.toContain("1250");
    expect(sent.mismatches.find((m) => m.path === "pAndL")).toMatchObject({ class: "VALUE", kind: "money", abs_diff: 250 });
  });

  it("sends no report when results agree, and swallows server failures", async () => {
    const ok = makeDeps(async () => response(feResult));
    const runner = new ShadowRunner(ok.deps);
    runner.schedule(sheet, feResult, null, "dry_bulk");
    await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS);
    expect(ok.calculate).toHaveBeenCalledTimes(1);
    expect(ok.report).not.toHaveBeenCalled();

    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const failing = makeDeps(async () => { throw new Error("API Error: 500"); });
    const runner2 = new ShadowRunner(failing.deps);
    runner2.schedule(sheet, feResult, null, "dry_bulk");
    await expect(vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS)).resolves.not.toThrow();
    expect(failing.report).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalled();
  });
});
