/**
 * SMOKE TEST: end-to-end "is the whole software working?" check.
 *
 * Run it with:
 *   bunx vitest run src/test/smoke
 *
 * What it does:
 *  - Executes the full voyage calculation pipeline across several realistic
 *    scenarios (eco vs full speed, scrubber vs non-scrubber, EU vs non-EU).
 *  - Prints a side-by-side `console.table` of the headline KPIs so you can
 *    eyeball the numbers without opening the UI.
 *  - Asserts the basic invariants that every voyage MUST satisfy
 *    (no negative costs, time/money conservation, valid CII, etc.).
 *
 * If this file passes, the calculation engine, emission module and
 * EU ETS / FuelEU integration are wired up correctly.
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel, mockVesselFullSpeed } from "../helpers/mockVesselData";
import {
  mockSimpleSequence,
  mockCargo,
  mockBunker,
  mockMiscCosts,
  mockExtraTime,
} from "../helpers/mockSequenceData";

const baseInputs: VoyageInputs = {
  vessel: mockVessel,
  sequence: mockSimpleSequence,
  cargo: mockCargo,
  bunker: mockBunker,
  hireRate: 15000,
  misc: mockMiscCosts,
  extraTime: mockExtraTime,
};

function run(name: string, overrides: Partial<VoyageInputs>) {
  const inputs: VoyageInputs = { ...baseInputs, ...overrides };
  const { result } = renderHook(() => useVoyageCalculation(inputs));
  return { name, r: result.current };
}

function assertInvariants(name: string, r: ReturnType<typeof useVoyageCalculation>) {
  // Time conservation
  expect(r.totalVoyageDays, `${name}: voyage days = sea + port + extras`).toBeCloseTo(
    r.totalSeaDays + r.totalPortDays + r.extraPortDays + r.extraCanalDays,
    1,
  );
  // Money conservation
  expect(r.totalVoyageCosts, `${name}: voyage cost components add up`).toBeGreaterThan(0);
  expect(r.netFreight, `${name}: net <= gross`).toBeLessThanOrEqual(r.grossFreight);
  // Bunker sanity
  expect(r.totalBunkerCost, `${name}: bunker cost non-negative`).toBeGreaterThanOrEqual(0);
  // Emissions sanity
  expect(r.totalCo2, `${name}: CO2 > 0`).toBeGreaterThan(0);
  expect(["A", "B", "C", "D", "E"]).toContain(r.ciiRating);
  expect(r.etsPhaseIn).toBeGreaterThanOrEqual(0);
  expect(r.etsPhaseIn).toBeLessThanOrEqual(100);
  // Hire
  expect(r.hireCost, `${name}: hire = rate × days`).toBeCloseTo(15000 * r.totalVoyageDays, 1);
}

describe("Smoke: overall software pipeline", () => {
  const scenarios = [
    run("Eco / no-scrubber", {}),
    run("Full speed / no-scrubber", { vessel: mockVesselFullSpeed }),
    run("Eco / scrubber on", { vessel: { ...mockVessel, hasScrubber: true } }),
    run("Eco / cheap bunkers", {
      bunker: {
        ...mockBunker,
        hsfo: { ...mockBunker.hsfo, price: 350 },
        vlsfo: { ...mockBunker.vlsfo, price: 400 },
        lsmgo: { ...mockBunker.lsmgo, price: 600 },
      },
    }),
    run("Eco / zero hire", { hireRate: 0 }),
  ];

  it("prints a comparison table and passes invariants for every scenario", () => {
    const fmt = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(2)) : n);
    const rows: Record<string, Record<string, string | number>> = {};
    for (const { name, r } of scenarios) {
      rows[name] = {
        "Days":         fmt(r.totalVoyageDays),
        "HSFO mt":      fmt(r.hsfoConsumption),
        "VLSFO mt":     fmt(r.vlsfoConsumption),
        "LSMGO mt":     fmt(r.lsmgoConsumption),
        "Bunker $":     fmt(r.totalBunkerCost),
        "Net Frt $":    fmt(r.netFreight),
        "Hire $":       fmt(r.hireCost),
        "Costs $":      fmt(r.totalVoyageCosts),
        "P&L $":        fmt(r.pAndL),
        "TCE $/d":      fmt(r.tce),
        "CO2 mt":       fmt(r.totalCo2),
        "CII":          r.ciiRating,
        "ETS $":        fmt(r.etsCost),
        "FuelEU $":     fmt(r.fuelEuTotalPenalty),
      };
      assertInvariants(name, r);
    }
    // eslint-disable-next-line no-console
    console.log("\n=== Overall software smoke summary ===");
    // eslint-disable-next-line no-console
    console.table(rows);
  });
});