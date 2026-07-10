import { describe, it, expect } from "vitest";
import { validateSequence, validateCargos, type SequenceRowForValidation } from "@/utils/validation";
import { validateCargoAssignments } from "@/utils/cargoValidation";
import type { CargoEntry, SequenceRowUI } from "@/context/VoyageContext";

/**
 * UNIT — Cargo Quantity Validation.
 *   - Quantity is required at BOTH load and discharge ports.
 *   - Total loaded == total discharged for each cargo across all assigned ports.
 */

const uiRow = (over: Partial<SequenceRowUI>): SequenceRowUI => ({
  id: 1,
  type: "port",
  operation: "loading",
  port: "Santos",
  portUnloc: "BRSSZ",
  distance: 1000,
  ecaDistance: 0,
  quantity: 0,
  turnTime: 0,
  extraTime: 0,
  expDa: 25000,
  terms: "shinc",
  customTermsName: "",
  productivity: 20000,
  cranes: 0,
  seaMargin: 5,
  coefficientFactor: 1,
  calculatedPortDays: 0,
  assignedCargoIds: [],
  ...over,
} as unknown as SequenceRowUI);

const cargo = (over: Partial<CargoEntry> = {}): CargoEntry => ({
  id: 1,
  rate: 25,
  rateType: "mt",
  quantity: 50000,
  voyageCommission: 3.75,
  tcCommission: 2.5,
  demurrageRate: 15000,
  despatchRate: 7500,
  demurrageAmount: 0,
  despatchAmount: 0,
  averageMode: "average",
  ntcBase: 0,
  gtcTarget: 0,
  stowageFactor: 0,
  ...over,
});

describe("Cargo Quantity Validation", () => {
  describe("Quantity required at load and discharge ports", () => {
    it("load port with quantity = 0 → quantity error", () => {
      const rows: SequenceRowForValidation[] = [
        { id: 1, type: "port", operation: "loading", port: "Santos", distance: 1000, ecaDistance: 0, expDa: 25000, quantity: 0 },
      ];
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "quantity" && i.rowId === 1)).toBe(true);
    });

    it("discharge port with quantity = 0 → quantity error", () => {
      const rows: SequenceRowForValidation[] = [
        { id: 2, type: "port", operation: "discharging", port: "Rotterdam", distance: 5500, ecaDistance: 100, expDa: 35000, quantity: 0 },
      ];
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "quantity" && i.rowId === 2)).toBe(true);
    });

    it("both load and discharge have positive quantity → no quantity error", () => {
      const rows: SequenceRowForValidation[] = [
        { id: 1, type: "port", operation: "loading", port: "Santos", distance: 1000, ecaDistance: 0, expDa: 25000, quantity: 50000 },
        { id: 2, type: "port", operation: "discharging", port: "Rotterdam", distance: 5500, ecaDistance: 100, expDa: 35000, quantity: 50000 },
      ];
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "quantity")).toBe(false);
    });
  });

  describe("Loaded quantity must equal discharged quantity (per cargo)", () => {
    it("balanced across two discharge ports (30k + 20k = 50k loaded) → no error", () => {
      const sequence = [
        uiRow({ id: 1, operation: "loading", quantity: 50000, assignedCargoIds: [1] }),
        uiRow({ id: 2, operation: "discharging", port: "Rotterdam", portUnloc: "NLRTM", quantity: 30000, assignedCargoIds: [1] }),
        uiRow({ id: 3, operation: "discharging", port: "Hamburg", portUnloc: "DEHAM", quantity: 20000, assignedCargoIds: [1] }),
      ];
      const result = validateCargoAssignments([cargo()], sequence);
      expect(result.hasErrors).toBe(false);
    });

    it("under-discharge by 5,000 MT is reported", () => {
      const sequence = [
        uiRow({ id: 1, operation: "loading", quantity: 50000, assignedCargoIds: [1] }),
        uiRow({ id: 2, operation: "discharging", port: "Rotterdam", portUnloc: "NLRTM", quantity: 45000, assignedCargoIds: [1] }),
      ];
      const result = validateCargoAssignments([cargo()], sequence);
      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].message).toMatch(/under-discharge/);
    });

    it("over-discharge by 2,000 MT is reported", () => {
      const sequence = [
        uiRow({ id: 1, operation: "loading", quantity: 50000, assignedCargoIds: [1] }),
        uiRow({ id: 2, operation: "discharging", port: "Rotterdam", portUnloc: "NLRTM", quantity: 52000, assignedCargoIds: [1] }),
      ];
      const result = validateCargoAssignments([cargo()], sequence);
      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].message).toMatch(/over-discharge/);
    });

    it("multi-cargo: each cargo balanced independently", () => {
      const sequence = [
        uiRow({ id: 1, operation: "loading", quantity: 30000, assignedCargoIds: [1] }),
        uiRow({ id: 2, operation: "loading", port: "Paranagua", portUnloc: "BRPNG", quantity: 20000, assignedCargoIds: [2] }),
        uiRow({ id: 3, operation: "discharging", port: "Rotterdam", portUnloc: "NLRTM", quantity: 30000, assignedCargoIds: [1] }),
        uiRow({ id: 4, operation: "discharging", port: "Hamburg", portUnloc: "DEHAM", quantity: 20000, assignedCargoIds: [2] }),
      ];
      const result = validateCargoAssignments([cargo({ id: 1 }), cargo({ id: 2 })], sequence);
      expect(result.hasErrors).toBe(false);
    });

    it("validateCargos also flags per-cargo imbalance via loaded/discharged maps", () => {
      const issues = validateCargos(
        [cargo({ id: 1 })],
        new Map([[1, 50000]]),
        new Map([[1, 48000]]),
      );
      expect(issues.some((i) => i.field === "quantityBalance" && i.rowId === 1)).toBe(true);
    });
  });
});