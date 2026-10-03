import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { VoyageProvider, useVoyageContext } from "@/context/VoyageContext";
import { toResultDTO } from "@/contracts/calc/normalize";
import type { CalculationResponse } from "@/contracts/calc/types.generated";
import { getCalcAuthority, isCalcAuthorityReady, refreshCalcAuthority, resetCalcAuthorityForTests, setCalcAuthority } from "@/services/calcAuthority";
import { diffDisplayed, useDisplayComparison } from "@/services/displayCompare";
import { fromResultDTO, publishServerResult } from "@/session/serverDisplay";
import type { ShadowReport } from "@/services/voyageCalculationApi";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import sheetFixture from "../fixtures/stage3-sheet.json";

// M10 stage 3 (server_display, D-055): the Go result is displayed when it was
// computed for exactly the sheet on screen; otherwise the browser's own result
// is shown (local_pending); with CALC_AUTHORITY=local nothing changes.

// A real saved sheet (golden scenario bunker-pricing/ref-fifo-ignorebob).
const SHEET = sheetFixture as Record<string, unknown>;

function response(result: unknown, extra: Partial<CalculationResponse> = {}): CalculationResponse {
  const n = toResultDTO(result);
  return {
    calculation_id: "11111111-1111-4111-8111-111111111111", working_sequence: 3, engine_version: "2026.10.0",
    reference_data_version: "ref-2026.10.0", status: "completed", result: n.result, not_computed: [],
    non_finite: n.non_finite, ...extra,
  } as CalculationResponse;
}

function mount(sheetId: string | null) {
  let ctx: ReturnType<typeof useVoyageContext> | null = null;
  function Probe() {
    ctx = useVoyageContext();
    return null;
  }
  render(
    <VoyageProvider sheetId={sheetId} initialData={SHEET}>
      <Probe />
    </VoyageProvider>,
  );
  return () => ctx!;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  act(() => publishServerResult(null, null));
  resetCalcAuthorityForTests();
  vi.restoreAllMocks();
});

describe("calculation authority flag", () => {
  it("defaults to local until the backend answers; the first answer is fixed for the page load (D-059)", async () => {
    expect(getCalcAuthority()).toBe("local");
    await refreshCalcAuthority(async () => {
      throw new Error("401"); // not signed in yet
    });
    expect(isCalcAuthorityReady()).toBe(false);
    await refreshCalcAuthority(async () => ({ calc_authority: "server_display" }));
    expect([getCalcAuthority(), isCalcAuthorityReady()]).toEqual(["server_display", true]);
    await refreshCalcAuthority(async () => ({ calc_authority: "local" })); // a later change waits for the next load
    expect(getCalcAuthority()).toBe("server_display");
  });

  it("an unknown value fixes the safe stage (local)", async () => {
    await refreshCalcAuthority(async () => ({ calc_authority: "bogus" }));
    expect([getCalcAuthority(), isCalcAuthorityReady()]).toEqual(["local", true]);
  });
});

describe("server result as the app's result type", () => {
  it("restores non-finite values at nested and array paths", () => {
    const r = response({ totalVoyageDays: 1 }, { non_finite: { "ciiResult.requiredCii": "Infinity", "perCargoBreakdown[0].tce": "NaN" } as never });
    Object.assign(r.result, { ciiResult: { requiredCii: 0 }, perCargoBreakdown: [{ tce: 0 }] });
    const out = fromResultDTO(r) as unknown as { ciiResult: { requiredCii: number }; perCargoBreakdown: Array<{ tce: number }> };
    expect(out.ciiResult.requiredCii).toBe(Infinity);
    expect(Number.isNaN(out.perCargoBreakdown[0].tce)).toBe(true);
    expect((r.result as unknown as { perCargoBreakdown: Array<{ tce: number }> }).perCargoBreakdown[0].tce).toBe(0); // response untouched
  });
});

describe("VoyageProvider display authority", () => {
  it("local: always the browser's result, even when a server result is published", () => {
    const ctx = mount("sheet-1");
    const local = ctx().results;
    act(() => publishServerResult("sheet-1", response({ ...local, totalDistance: 999_999 }), ctx().inputsToken));
    expect(ctx().resultSource).toBe("local");
    expect(ctx().results.totalDistance).toBe(local.totalDistance);
  });

  it("server_display: shows the server result for this sheet; falls back to the browser's result while pending; ignores other sheets", () => {
    setCalcAuthority("server_display");
    const ctx = mount("sheet-1");
    expect(ctx().resultSource).toBe("local"); // no session yet: the browser's result, unlabelled server stage not applied
    act(() => publishServerResult("sheet-1", null, ctx().inputsToken, true)); // the session owns the sheet, result pending
    expect(ctx().resultSource).toBe("local_pending");
    const local = ctx().results;
    act(() => publishServerResult("sheet-2", response({ ...local, totalDistance: 123 }), ctx().inputsToken));
    expect(ctx().resultSource).toBe("local"); // another sheet's entry never applies here
    expect(ctx().results.totalDistance).toBe(local.totalDistance);
    act(() => publishServerResult("sheet-1", response({ ...local, totalDistance: 999_999 }), ctx().inputsToken));
    expect(ctx().resultSource).toBe("server");
    expect(ctx().results.totalDistance).toBe(999_999);
    act(() => publishServerResult("sheet-1", null, ctx().inputsToken, true)); // stale until the next result
    expect(ctx().resultSource).toBe("local_pending");
    expect(ctx().results.totalDistance).toBe(local.totalDistance);
  });
});

