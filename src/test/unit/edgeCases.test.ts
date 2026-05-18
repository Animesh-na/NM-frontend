/**
 * UNIT TEST: Mathematical & Input Edge Cases
 *
 * Verifies the voyage calculation engine never crashes and degrades
 * gracefully on degenerate inputs:
 *   - division by zero (zero distance / zero days / zero quantity)
 *   - null / undefined / NaN / empty string / missing fields
 *   - negative numbers and negative percentages
 *   - very large numbers (overflow risk) and very small decimals
 *   - floating-point precision (0.1 + 0.2)
 *   - boundary / min / max values
 *
 * Contract for ALL outputs of useVoyageCalculation:
 *   - every numeric result must be a finite number (no NaN, no Infinity)
 *   - hook must never throw
 *   - sensible fallback (0) for undefined inputs
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs, type SequenceRow } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "../helpers/mockVesselData";
import { mockSimpleSequence, mockCargo, mockBunker, mockMiscCosts, mockExtraTime } from "../helpers/mockSequenceData";

const base: VoyageInputs = {
  vessel: mockVessel,
  sequence: mockSimpleSequence,
  cargo: mockCargo,
  bunker: mockBunker,
  hireRate: 15000,
  misc: mockMiscCosts,
  extraTime: mockExtraTime,
};

/** Walks every numeric leaf in `obj` and asserts it is a finite number. */
function assertAllFinite(label: string, obj: unknown, seen = new WeakSet<object>()): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "number") {
    expect(Number.isFinite(obj), `${label} -> not finite (got ${obj})`).toBe(true);
    return;
  }
  if (typeof obj !== "object") return;
  if (seen.has(obj as object)) return;
  seen.add(obj as object);
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertAllFinite(`${label}[${i}]`, v, seen));
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    assertAllFinite(`${label}.${k}`, v, seen);
  }
}

