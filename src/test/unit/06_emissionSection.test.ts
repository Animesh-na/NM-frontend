import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { CO2_EMISSION_FACTORS } from "@/utils/emissionCalculations";
import { createVoyageTestInputs, customBunker, customLeg, customVessel } from "../helpers/scenarios";

/**
 * UNIT — Emission Section (CO₂, CII rating, EU ETS)
 */
describe("Emission Section", () => {
  describe("CO₂ totals", () => {
    it("custom totalCo2 equals Σ(fuel × regulatory emission factor)", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", distance: 1_000, ecaDistance: 0, seaTime: 3, ecaTime: 0, nonEcaTime: 3 }),
        customLeg({ id: 2, operation: "disch", distance: 2_000, ecaDistance: 200, seaTime: 6, ecaTime: 0.6, nonEcaTime: 5.4 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;
      const expected =
        r.hsfoConsumption * CO2_EMISSION_FACTORS.hsfo +
        r.vlsfoConsumption * CO2_EMISSION_FACTORS.vlsfo +
        r.lsmgoConsumption * CO2_EMISSION_FACTORS.lsmgo;

      expect(r.totalCo2).toBeCloseTo(expected, 0);
    });

    it("custom co2Laden plus co2Ballast does not exceed totalCo2", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", seaTime: 4, ecaTime: 0, nonEcaTime: 4, portDays: 1 }),
        customLeg({ id: 2, operation: "disch", seaTime: 8, ecaTime: 1, nonEcaTime: 7, portDays: 2 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;

      expect(r.co2Laden + r.co2Ballast).toBeLessThanOrEqual(r.totalCo2 + 1e-6);
    });
  });

  describe("CII rating", () => {
    it("custom vessel returns a valid CII letter grade A–E", () => {
      const vessel = customVessel({ type: "bulk_carrier", dwt: 82_000 });
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ vessel }))).result.current;

      expect(["A", "B", "C", "D", "E"]).toContain(r.ciiRating);
    });
  });

  describe("EU ETS", () => {
    it("custom EU-covered voyage returns finite ETS cost and non-negative chargeable CO₂", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", port: "Rotterdam", portUnloc: "NLRTM", ecaDistance: 300, seaTime: 4, ecaTime: 1.2, nonEcaTime: 2.8 }),
        customLeg({ id: 2, operation: "disch", port: "Hamburg", portUnloc: "DEHAM", ecaDistance: 300, seaTime: 3, ecaTime: 1, nonEcaTime: 2 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence, bunker: customBunker({ co2Price: 90 }) }))).result.current;

      expect(Number.isFinite(r.etsCost)).toBe(true);
      expect(r.etsCost).toBeGreaterThanOrEqual(0);
      expect(r.chargeableCo2).toBeGreaterThanOrEqual(0);
    });

    it("higher custom CO₂ price increases ETS cost when chargeable CO₂ exists", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", port: "Rotterdam", portUnloc: "NLRTM", ecaDistance: 200, seaTime: 3, ecaTime: 1, nonEcaTime: 2 }),
        customLeg({ id: 2, operation: "disch", port: "Antwerp", portUnloc: "BEANR", ecaDistance: 200, seaTime: 3, ecaTime: 1, nonEcaTime: 2 }),
      ];
      const low = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ sequence, bunker: customBunker({ co2Price: 50 }) })),
      ).result.current;
      const high = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ sequence, bunker: customBunker({ co2Price: 150 }) })),
      ).result.current;

      if (low.chargeableCo2 > 0) {
        expect(high.etsCost).toBeGreaterThan(low.etsCost);
      } else {
        expect(high.etsCost).toBe(low.etsCost);
      }
    });
  });
});