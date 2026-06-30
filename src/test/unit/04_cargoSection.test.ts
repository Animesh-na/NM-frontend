import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customCargo, customLeg } from "../helpers/scenarios";

const expectedGross = (rate: number, qty: number, dem = 0, des = 0, lumpsum = false) =>
  (lumpsum ? rate : rate * qty) + dem - des;

/**
 * UNIT — Cargo Section (freight, commissions, TCE/NTCE/GTCE, P&L)
 */
describe("Cargo Section", () => {
  describe("Gross Freight", () => {
    it("custom per-MT cargo grossFreight equals rate × quantity plus demurrage minus despatch", () => {
      const cargo = customCargo({ rate: 32, rateType: "mt", quantity: 44_000, demurrage: 12_000, despatch: 2_000 });
      const sequence = [
        customLeg({ id: 1, operation: "load", quantity: 44_000 }),
        customLeg({ id: 2, operation: "disch", quantity: 44_000 }),
      ];

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ cargo, sequence }))).result.current;

      expect(r.grossFreight).toBeCloseTo(expectedGross(32, 44_000, 12_000, 2_000), 2);
    });

    it("custom lumpsum cargo grossFreight equals lumpsum rate plus demurrage minus despatch", () => {
      const cargo = customCargo({ rate: 1_750_000, rateType: "lumpsum", quantity: 58_000, demurrage: 0, despatch: 5_000 });
      const sequence = [
        customLeg({ id: 1, operation: "load", quantity: 58_000 }),
        customLeg({ id: 2, operation: "disch", quantity: 58_000 }),
      ];

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ cargo, sequence }))).result.current;

      expect(r.grossFreight).toBeCloseTo(expectedGross(1_750_000, 58_000, 0, 5_000, true), 2);
    });
  });

  describe("Commissions", () => {
    it("voyageCommission equals custom grossFreight × custom commission percentage", () => {
      const cargo = customCargo({ rate: 28, quantity: 52_000, voyageCommission: 4.25, demurrage: 10_000 });

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ cargo }))).result.current;
      const expected = r.grossFreight * 0.0425;

      expect(r.voyageCommission).toBeCloseTo(expected, 2);
    });

    it("netFreight equals custom grossFreight minus voyageCommission", () => {
      const cargo = customCargo({ rate: 35, quantity: 40_000, voyageCommission: 3.5 });

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ cargo }))).result.current;

      expect(r.netFreight).toBeCloseTo(r.grossFreight - r.voyageCommission, 2);
    });
  });

  describe("TCE / NTCE / GTCE", () => {
    it("custom profitable cargo returns finite TCE, NTCE, and GTCE values", () => {
      const cargo = customCargo({ rate: 40, quantity: 55_000, tcCommission: 2 });

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ cargo, hireRate: 13_500 }))).result.current;

      expect(Number.isFinite(r.tce)).toBe(true);
      expect(Number.isFinite(r.ntce)).toBe(true);
      expect(Number.isFinite(r.gtce)).toBe(true);
    });

    it("custom GTCE is greater than or equal to NTCE when TC commission is positive", () => {
      const cargo = customCargo({ rate: 36, quantity: 48_000, tcCommission: 3 });

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ cargo }))).result.current;

      expect(r.gtce).toBeGreaterThanOrEqual(r.ntce);
    });

    it("higher custom freight rate increases P&L when all other inputs are identical", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", quantity: 50_000 }),
        customLeg({ id: 2, operation: "disch", quantity: 50_000 }),
      ];
      const lowCargo = customCargo({ rate: 20, quantity: 50_000 });
      const highCargo = customCargo({ rate: 40, quantity: 50_000 });

      const low = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ cargo: lowCargo, sequence }))).result.current;
      const high = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ cargo: highCargo, sequence }))).result.current;

      expect(high.pAndL).toBeGreaterThan(low.pAndL);
    });
  });

  describe("Edge case: zero rate", () => {
    it("custom zero-rate cargo has zero grossFreight and finite NTCE", () => {
      const cargo = customCargo({ rate: 0, quantity: 45_000, demurrage: 0, despatch: 0 });

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ cargo }))).result.current;

      expect(r.grossFreight).toBe(0);
      expect(Number.isFinite(r.ntce)).toBe(true);
      expect(r.ntce).toBeLessThanOrEqual(0);
    });
  });
});