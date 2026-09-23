import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customExtraTime, customMiscCosts } from "../helpers/scenarios";

/**
 * UNIT — Misc Section (misc costs, canal costs, extra time)
 */
describe("Misc Section", () => {
  describe("Misc costs", () => {
    it("custom miscCosts equals miscCost + extraFees + extraInsurance", () => {
      const misc = customMiscCosts({ miscCost: 7_500, extraFees: 1_250, extraInsurance: 2_750, canalCost1: 0 });

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ misc }))).result.current;

      expect(r.miscCosts).toBeCloseTo(11_500, 2);
    });

    it("custom zero misc inputs produce zero miscCosts", () => {
      const misc = customMiscCosts({ miscCost: 0, extraFees: 0, extraInsurance: 0, canalCost1: 0 });

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ misc }))).result.current;

      expect(r.miscCosts).toBe(0);
    });
  });

  describe("Canal costs", () => {
    it("custom canalCosts equals canalCost1", () => {
      const misc = customMiscCosts({ canalCost1: 45_000 });

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ misc }))).result.current;

      expect(r.canalCosts).toBeCloseTo(45_000, 2);
    });
  });

  describe("Extra time", () => {
    it("custom canal extra days flow into totalVoyageDays", () => {
      const noExtra = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ extraTime: customExtraTime({ canal1Days: 0 }) })),
      ).result.current;
      const withExtra = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ extraTime: customExtraTime({ canal1Days: 1.25 }) })),
      ).result.current;

      expect(withExtra.totalVoyageDays - noExtra.totalVoyageDays).toBeCloseTo(1.25, 4);
    });
  });

  describe("Cost roll-up", () => {
    it("custom totalVoyageCosts equals bunker + port + misc + canal", () => {
      const misc = customMiscCosts({ miscCost: 2_000, extraFees: 3_000, extraInsurance: 4_000, canalCost1: 10_000 });

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ misc }))).result.current;
      const expected = r.totalBunkerCost + r.portCosts + r.miscCosts + r.canalCosts;

      expect(r.totalVoyageCosts).toBeCloseTo(expected, 2);
    });
  });
});