import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "../helpers/mockVesselData";
import { mockCargo, mockBunker } from "../helpers/mockSequenceData";
import { validateCargoAssignments } from "@/utils/cargoValidation";
import type { CargoEntry, SequenceRowUI } from "@/context/VoyageContext";

function row(overrides: Partial<SequenceRowUI> & { id: number }): SequenceRowUI {
  return {
    type: "port",
    operation: "loading",
    port: "P", portUnloc: "P",
    distance: 100, ecaDistance: 0,
    distanceSpeedContext: "EV", ecaDistanceSpeedContext: "EL",
    baseSeaTime: 0, seaMarginTime: 0, ecaTime: 0, seaTime: 0, totalLegTime: 0,
    quantity: 0, productivity: 8000, terms: "shinc",
    turnTime: 0, extraTime: 0, calculatedPortDays: 0, wdaysUnit: "VL",
    draft: 0, cranes: 0, seaMargin: 0,
    bunkeringHsfo: 0, bunkeringVlsfo: 0, bunkeringLsmgo: 0, expDa: 0,
    portMaxDraft: 0, ukcPercent: 0, stowageFactor: 0,
    portFuelType: "vlsfo", coefficientFactor: 1, customTermsName: "",
    ...overrides,
  } as SequenceRowUI;
}

const cargos: CargoEntry[] = [
  { id: 1, rate: 25, rateType: "mt", quantity: 0, voyageCommission: 0, tcCommission: 0,
    demurrageRate: 0, despatchRate: 0, demurrageAmount: 0, despatchAmount: 0,
    averageMode: "average", ntcBase: 0, gtcTarget: 0, stowageFactor: 1.4 },
  { id: 2, rate: 30, rateType: "mt", quantity: 0, voyageCommission: 0, tcCommission: 0,
    demurrageRate: 0, despatchRate: 0, demurrageAmount: 0, despatchAmount: 0,
    averageMode: "average", ntcBase: 0, gtcTarget: 0, stowageFactor: 1.4 },
];

describe("validateCargoAssignments", () => {
  it("passes when no explicit assignments are used", () => {
    const seq = [row({ id: 1, quantity: 50000 })];
    const r = validateCargoAssignments(cargos, seq);
    expect(r.hasErrors).toBe(false);
    expect(r.usesExplicitMapping).toBe(false);
  });

  it("errors on under-discharge", () => {
    const seq = [
      row({ id: 1, operation: "loading", quantity: 50000, assignedCargoIds: [1] }),
      row({ id: 2, operation: "discharging", quantity: 30000, assignedCargoIds: [1] }),
    ];
    const r = validateCargoAssignments(cargos, seq);
    expect(r.hasErrors).toBe(true);
    expect(r.errors[0].message).toMatch(/under-discharge/);
  });

  it("errors on over-discharge", () => {
    const seq = [
      row({ id: 1, operation: "loading", quantity: 50000, assignedCargoIds: [1] }),
      row({ id: 2, operation: "discharging", quantity: 60000, assignedCargoIds: [1] }),
    ];
    const r = validateCargoAssignments(cargos, seq);
    expect(r.hasErrors).toBe(true);
    expect(r.errors[0].message).toMatch(/over-discharge/);
  });

  it("passes when load == discharge across split ports", () => {
    const seq = [
      row({ id: 1, operation: "loading", quantity: 50000, assignedCargoIds: [1] }),
      row({ id: 2, operation: "discharging", quantity: 20000, assignedCargoIds: [1] }),
      row({ id: 3, operation: "discharging", quantity: 30000, assignedCargoIds: [1] }),
    ];
    const r = validateCargoAssignments(cargos, seq);
    expect(r.hasErrors).toBe(false);
  });

  it("errors when load present but no discharge port assigned", () => {
    const seq = [
      row({ id: 1, operation: "loading", quantity: 50000, assignedCargoIds: [1] }),
    ];
    const r = validateCargoAssignments(cargos, seq);
    expect(r.hasErrors).toBe(true);
    expect(r.errors[0].message).toMatch(/no assigned discharge/);
  });
});

describe("perCargoBreakdown", () => {
  const baseInputs: VoyageInputs = {
    vessel: mockVessel,
    sequence: [
      { id: 1, operation: "load", port: "A", portUnloc: "A", cgo: "", distance: 1000, ecaDistance: 0,
        portDays: 2, quantity: 30000, expDa: 20000, seaTime: 3, ecaTime: 0, nonEcaTime: 3,
        type: "port", assignedCargoIds: [1] },
      { id: 2, operation: "disch", port: "B", portUnloc: "B", cgo: "", distance: 800, ecaDistance: 0,
        portDays: 2, quantity: 30000, expDa: 25000, seaTime: 2.5, ecaTime: 0, nonEcaTime: 2.5,
        type: "port", assignedCargoIds: [1] },
      { id: 3, operation: "", port: "C", portUnloc: "C", cgo: "", distance: 500, ecaDistance: 0,
        portDays: 0, quantity: 0, expDa: 9999, seaTime: 1.5, ecaTime: 0, nonEcaTime: 1.5,
        type: "repos" },
    ],
    cargo: mockCargo,
    bunker: mockBunker,
    hireRate: 10000,
    cargos: [
      { id: 1, rate: 25, rateType: "mt", voyageCommission: 0, tcCommission: 0 },
    ],
  };

  it("produces a per-cargo entry with route-bounded allocation", () => {
    const { result } = renderHook(() => useVoyageCalculation(baseInputs));
    expect(result.current.perCargoBreakdown).toHaveLength(1);
    const c = result.current.perCargoBreakdown[0];
    expect(c.loadedQty).toBe(30000);
    expect(c.grossFreight).toBe(25 * 30000);
    // Multi-cargo ton-mile spec: direct load/discharge DA → 100% to the cargo
    // (20000 + 25000 = 45000); repos port DA (9999) is "shared" and with a
    // single cargo it absorbs the full amount via ton-mile share.
    expect(c.allocatedDirectPortCost).toBeCloseTo(45000, 0);
    expect(c.allocatedPortCosts).toBeCloseTo(45000 + 9999, 0);
    // Repositioning bunker (from the repos leg's bunker share) is allocated
    // to the cargo that caused it (this single cargo).
    expect(c.allocatedRepositioningCost).toBeGreaterThan(0);
    // Net & Gross rate per spec
    expect(c.netRate).toBeCloseTo(c.allocatedTotalCost / 30000, 4);
    expect(c.grossRate).toBeCloseTo(c.netRate, 4); // voyComm = 0 in test
  });
});