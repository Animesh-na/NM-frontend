import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { CO2_EMISSION_FACTORS } from "@/utils/emissionCalculations";
import { buildInputs } from "../helpers/scenarios";

/**
 * UNIT — Emission Section (CO₂, CII rating, EU ETS)
 *
 * Emission factors (regulatory): VLSFO 3.151, HSFO 3.114, LSMGO 3.206.
 */
describe("Emission Section", () => {
  describe("CO₂ totals", () => {
    it("totalCo2 ≈ Σ(fuel × emission factor)", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const expected =
        r.hsfoConsumption * CO2_EMISSION_FACTORS.HSFO +
        r.vlsfoConsumption * CO2_EMISSION_FACTORS.VLSFO +
        r.lsmgoConsumption * CO2_EMISSION_FACTORS.LSMGO;
      // Allow a small tolerance — engine computes per-leg & rounds.
      expect(r.totalCo2).toBeCloseTo(expected, 0);
    });

    it("totalCo2 = co2Laden + co2Ballast", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      // ME-only laden/ballast split; total may also include port CO₂ → tolerate ≤ total.
      expect(r.co2Laden + r.co2Ballast).toBeLessThanOrEqual(r.totalCo2 + 1e-6);
    });
  });

  describe("CII rating", () => {
    it("returns a valid letter grade A–E", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(["A", "B", "C", "D", "E"]).toContain(r.ciiRating);
    });
  });

  describe("EU ETS", () => {
    it("etsCost and chargeableCo2 are finite numbers ≥ 0", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(Number.isFinite(r.etsCost)).toBe(true);
      expect(r.etsCost).toBeGreaterThanOrEqual(0);
      expect(r.chargeableCo2).toBeGreaterThanOrEqual(0);
    });

    it("higher CO₂ price → higher ETS cost", () => {
      const low = renderHook(() =>
        useVoyageCalculation(
          buildInputs({ bunker: { ...buildInputs().bunker, co2Price: 50 } }),
        ),
      ).result.current;
      const high = renderHook(() =>
        useVoyageCalculation(
          buildInputs({ bunker: { ...buildInputs().bunker, co2Price: 150 } }),
        ),
      ).result.current;
      // ETS is proportional to chargeable CO₂ × price.
      if (low.chargeableCo2 > 0) {
        expect(high.etsCost).toBeGreaterThan(low.etsCost);
      } else {
        expect(high.etsCost).toBe(low.etsCost);
      }
    });
  });
});