describe("a result published for older inputs is never rendered (parity review MAJOR-2)", () => {
  it("after an edit the provider shows the browser result in the same render, before the page re-evaluates", () => {
    setCalcAuthority("server_display");
    const ctx = mount("sheet-1");
    const local = ctx().results;
    act(() => publishServerResult("sheet-1", response({ ...local, totalDistance: 999_999 }), ctx().inputsToken));
    expect(ctx().resultSource).toBe("server");
    const before = ctx().inputsToken;
    act(() => ctx().setHireRate((ctx().hireRate ?? 0) + 1000)); // an edit; nothing republished
    expect(ctx().inputsToken).not.toBe(before);
    expect(ctx().resultSource).toBe("local_pending");
    expect(ctx().results.totalDistance).not.toBe(999_999);
  });
});

describe("stage-3 background comparison", () => {
  it("equal results produce no mismatch; a differing field is reported once per calculation, without values", async () => {
    const ctx = mount(null);
    const local = ctx().results;
    expect(diffDisplayed(local, response(local))).toEqual([]);
    const report = vi.fn<(r: ShadowReport) => Promise<unknown>>(async () => ({}));
    const server = response({ ...local, totalDistance: (local.totalDistance ?? 0) + 10 });
    const { rerender } = renderHook(({ s }: { s: CalculationResponse | null }) => useDisplayComparison(local as VoyageResults, s, report), {
      initialProps: { s: server },
    });
    rerender({ s: server });
    expect(report).toHaveBeenCalledTimes(1);
    const sent = report.mock.calls[0][0];
    expect(sent.mismatches.map((m) => m.path)).toContain("totalDistance");
    expect(JSON.stringify(sent)).not.toContain(String((local.totalDistance ?? 0) + 10));
  });
});

describe("stage 4 (server_only, D-057)", () => {
  it("never shows a browser result: placeholders until the first server result, then the server result, then the last one while updating", () => {
    setCalcAuthority("server_only");
    const ctx = mount("sheet-1");
    act(() => publishServerResult("sheet-1", null, ctx().inputsToken, true)); // session owns the sheet
    expect(ctx().resultSource).toBe("server_pending");
    expect(ctx().results.pAndL).toBe(0);
    expect(ctx().results.totalVoyageDays).toBe(0);
    // A synthetic server result (the browser computed nothing).
    const server = response({ ...ctx().results, totalDistance: 4242, pAndL: 12345 });
    act(() => publishServerResult("sheet-1", server, ctx().inputsToken));
    expect(ctx().resultSource).toBe("server");
    expect(ctx().results.pAndL).toBe(12345);
    act(() => ctx().setHireRate((ctx().hireRate ?? 0) + 1000)); // an edit: the next result is calculating
    act(() => publishServerResult("sheet-1", null, ctx().inputsToken, true));
    expect(ctx().resultSource).toBe("server_stale");
    expect(ctx().results.pAndL).toBe(12345);
    // Another document is loaded into the editor (recovery): the old result is not shown for it.
    act(() => publishServerResult("sheet-1", null, ctx().inputsToken, true, 1));
    expect(ctx().resultSource).toBe("server_pending");
    expect(ctx().results.pAndL).toBe(0);
  });

  it("without a live session (comparison page, read-only, new sheet) the browser calculation is used and labelled local", () => {
    setCalcAuthority("server_only");
    const ctxNoSheet = mount(null);
    expect(ctxNoSheet().resultSource).toBe("local");
    expect(ctxNoSheet().results.totalDistance).toBeGreaterThan(0); // a real browser calculation, not placeholders
    cleanup();
    const ctx = mount("sheet-1"); // a sheet whose session is not (yet) the owner
    act(() => publishServerResult("sheet-1", null, ctx().inputsToken, false));
    expect(ctx().resultSource).toBe("local");
    expect(ctx().results.totalDistance).toBeGreaterThan(0);
  });

  it("does not run the browser calculation (no comparison report even with a differing server result)", () => {
    setCalcAuthority("server_only");
    const ctx = mount("sheet-1");
    act(() => publishServerResult("sheet-1", null, ctx().inputsToken, true));
    const report = vi.fn(async () => ({}));
    const { result } = renderHook(() => useDisplayComparison(null, response({ totalDistance: 1 }), report));
    expect(result.current).toBeUndefined();
    expect(report).not.toHaveBeenCalled();
    expect(ctx().results.totalDistance).toBe(0); // placeholder, not a browser calculation of the fixture sheet
  });
});
