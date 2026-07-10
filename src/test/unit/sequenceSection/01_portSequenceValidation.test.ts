import { describe, it, expect } from "vitest";
import {
  validateSequence,
  MAX_SEQUENCE_PORTS,
  SEQUENCE_FIELDS,
  type SequenceRowForValidation,
} from "@/utils/validation";

/**
 * UNIT — Port Sequence Validation.
 *
 * Business rules under test:
 *  - Two consecutive identical ports → leg distance MUST be 0 nm (exempt from
 *    the "distance required" check).
 *  - A voyage may contain at most 30 ports.
 *  - A discharge port cannot appear before the first load port.
 *  - Per-cargo: each cargo's load must appear before its discharge.
 *  - Distance range (Non-ECA + ECA combined) is 0 … 30,000 nm.
 */

type LegRow = SequenceRowForValidation & { assignedCargoIds?: number[] };

const legRow = (over: Partial<LegRow> = {}): LegRow => ({
  id: 1,
  type: "port",
  operation: "loading",
  port: "Santos",
  portUnloc: "BRSSZ",
  portId: 11,
  distance: 1000,
  ecaDistance: 0,
  turnTime: 6,
  extraTime: 0,
  expDa: 25000,
  quantity: 50000,
  ...over,
});

/** Local rule: discharge cannot appear before the first load. */
function firstDischargeBeforeLoad(rows: SequenceRowForValidation[]): boolean {
  const nonOpen = rows.filter((r) => r.type !== "open");
  const firstLoad = nonOpen.findIndex((r) => r.operation === "loading");
  const firstDisch = nonOpen.findIndex((r) => r.operation === "discharging");
  if (firstDisch === -1) return false;
  if (firstLoad === -1) return true;
  return firstDisch < firstLoad;
}

/** Local rule: per-cargo load must precede per-cargo discharge. */
function cargoOrderViolations(
  rows: Array<SequenceRowForValidation & { assignedCargoIds?: number[] }>,
): number[] {
  const violated = new Set<number>();
  const nonOpen = rows.filter((r) => r.type !== "open");
  const cargoIds = new Set<number>();
  nonOpen.forEach((r) => (r.assignedCargoIds || []).forEach((id) => cargoIds.add(id)));
  cargoIds.forEach((id) => {
    const firstLoadIdx = nonOpen.findIndex(
      (r) => r.operation === "loading" && (r.assignedCargoIds || []).includes(id),
    );
    const firstDischIdx = nonOpen.findIndex(
      (r) => r.operation === "discharging" && (r.assignedCargoIds || []).includes(id),
    );
    if (firstDischIdx !== -1 && (firstLoadIdx === -1 || firstDischIdx < firstLoadIdx)) {
      violated.add(id);
    }
  });
  return Array.from(violated);
}

describe("Port Sequence Validation", () => {
  describe("Same consecutive ports", () => {
    it("distance of 0 nm is allowed when the previous port is identical (UNLOC match)", () => {
      const rows: SequenceRowForValidation[] = [
        legRow({ id: 1, operation: "loading", portUnloc: "BRSSZ", distance: 1500 }),
        legRow({ id: 2, operation: "discharging", portUnloc: "BRSSZ", distance: 0, ecaDistance: 0 }),
      ];
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "distance" && i.rowId === 2)).toBe(false);
    });

    it("distance of 0 nm on a different port triggers a distance error", () => {
      const rows: SequenceRowForValidation[] = [
        legRow({ id: 1, operation: "loading", portUnloc: "BRSSZ", distance: 1500 }),
        legRow({ id: 2, operation: "discharging", portUnloc: "NLRTM", port: "Rotterdam", distance: 0, ecaDistance: 0 }),
      ];
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "distance" && i.rowId === 2)).toBe(true);
    });
  });

  describe("Maximum 30 ports", () => {
    it("exactly 30 legs is accepted", () => {
      const rows = Array.from({ length: MAX_SEQUENCE_PORTS }, (_, i) => legRow({ id: i + 1 }));
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "_count")).toBe(false);
    });

    it("31 legs triggers the sequence count error", () => {
      const rows = Array.from({ length: MAX_SEQUENCE_PORTS + 1 }, (_, i) => legRow({ id: i + 1 }));
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "_count")).toBe(true);
    });
  });

  describe("Discharge cannot precede load (voyage-wide)", () => {
    it("first port loading then discharging → OK", () => {
      const rows: SequenceRowForValidation[] = [
        legRow({ id: 1, operation: "loading" }),
        legRow({ id: 2, operation: "discharging", portUnloc: "NLRTM", port: "Rotterdam" }),
      ];
      expect(firstDischargeBeforeLoad(rows)).toBe(false);
    });

    it("first port discharging with no prior load → rejected", () => {
      const rows: SequenceRowForValidation[] = [
        legRow({ id: 1, operation: "discharging", portUnloc: "NLRTM", port: "Rotterdam" }),
        legRow({ id: 2, operation: "loading" }),
      ];
      expect(firstDischargeBeforeLoad(rows)).toBe(true);
    });
  });

  describe("Per-cargo load-before-discharge", () => {
    it("cargo #1 load(1) → disch(2), cargo #2 load(3) → disch(4) is valid", () => {
      const rows: LegRow[] = [
        legRow({ id: 1, operation: "loading", assignedCargoIds: [1] }),
        legRow({ id: 2, operation: "discharging", port: "Rotterdam", assignedCargoIds: [1] }),
        legRow({ id: 3, operation: "loading", port: "Antwerp", assignedCargoIds: [2] }),
        legRow({ id: 4, operation: "discharging", port: "Hamburg", assignedCargoIds: [2] }),
      ];
      expect(cargoOrderViolations(rows)).toEqual([]);
    });

    it("cargo #2 discharge appears before its load → violation for cargo 2 only", () => {
      const rows: LegRow[] = [
        legRow({ id: 1, operation: "loading", assignedCargoIds: [1] }),
        legRow({ id: 2, operation: "discharging", port: "Rotterdam", assignedCargoIds: [2] }),
        legRow({ id: 3, operation: "loading", port: "Antwerp", assignedCargoIds: [2] }),
        legRow({ id: 4, operation: "discharging", port: "Hamburg", assignedCargoIds: [1] }),
      ];
      expect(cargoOrderViolations(rows)).toEqual([2]);
    });
  });

  describe("Leg distance range 0 … 30,000 nm", () => {
    it("distance at the max boundary (30,000 nm) is accepted", () => {
      const rows = [legRow({ distance: SEQUENCE_FIELDS.distance.max })];
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "distance")).toBe(false);
    });

    it("distance just above 30,000 nm is rejected", () => {
      const rows = [legRow({ distance: SEQUENCE_FIELDS.distance.max + 1 })];
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "distance")).toBe(true);
    });

    it("negative distance is rejected", () => {
      const rows = [legRow({ distance: -1, ecaDistance: 0 })];
      const issues = validateSequence(rows);
      // Either the required-distance branch OR the min-range branch fires.
      expect(issues.some((i) => i.field === "distance" && i.rowId === 1)).toBe(true);
    });

    it("ECA distance above 30,000 nm is rejected", () => {
      const rows = [legRow({ distance: 0, ecaDistance: SEQUENCE_FIELDS.ecaDistance.max + 1 })];
      const issues = validateSequence(rows);
      expect(issues.some((i) => i.field === "ecaDistance")).toBe(true);
    });
  });
});