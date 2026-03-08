import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel, mockVesselFullSpeed } from "../helpers/mockVesselData";
import { mockSimpleSequence, mockCargo, mockBunker } from "../helpers/mockSequenceData";

/**
 * UNIT TEST: Vessel Section
 * Tests vessel speed profile selection and consumption profile resolution.
 */
describe("Vessel Section", () => {
  const baseInputs: VoyageInputs = {
    vessel: mockVessel,
    sequence: mockSimpleSequence,
    cargo: mockCargo,
    bunker: mockBunker,
    hireRate: 15000,
  };

  it("should use eco consumption profile when speedProfile is eco", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    const r = result.current;

    // mockVessel has hasScrubber=false → VLSFO only, HSFO=0
    // Eco speed VLSFO: ballast=5, laden=5.5 TPD
    expect(r.hsfoConsumption).toBe(0);
    expect(r.vlsfoConsumption).toBeGreaterThan(0);
    expect(r.totalBunkerCost).toBeGreaterThan(0);
  });

  it("should use full consumption profile when speedProfile is full", () => {
    const fullInputs: VoyageInputs = { ...baseInputs, vessel: mockVesselFullSpeed };
    const { result: ecoResult } = renderHook(() => useVoyageCalculation(baseInputs));
    const { result: fullResult } = renderHook(() => useVoyageCalculation(fullInputs));

    // Full speed has higher consumption rates, so fuel should be higher
    expect(fullResult.current.hsfoConsumption).toBeGreaterThan(ecoResult.current.hsfoConsumption);
    expect(fullResult.current.vlsfoConsumption).toBeGreaterThan(ecoResult.current.vlsfoConsumption);
    expect(fullResult.current.totalBunkerCost).toBeGreaterThan(ecoResult.current.totalBunkerCost);
  });

  it("should apply reward factor to reduce consumption", () => {
    const rewardInputs: VoyageInputs = {
      ...baseInputs,
      bunker: { ...mockBunker, rewardFactor: 0.9 },
    };
    const { result: normalResult } = renderHook(() => useVoyageCalculation(baseInputs));
    const { result: rewardResult } = renderHook(() => useVoyageCalculation(rewardInputs));

    // 0.9 reward factor should reduce sea consumption by 10%
    expect(rewardResult.current.hsfoConsumption).toBeLessThan(normalResult.current.hsfoConsumption);
  });

  it("should use vessel DWT for CII calculation", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    // CII = totalCO2 / (DWT * distance), DWT = 75000
    expect(result.current.ciiResult).toBeDefined();
    expect(result.current.afrCii).toBeGreaterThan(0);
  });
});
