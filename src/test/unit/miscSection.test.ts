import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "../helpers/mockVesselData";
import { mockSimpleSequence, mockCargo, mockBunker, mockMiscCosts, mockExtraTime } from "../helpers/mockSequenceData";

/**
 * UNIT TEST: Misc Section
 * Tests misc costs, canal costs, extra time, and their impact on voyage results.
 */
describe("Misc Section", () => {
  const baseInputs: VoyageInputs = {
    vessel: mockVessel,
    sequence: mockSimpleSequence,
    cargo: mockCargo,
    bunker: mockBunker,
    hireRate: 15000,
  };

  describe("Misc Costs", () => {
    it("should sum miscCost + extraFees + extraInsurance", () => {
      const inputs: VoyageInputs = { ...baseInputs, misc: mockMiscCosts };
      const { result } = renderHook(() => useVoyageCalculation(inputs));
      // 5000 + 2000 + 3000 = 10000
      expect(result.current.miscCosts).toBe(10000);
    });

    it("should return 0 misc costs when no misc data", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      expect(result.current.miscCosts).toBe(0);
    });
  });

  describe("Canal Costs", () => {
    it("should sum canalCost1 + canalCost2", () => {
      const inputs: VoyageInputs = { ...baseInputs, misc: mockMiscCosts };
      const { result } = renderHook(() => useVoyageCalculation(inputs));
      // 50000 + 0 = 50000
      expect(result.current.canalCosts).toBe(50000);
    });
  });

  describe("Extra Time", () => {
    it("should add extra canal days to voyage", () => {
      const inputs: VoyageInputs = { ...baseInputs, extraTime: mockExtraTime };
      const { result } = renderHook(() => useVoyageCalculation(inputs));
      expect(result.current.extraCanalDays).toBe(1); // canal1=1, canal2=0
    });

    it("should add extra port days to voyage", () => {
      const inputs: VoyageInputs = { ...baseInputs, extraTime: mockExtraTime };
      const { result } = renderHook(() => useVoyageCalculation(inputs));
      expect(result.current.extraPortDays).toBe(0.5);
    });

    it("should increase total voyage days with extra time", () => {
      const { result: baseResult } = renderHook(() => useVoyageCalculation(baseInputs));
      const inputs: VoyageInputs = { ...baseInputs, extraTime: mockExtraTime };
      const { result: extraResult } = renderHook(() => useVoyageCalculation(inputs));

      const addedDays = mockExtraTime.canal1Days + mockExtraTime.canal2Days +
        mockExtraTime.idlePortDays + mockExtraTime.atSeaDays;
      expect(extraResult.current.totalVoyageDays).toBeCloseTo(
        baseResult.current.totalVoyageDays + addedDays, 2
      );
    });
  });

  describe("Total Voyage Costs", () => {
    it("should include misc and canal costs in total voyage costs", () => {
      const inputs: VoyageInputs = { ...baseInputs, misc: mockMiscCosts };
      const { result: baseResult } = renderHook(() => useVoyageCalculation(baseInputs));
      const { result: miscResult } = renderHook(() => useVoyageCalculation(inputs));

      // Total voyage costs = bunker + port + misc + canal
      expect(miscResult.current.totalVoyageCosts).toBe(
        miscResult.current.totalBunkerCost + miscResult.current.portCosts +
        miscResult.current.miscCosts + miscResult.current.canalCosts
      );
      expect(miscResult.current.totalVoyageCosts).toBeGreaterThan(baseResult.current.totalVoyageCosts);
    });
  });
});
