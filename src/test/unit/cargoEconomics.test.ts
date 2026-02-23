import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "../helpers/mockVesselData";
import { mockSimpleSequence, mockCargo, mockCargoLumpsum, mockBunker } from "../helpers/mockSequenceData";

/**
 * UNIT TEST: Cargo Economics Section
 * Tests freight, commissions, TCE, NTCE, GTCE, P&L.
 */
describe("Cargo Economics Section", () => {
  const baseInputs: VoyageInputs = {
    vessel: mockVessel,
    sequence: mockSimpleSequence,
    cargo: mockCargo,
    bunker: mockBunker,
    hireRate: 15000,
  };

  describe("Freight Calculation", () => {
    it("should calculate gross freight = rate * quantity for per-mt rate", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      // 25 $/mt * 65000 mt = 1,625,000
      expect(result.current.grossFreight).toBe(25 * 65000);
    });

    it("should use lumpsum rate directly for lumpsum type", () => {
      const lsInputs: VoyageInputs = { ...baseInputs, cargo: mockCargoLumpsum };
      const { result } = renderHook(() => useVoyageCalculation(lsInputs));
      expect(result.current.grossFreight).toBe(1500000);
    });

    it("should deduct voyage commission from gross freight", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      // Commission = 3.75% of 1,625,000 = 60,937.50
      expect(result.current.voyageCommission).toBeCloseTo(1625000 * 0.0375, 2);
      expect(result.current.netFreight).toBeCloseTo(1625000 - 1625000 * 0.0375, 2);
    });
  });

  describe("Port Costs", () => {
    it("should sum all port DA costs", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      // Leg 1: 25000 + Leg 2: 35000 = 60000
      expect(result.current.portCosts).toBe(60000);
    });
  });

  describe("TCE / NTCE / GTCE", () => {
    it("should calculate NTCE = (netFreight - voyageCosts) / totalDays", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      const expectedNtce = (result.current.netFreight - result.current.totalVoyageCosts) / result.current.totalVoyageDays;
      expect(result.current.ntce).toBeCloseTo(expectedNtce, 2);
    });

    it("should calculate GTCE = NTCE / (1 - tcCommission%)", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      const expectedGtce = result.current.ntce / (1 - mockCargo.tcCommission / 100);
      expect(result.current.gtce).toBeCloseTo(expectedGtce, 2);
    });

    it("should set TCE equal to GTCE", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      expect(result.current.tce).toBe(result.current.gtce);
    });
  });

  describe("P&L", () => {
    it("should calculate P&L = voyageResult - hireCost", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      const netFreight = result.current.netFreight;
      const voyageResult = netFreight - result.current.totalVoyageCosts + mockCargo.demurrage - mockCargo.despatch;
      const expectedPnl = voyageResult - result.current.hireCost;
      expect(result.current.pAndL).toBeCloseTo(expectedPnl, 2);
    });

    it("should include demurrage in profit", () => {
      const noDemurrage: VoyageInputs = { ...baseInputs, cargo: { ...mockCargo, demurrage: 0 } };
      const { result: withDem } = renderHook(() => useVoyageCalculation(baseInputs));
      const { result: noDem } = renderHook(() => useVoyageCalculation(noDemurrage));
      expect(withDem.current.pAndL).toBeGreaterThan(noDem.current.pAndL);
    });

    it("should deduct despatch from profit", () => {
      const withDespatch: VoyageInputs = {
        ...baseInputs,
        cargo: { ...mockCargo, despatch: 10000 },
      };
      const { result: base } = renderHook(() => useVoyageCalculation(baseInputs));
      const { result: desp } = renderHook(() => useVoyageCalculation(withDespatch));
      expect(desp.current.pAndL).toBeLessThan(base.current.pAndL);
    });
  });

  describe("Hire Cost", () => {
    it("should calculate hire cost = hireRate * totalVoyageDays", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      expect(result.current.hireCost).toBeCloseTo(15000 * result.current.totalVoyageDays, 2);
    });
  });
});
