import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { buildInputs, mockCargo, mockCargoLumpsum } from "../helpers/scenarios";

/**
 * UNIT — Cargo Section (freight, commissions, TCE/NTCE/GTCE, P&L)
 */
describe("Cargo Section", () => {
  describe("Gross Freight", () => {
    it("per-MT cargo: grossFreight = rate × quantity", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(r.grossFreight).toBeCloseTo(mockCargo.rate * mockCargo.quantity, 2);
    });

    it("lumpsum cargo: grossFreight = rate (independent of quantity)", () => {
      const r = renderHook(() =>
        useVoyageCalculation(buildInputs({ cargo: mockCargoLumpsum })),
      ).result.current;
      expect(r.grossFreight).toBeCloseTo(mockCargoLumpsum.rate, 2);
    });
  });

  describe("Commissions", () => {
    it("voyageCommission = grossFreight × voyageCommission%", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const expected = r.grossFreight * (mockCargo.voyageCommission / 100);
      expect(r.voyageCommission).toBeCloseTo(expected, 2);
    });

    it("netFreight = grossFreight − voyageCommission", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(r.netFreight).toBeCloseTo(r.grossFreight - r.voyageCommission, 2);
    });
  });

  describe("TCE / NTCE / GTCE", () => {
    it("all metrics are finite numbers", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(Number.isFinite(r.tce)).toBe(true);
      expect(Number.isFinite(r.ntce)).toBe(true);
      expect(Number.isFinite(r.gtce)).toBe(true);
    });

    it("GTCE >= NTCE (TC commission grosses NTCE up)", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(r.gtce).toBeGreaterThanOrEqual(r.ntce);
    });

    it("higher freight rate → higher P&L (all else equal)", () => {
      const low = renderHook(() =>
        useVoyageCalculation(buildInputs({ cargo: { ...mockCargo, rate: 20 } })),
      ).result.current;
      const high = renderHook(() =>
        useVoyageCalculation(buildInputs({ cargo: { ...mockCargo, rate: 40 } })),
      ).result.current;
      expect(high.pAndL).toBeGreaterThan(low.pAndL);
    });
  });

  describe("Edge case: zero rate", () => {
    it("rate = 0 → grossFreight 0 and finite NTCE (negative)", () => {
      const r = renderHook(() =>
        useVoyageCalculation(buildInputs({ cargo: { ...mockCargo, rate: 0 } })),
      ).result.current;
      expect(r.grossFreight).toBe(0);
      expect(Number.isFinite(r.ntce)).toBe(true);
      expect(r.ntce).toBeLessThanOrEqual(0);
    });
  });
});