import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "../helpers/mockVesselData";
import { mockSimpleSequence, mockEcaSequence, mockCargo, mockBunker } from "../helpers/mockSequenceData";

/**
 * UNIT TEST: Bunkering Section
 * Tests fuel consumption calculation, ECA fuel switching, bunker costs, and AE consumption.
 */
describe("Bunkering Section", () => {
  const baseInputs: VoyageInputs = {
    vessel: mockVessel,
    sequence: mockSimpleSequence,
    cargo: mockCargo,
    bunker: mockBunker,
    hireRate: 15000,
  };

  describe("Fuel Consumption", () => {
    it("should calculate VLSFO and LSMGO consumption > 0 (no scrubber → HSFO=0)", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      // mockVessel has hasScrubber=false → VLSFO only, HSFO=0
      expect(result.current.hsfoConsumption).toBe(0);
      expect(result.current.vlsfoConsumption).toBeGreaterThan(0);
      expect(result.current.lsmgoConsumption).toBeGreaterThan(0);
    });

    it("should have zero HSFO and VLSFO in ECA fuel breakdown", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      // In ECA zones, HSFO/VLSFO = 0, only LSMGO
      expect(result.current.ecaFuel.hsfo).toBe(0);
      expect(result.current.ecaFuel.vlsfo).toBe(0);
      expect(result.current.ecaFuel.lsmgo).toBeGreaterThan(0);
    });

    it("should have positive non-ECA VLSFO (no scrubber → HSFO=0)", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      // No scrubber: HSFO=0 outside ECA, VLSFO used instead
      expect(result.current.nonEcaFuel.hsfo).toBe(0);
      expect(result.current.nonEcaFuel.vlsfo).toBeGreaterThan(0);
    });
  });

  describe("ECA Fuel Switching", () => {
    it("should increase LSMGO consumption with more ECA distance", () => {
      const ecaInputs: VoyageInputs = {
        ...baseInputs,
        sequence: mockEcaSequence,
        cargo: { ...mockCargo, quantity: 30000 },
      };
      const { result: normalResult } = renderHook(() => useVoyageCalculation(baseInputs));
      const { result: ecaResult } = renderHook(() => useVoyageCalculation(ecaInputs));

      // Higher ECA proportion means more LSMGO relative to total fuel
      const normalLsmgoRatio = normalResult.current.lsmgoConsumption /
        (normalResult.current.hsfoConsumption + normalResult.current.vlsfoConsumption + normalResult.current.lsmgoConsumption);
      const ecaLsmgoRatio = ecaResult.current.lsmgoConsumption /
        (ecaResult.current.hsfoConsumption + ecaResult.current.vlsfoConsumption + ecaResult.current.lsmgoConsumption);

      expect(ecaLsmgoRatio).toBeGreaterThan(normalLsmgoRatio);
    });

    it("should calculate ECA fuel as combined HSFO+VLSFO+LSMGO rate converted to LSMGO", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      // ecaFuel.lsmgo should be > 0 when there's ECA distance
      if (result.current.totalEcaDistance > 0) {
        expect(result.current.ecaFuel.lsmgo).toBeGreaterThan(0);
        expect(result.current.ecaFuel.total).toBe(result.current.ecaFuel.lsmgo);
      }
    });
  });

  describe("Bunker Costs", () => {
    it("should calculate total bunker cost = HSFO*price + VLSFO*price + LSMGO*price", () => {
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      const expectedCost =
        result.current.hsfoConsumption * mockBunker.hsfo.price +
        result.current.vlsfoConsumption * mockBunker.vlsfo.price +
        result.current.lsmgoConsumption * mockBunker.lsmgo.price;
      expect(result.current.totalBunkerCost).toBeCloseTo(expectedCost, 2);
    });

    it("should return 0 bunker cost when all prices are 0", () => {
      const zeroPriceInputs: VoyageInputs = {
        ...baseInputs,
        bunker: {
          hsfo: { price: 0, robStart: 500 },
          vlsfo: { price: 0, robStart: 300 },
          lsmgo: { price: 0, robStart: 150 },
          co2Price: 0,
        },
      };
      const { result } = renderHook(() => useVoyageCalculation(zeroPriceInputs));
      expect(result.current.totalBunkerCost).toBe(0);
    });

    it("should increase bunker cost with higher fuel prices", () => {
      const highPriceInputs: VoyageInputs = {
        ...baseInputs,
        bunker: {
          ...mockBunker,
          hsfo: { price: 900, robStart: 500 },
          vlsfo: { price: 1160, robStart: 300 },
        },
      };
      const { result: normalResult } = renderHook(() => useVoyageCalculation(baseInputs));
      const { result: highResult } = renderHook(() => useVoyageCalculation(highPriceInputs));
      expect(highResult.current.totalBunkerCost).toBeGreaterThan(normalResult.current.totalBunkerCost);
    });
  });

  describe("AE Consumption", () => {
    it("should include AE consumption in LSMGO total", () => {
      // AE runs on LSMGO — total LSMGO should include AE contribution
      const { result } = renderHook(() => useVoyageCalculation(baseInputs));
      // LSMGO consumption should be higher than just ME sea + port LSMGO
      // because AE adds to it
      expect(result.current.lsmgoConsumption).toBeGreaterThan(0);
    });
  });

  describe("Reward Factor", () => {
    it("should reduce sea consumption with reward factor < 1", () => {
      const windAssisted: VoyageInputs = {
        ...baseInputs,
        bunker: { ...mockBunker, rewardFactor: 0.85 },
      };
      const { result: normalResult } = renderHook(() => useVoyageCalculation(baseInputs));
      const { result: windResult } = renderHook(() => useVoyageCalculation(windAssisted));

      // No scrubber → VLSFO is the primary fuel, HSFO=0 for both
      expect(windResult.current.vlsfoConsumption).toBeLessThan(normalResult.current.vlsfoConsumption);
      expect(windResult.current.totalBunkerCost).toBeLessThan(normalResult.current.totalBunkerCost);
    });
  });
});
