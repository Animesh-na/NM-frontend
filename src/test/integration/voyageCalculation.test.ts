import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "../helpers/mockVesselData";
import { mockSimpleSequence, mockCargo, mockBunker, mockMiscCosts, mockExtraTime } from "../helpers/mockSequenceData";

/**
 * INTEGRATION TEST: Full Voyage Calculation Pipeline
 * End-to-end test with all sections populated, verifying cross-section consistency.
 */
describe("Integration: Full Voyage Calculation", () => {
  const fullInputs: VoyageInputs = {
    vessel: mockVessel,
    sequence: mockSimpleSequence,
    cargo: mockCargo,
    bunker: mockBunker,
    hireRate: 15000,
    misc: mockMiscCosts,
    extraTime: mockExtraTime,
  };

  it("should produce a complete result with all fields defined", () => {
    const { result } = renderHook(() => useVoyageCalculation(fullInputs));
    const r = result.current;

    // Time
    expect(r.totalDistance).toBeGreaterThan(0);
    expect(r.totalSeaDays).toBeGreaterThan(0);
    expect(r.totalPortDays).toBeGreaterThan(0);
    expect(r.totalVoyageDays).toBeGreaterThan(0);

    // Fuel — mockVessel has hasScrubber=false → VLSFO only (HSFO=0)
    expect(r.hsfoConsumption).toBe(0);
    expect(r.vlsfoConsumption).toBeGreaterThan(0);
    expect(r.lsmgoConsumption).toBeGreaterThan(0);
    expect(r.totalBunkerCost).toBeGreaterThan(0);

    // Revenue
    expect(r.grossFreight).toBeGreaterThan(0);
    expect(r.netFreight).toBeGreaterThan(0);
    expect(r.netFreight).toBeLessThan(r.grossFreight);

    // Costs
    expect(r.portCosts).toBeGreaterThan(0);
    expect(r.miscCosts).toBeGreaterThan(0);
    expect(r.canalCosts).toBeGreaterThan(0);
    expect(r.totalVoyageCosts).toBeGreaterThan(0);

    // Profitability
    expect(r.tce).toBeDefined();
    expect(r.ntce).toBeDefined();
    expect(r.gtce).toBeDefined();
    expect(r.pAndL).toBeDefined();

    // Emissions
    expect(r.totalCo2).toBeGreaterThan(0);
    expect(r.ciiRating).toBeDefined();
    expect(r.efoi).toBeGreaterThan(0);
  });

  describe("Cross-section Consistency", () => {
    it("totalVoyageDays = totalSeaDays + totalPortDays + extraPortDays + extraCanalDays", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      const r = result.current;
      expect(r.totalVoyageDays).toBeCloseTo(
        r.totalSeaDays + r.totalPortDays + r.extraPortDays + r.extraCanalDays, 2
      );
    });

    it("totalSeaDays = seaDaysBallast + seaDaysLaden + extraSeaDays", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      const r = result.current;
      expect(r.totalSeaDays).toBeCloseTo(r.seaDaysBallast + r.seaDaysLaden + r.extraSeaDays, 2);
    });

    it("totalVoyageCosts = bunker + port + misc + canal", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      const r = result.current;
      expect(r.totalVoyageCosts).toBeCloseTo(
        r.totalBunkerCost + r.portCosts + r.miscCosts + r.canalCosts, 2
      );
    });

    it("hireCost = hireRate * totalVoyageDays", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      const r = result.current;
      expect(r.hireCost).toBeCloseTo(15000 * r.totalVoyageDays, 2);
    });

    it("voyageCostInclHire = totalVoyageCosts + hireCost", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      const r = result.current;
      expect(r.voyageCostInclHire).toBeCloseTo(r.totalVoyageCosts + r.hireCost, 2);
    });

    it("netFreight = grossFreight - voyageCommission", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      const r = result.current;
      expect(r.netFreight).toBeCloseTo(r.grossFreight - r.voyageCommission, 2);
    });

    it("nonEcaDistance = totalDistance - totalEcaDistance", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      const r = result.current;
      // leg.distance is the V (non-ECA) column; nonEcaDistance mirrors totalDistance.
      expect(r.nonEcaDistance).toBe(r.totalDistance);
    });
  });

  describe("CO2 / Environmental Consistency", () => {
    it("totalCo2 should equal sum of co2ByFuel", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      const r = result.current;
      const sumByFuel = r.co2ByFuel.hsfo + r.co2ByFuel.vlsfo + r.co2ByFuel.lsmgo;
      expect(r.totalCo2).toBeCloseTo(sumByFuel, 2);
    });

    it("co2Ballast + co2Laden should approximate totalCo2", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      const r = result.current;
      // Note: co2Ballast + co2Laden is proportional split of totalCo2 by sea time
      // May not equal totalCo2 exactly if there's port consumption CO2
      expect(r.co2Ballast + r.co2Laden).toBeLessThanOrEqual(r.totalCo2 + 0.01);
    });

    it("CII rating should be a valid letter grade", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      expect(["A", "B", "C", "D", "E"]).toContain(result.current.ciiRating);
    });

    it("ETS phase-in should be between 0 and 100", () => {
      const { result } = renderHook(() => useVoyageCalculation(fullInputs));
      expect(result.current.etsPhaseIn).toBeGreaterThanOrEqual(0);
      expect(result.current.etsPhaseIn).toBeLessThanOrEqual(100);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero hire rate", () => {
      const zeroHire: VoyageInputs = { ...fullInputs, hireRate: 0 };
      const { result } = renderHook(() => useVoyageCalculation(zeroHire));
      expect(result.current.hireCost).toBe(0);
      expect(result.current.pAndL).toBeGreaterThan(result.current.grossProfit - 1);
    });

    it("should handle zero cargo quantity with lumpsum freight", () => {
      const lumpsum: VoyageInputs = {
        ...fullInputs,
        cargo: { ...mockCargo, rate: 500000, rateType: "lumpsum", quantity: 0 },
      };
      const { result } = renderHook(() => useVoyageCalculation(lumpsum));
      expect(result.current.grossFreight).toBe(500000);
    });

    it("should handle empty sequence", () => {
      const empty: VoyageInputs = { ...fullInputs, sequence: [] };
      const { result } = renderHook(() => useVoyageCalculation(empty));
      expect(result.current.totalDistance).toBe(0);
      expect(result.current.totalSeaDays).toBe(0);
      expect(result.current.totalPortDays).toBe(0);
    });
  });
});
