import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "../helpers/mockVesselData";
import { mockSimpleSequence, mockCargo, mockBunker } from "../helpers/mockSequenceData";

/**
 * UNIT TEST: Voyage Time Section
 * Tests sea days, port days, extra time, sea margin, and total voyage days.
 */
describe("Voyage Time Section", () => {
  const baseInputs: VoyageInputs = {
    vessel: mockVessel,
    sequence: mockSimpleSequence,
    cargo: mockCargo,
    bunker: mockBunker,
    hireRate: 15000,
  };

  it("should calculate total distance correctly", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    // Leg 1: 1000nm + Leg 2: 5500nm = 6500nm
    expect(result.current.totalDistance).toBe(6500);
  });

  it("should calculate total ECA distance correctly", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    // Leg 1: 0nm ECA + Leg 2: 500nm ECA = 500nm
    expect(result.current.totalEcaDistance).toBe(500);
  });

  it("should split sea days into ballast and laden based on quantity", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    // Both legs have quantity=65000 → both are LADEN (quantity > 0)
    // Leg 1 seaTime=3.33 → laden (quantity=65000)
    // Leg 2 seaTime=18.33 → laden (quantity=65000)
    expect(result.current.seaDaysBallast).toBeCloseTo(0, 1);
    expect(result.current.seaDaysLaden).toBeCloseTo(21.66, 1);
  });

  it("should calculate total sea days", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    expect(result.current.totalSeaDays).toBeCloseTo(3.33 + 18.33, 1);
  });

  it("should calculate total port days", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    // Leg 1: 3 days + Leg 2: 4 days = 7 days
    expect(result.current.totalPortDays).toBe(7);
  });

  it("should track base sea time and sea margin time separately", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    // Leg 1: baseSeaTime=3.18, seaMarginTime=0.15
    // Leg 2: baseSeaTime=17.46, seaMarginTime=0.87
    expect(result.current.baseSeaTime).toBeCloseTo(3.18 + 17.46, 1);
    expect(result.current.seaMarginTime).toBeCloseTo(0.15 + 0.87, 1);
  });

  it("should calculate total voyage days correctly", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    // totalSeaDays + totalPortDays + extraPortDays + extraCanalDays
    const expected = result.current.totalSeaDays + result.current.totalPortDays +
      result.current.extraPortDays + result.current.extraCanalDays;
    expect(result.current.totalVoyageDays).toBeCloseTo(expected, 2);
  });

  it("should include extra time in voyage days", () => {
    const withExtra: VoyageInputs = {
      ...baseInputs,
      extraTime: { canal1Days: 1, canal2Days: 0.5, idlePortDays: 2, atSeaDays: 1, atSeaSpeedContext: "EV" },
    };
    const { result: baseResult } = renderHook(() => useVoyageCalculation(baseInputs));
    const { result: extraResult } = renderHook(() => useVoyageCalculation(withExtra));

    expect(extraResult.current.extraSeaDays).toBe(1);
    expect(extraResult.current.extraPortDays).toBe(2);
    expect(extraResult.current.extraCanalDays).toBe(1.5);
    expect(extraResult.current.totalVoyageDays).toBeGreaterThan(baseResult.current.totalVoyageDays);
  });

  it("should return non-ECA distance", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    expect(result.current.nonEcaDistance).toBe(6500 - 500);
  });
});
