import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { buildInputs, mockMiscCosts, mockExtraTime } from "../helpers/scenarios";

/**
 * UNIT — Misc Section (misc costs, canal costs, extra time)
 */
describe("Misc Section", () => {
  describe("Misc costs", () => {
    it("miscCosts = miscCost + extraFees + extraInsurance", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const expected =
        mockMiscCosts.miscCost + mockMiscCosts.extraFees + mockMiscCosts.extraInsurance;
      expect(r.miscCosts).toBeCloseTo(expected, 2);
    });

    it("zero misc inputs → miscCosts = 0", () => {
      const r = renderHook(() =>
        useVoyageCalculation(
          buildInputs({
            misc: { miscCost: 0, extraFees: 0, extraInsurance: 0, canalCost1: 0, canalCost2: 0 },
          }),
        ),
      ).result.current;
      expect(r.miscCosts).toBe(0);
    });
  });

  describe("Canal costs", () => {
    it("canalCosts = canalCost1 + canalCost2", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(r.canalCosts).toBeCloseTo(mockMiscCosts.canalCost1 + mockMiscCosts.canalCost2, 2);
    });
  });

  describe("Extra time", () => {
    it("idle/canal/at-sea extra days flow into totalVoyageDays", () => {
      const noExtra = renderHook(() =>
        useVoyageCalculation(
          buildInputs({
            extraTime: { canal1Days: 0, canal2Days: 0, idlePortDays: 0, atSeaDays: 0, atSeaSpeedContext: "EV" },
          }),
        ),
      ).result.current;
      const withExtra = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const expectedDelta =
        (mockExtraTime.canal1Days + mockExtraTime.canal2Days) +
        mockExtraTime.idlePortDays +
        mockExtraTime.atSeaDays;
      expect(withExtra.totalVoyageDays - noExtra.totalVoyageDays).toBeCloseTo(expectedDelta, 4);
    });
  });

  describe("Cost roll-up", () => {
    it("totalVoyageCosts = bunker + port + misc + canal", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const expected = r.totalBunkerCost + r.portCosts + r.miscCosts + r.canalCosts;
      expect(r.totalVoyageCosts).toBeCloseTo(expected, 2);
    });
  });
});