import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { VoyageProvider, useVoyageContext } from "@/context/VoyageContext";
import { toResultDTO } from "@/contracts/calc/normalize";
import type { CalculationResponse } from "@/contracts/calc/types.generated";
import { getCalcAuthority, refreshCalcAuthority, setCalcAuthority } from "@/services/calcAuthority";
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
  setCalcAuthority("local");
  vi.restoreAllMocks();
});

describe("calculation authority flag", () => {
  it("defaults to local and follows the backend config; unknown values and failures keep the stage", async () => {
    expect(getCalcAuthority()).toBe("local");
    await refreshCalcAuthority(async () => ({ calc_authority: "server_display" }));
    expect(getCalcAuthority()).toBe("server_display");
    await refreshCalcAuthority(async () => ({ calc_authority: "bogus" }));
    expect(getCalcAuthority()).toBe("server_display");
    await refreshCalcAuthority(async () => {
      throw new Error("401");
    });
    expect(getCalcAuthority()).toBe("server_display");
    await refreshCalcAuthority(async () => ({ calc_authority: "local" })); // rollback
    expect(getCalcAuthority()).toBe("local");
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
    expect(ctx().resultSource).toBe("local_pending");
    const local = ctx().results;
    act(() => publishServerResult("sheet-2", response({ ...local, totalDistance: 123 }), ctx().inputsToken));
    expect(ctx().resultSource).toBe("local_pending");
    act(() => publishServerResult("sheet-1", response({ ...local, totalDistance: 999_999 }), ctx().inputsToken));
    expect(ctx().resultSource).toBe("server");
    expect(ctx().results.totalDistance).toBe(999_999);
    act(() => publishServerResult("sheet-1", null, ctx().inputsToken)); // stale until the next result
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
    expect(ctx().resultSource).toBe("server_pending");
    expect(ctx().results.pAndL).toBe(0);
    expect(ctx().results.totalVoyageDays).toBe(0);
    // A synthetic server result (the browser computed nothing).
    const server = response({ ...ctx().results, totalDistance: 4242, pAndL: 12345 });
    act(() => publishServerResult("sheet-1", server, ctx().inputsToken));
    expect(ctx().resultSource).toBe("server");
    expect(ctx().results.pAndL).toBe(12345);
    act(() => ctx().setHireRate((ctx().hireRate ?? 0) + 1000)); // an edit: the next result is calculating
    expect(ctx().resultSource).toBe("server_stale");
    expect(ctx().results.pAndL).toBe(12345);
  });

  it("does not run the browser calculation (no comparison report even with a differing server result)", () => {
    setCalcAuthority("server_only");
    const ctx = mount("sheet-1");
    const report = vi.fn(async () => ({}));
    const { result } = renderHook(() => useDisplayComparison(null, response({ totalDistance: 1 }), report));
    expect(result.current).toBeUndefined();
    expect(report).not.toHaveBeenCalled();
    expect(ctx().results.totalDistance).toBe(0); // placeholder, not a browser calculation of the fixture sheet
  });
});