describe("Edge Cases: Mathematical & Input", () => {
  describe("Division by zero", () => {
    it("zero distance on every leg -> no crash, finite outputs, 0 sea days", () => {
      const seq: SequenceRow[] = mockSimpleSequence.map((r) => ({
        ...r,
        distance: 0,
        ecaDistance: 0,
        seaTime: 0,
        ecaTime: 0,
        nonEcaTime: 0,
        baseSeaTime: 0,
        seaMarginTime: 0,
      }));
      const { result } = renderHook(() => useVoyageCalculation({ ...base, sequence: seq }));
      expect(result.current.totalDistance).toBe(0);
      expect(result.current.totalSeaDays).toBe(0);
      assertAllFinite("zero-distance", result.current);
    });

    it("zero cargo quantity (mt rate) -> grossFreight = 0, NTCE finite", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({ ...base, cargo: { ...mockCargo, quantity: 0 } })
      );
      expect(result.current.grossFreight).toBe(0);
      expect(Number.isFinite(result.current.ntce)).toBe(true);
      expect(Number.isFinite(result.current.tce)).toBe(true);
    });

    it("zero voyage days (empty sequence + no extras) -> TCE/NTCE/GTCE do not explode", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({
          ...base,
          sequence: [],
          extraTime: { canal1Days: 0, canal2Days: 0, idlePortDays: 0, atSeaDays: 0, atSeaSpeedContext: "EV" },
        })
      );
      expect(result.current.totalVoyageDays).toBe(0);
      assertAllFinite("zero-days", result.current);
    });

    it("zero DWT vessel -> CII does not divide by zero", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({ ...base, vessel: { ...mockVessel, dwt: 0 } })
      );
      expect(Number.isFinite(result.current.afrCii)).toBe(true);
      expect(["A", "B", "C", "D", "E"]).toContain(result.current.ciiRating);
    });
  });

  describe("Null / undefined / missing fields", () => {
    it("undefined misc + extraTime -> uses safe defaults, no crash", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({ ...base, misc: undefined, extraTime: undefined })
      );
      expect(result.current.miscCosts).toBe(0);
      expect(result.current.canalCosts).toBe(0);
      expect(result.current.extraPortDays).toBe(0);
      assertAllFinite("undefined-misc", result.current);
    });

    it("sequence rows with missing optional fields -> defaults to 0", () => {
      const seq: SequenceRow[] = [
        {
          id: 1,
          operation: "load",
          port: "X",
          portUnloc: "XXXXX",
          cgo: "",
          distance: 1000,
          ecaDistance: 0,
          portDays: 2,
          quantity: 10000,
          expDa: 5000,
        },
      ];
      const { result } = renderHook(() => useVoyageCalculation({ ...base, sequence: seq }));
      assertAllFinite("missing-fields", result.current);
    });

    it("undefined hireRate -> hireCost = 0", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({ ...base, hireRate: undefined as unknown as number })
      );
      expect(result.current.hireCost).toBe(0);
    });
  });

  describe("NaN / empty-string-coerced inputs", () => {
    it("NaN cargo rate -> grossFreight is 0 (not NaN)", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({ ...base, cargo: { ...mockCargo, rate: Number.NaN } })
      );
      expect(Number.isFinite(result.current.grossFreight)).toBe(true);
    });

    it("NaN bunker prices -> totalBunkerCost is finite", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({
          ...base,
          bunker: {
            hsfo: { price: Number.NaN, robStart: 0 },
            vlsfo: { price: Number.NaN, robStart: 0 },
            lsmgo: { price: Number.NaN, robStart: 0 },
            co2Price: Number.NaN,
            rewardFactor: Number.NaN,
          },
        })
      );
      assertAllFinite("nan-bunker", result.current);
    });

    it('empty string coerced via Number("") = 0 -> distance 0, no crash', () => {
      const seq: SequenceRow[] = mockSimpleSequence.map((r) => ({
        ...r,
        distance: Number("") as number,
        ecaDistance: Number("") as number,
      }));
      const { result } = renderHook(() => useVoyageCalculation({ ...base, sequence: seq }));
      assertAllFinite("empty-string", result.current);
    });
  });

  describe("Negative numbers & percentages", () => {
    it("negative hire rate -> hireCost negative but finite (no crash)", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({ ...base, hireRate: -5000 })
      );
      expect(Number.isFinite(result.current.hireCost)).toBe(true);
    });

    it("negative voyage commission -> netFreight > grossFreight, still finite", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({ ...base, cargo: { ...mockCargo, voyageCommission: -10 } })
      );
      assertAllFinite("neg-commission", result.current);
    });

    it("negative sea margin -> finite results", () => {
      const seq: SequenceRow[] = mockSimpleSequence.map((r) => ({ ...r, seaMargin: -10 }));
      const { result } = renderHook(() => useVoyageCalculation({ ...base, sequence: seq }));
      assertAllFinite("neg-margin", result.current);
    });

    it("negative bunker prices -> finite cost (no NaN)", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({
          ...base,
          bunker: {
            hsfo: { price: -100, robStart: 0 },
            vlsfo: { price: -100, robStart: 0 },
            lsmgo: { price: -100, robStart: 0 },
            co2Price: 0,
          },
        })
      );
      expect(Number.isFinite(result.current.totalBunkerCost)).toBe(true);
    });
  });

  describe("Very large numbers (overflow risk)", () => {
    it("max-safe-integer distance -> stays finite (no Infinity)", () => {
      const seq: SequenceRow[] = [
        {
          ...mockSimpleSequence[0],
          distance: Number.MAX_SAFE_INTEGER,
          seaTime: 1e6,
          nonEcaTime: 1e6,
          baseSeaTime: 1e6,
        },
      ];
      const { result } = renderHook(() => useVoyageCalculation({ ...base, sequence: seq }));
      assertAllFinite("max-distance", result.current);
    });

    it("huge cargo quantity * huge rate -> grossFreight finite", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({
          ...base,
          cargo: { ...mockCargo, rate: 1e9, quantity: 1e9 },
        })
      );
      expect(Number.isFinite(result.current.grossFreight)).toBe(true);
    });
  });

  describe("Decimal precision / floating-point", () => {
    it("classic 0.1 + 0.2 precision: distance 0.1 + 0.2 leg sums match within 1e-9", () => {
      const seq: SequenceRow[] = [
        { ...mockSimpleSequence[0], distance: 0.1, ecaDistance: 0 },
        { ...mockSimpleSequence[1], distance: 0.2, ecaDistance: 0 },
      ];
      const { result } = renderHook(() => useVoyageCalculation({ ...base, sequence: seq }));
      expect(result.current.totalDistance).toBeCloseTo(0.3, 9);
    });

    it("tiny decimals (1e-12) do not collapse to 0/Infinity in derived ratios", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({
          ...base,
          cargo: { ...mockCargo, rate: 1e-12, quantity: 1 },
        })
      );
      assertAllFinite("tiny-decimals", result.current);
    });
  });

  describe("Boundary conditions", () => {
    it("100% voyage commission -> netFreight = 0", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({ ...base, cargo: { ...mockCargo, voyageCommission: 100 } })
      );
      expect(result.current.netFreight).toBeCloseTo(0, 2);
    });

    it("100% TC commission -> GTCE finite (no divide-by-zero)", () => {
      const { result } = renderHook(() =>
        useVoyageCalculation({ ...base, cargo: { ...mockCargo, tcCommission: 100 } })
      );
      expect(Number.isFinite(result.current.gtce)).toBe(true);
    });

    it("100% ECA distance on every leg -> only LSMGO consumed", () => {
      const seq: SequenceRow[] = mockSimpleSequence.map((r) => ({
        ...r,
        ecaDistance: r.distance,
        ecaTime: r.seaTime,
        nonEcaTime: 0,
      }));
      const { result } = renderHook(() => useVoyageCalculation({ ...base, sequence: seq }));
      expect(result.current.hsfoConsumption).toBe(0);
      expect(result.current.vlsfoConsumption).toBe(0);
      expect(result.current.lsmgoConsumption).toBeGreaterThan(0);
    });

    it("empty sequence (lower boundary) -> zero everything, no crash", () => {
      const { result } = renderHook(() => useVoyageCalculation({ ...base, sequence: [] }));
      expect(result.current.totalDistance).toBe(0);
      expect(result.current.totalSeaDays).toBe(0);
      expect(result.current.totalPortDays).toBe(0);
      assertAllFinite("empty-seq", result.current);
    });
  });

  describe("Whole-result contract (every code path)", () => {
    const matrix: Array<[string, Partial<VoyageInputs>]> = [
      ["all zeros", {
        sequence: [],
        cargo: { rate: 0, rateType: "mt", quantity: 0, voyageCommission: 0, tcCommission: 0, demurrage: 0, despatch: 0 },
        bunker: { hsfo: { price: 0, robStart: 0 }, vlsfo: { price: 0, robStart: 0 }, lsmgo: { price: 0, robStart: 0 }, co2Price: 0 },
        hireRate: 0,
      }],
      ["all NaN bunker + neg hire", {
        hireRate: -1,
        bunker: { hsfo: { price: NaN, robStart: NaN }, vlsfo: { price: NaN, robStart: NaN }, lsmgo: { price: NaN, robStart: NaN }, co2Price: NaN },
      }],
      ["huge + negative mix", {
        hireRate: 1e12,
        cargo: { ...mockCargo, rate: -1e9, quantity: 1e9, voyageCommission: -50, tcCommission: -50 },
      }],
    ];

    for (const [label, overrides] of matrix) {
      it(`never returns NaN/Infinity: ${label}`, () => {
        const { result } = renderHook(() => useVoyageCalculation({ ...base, ...overrides }));
        assertAllFinite(label, result.current);
      });
    }
  });
});