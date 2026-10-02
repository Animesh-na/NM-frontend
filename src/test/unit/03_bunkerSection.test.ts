import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customBunker, customLeg, customVessel } from "../helpers/scenarios";
import { computeFifoCoverage } from "@/utils/fuelBreakdown";

/**
 * UNIT — Bunker Section (consumption, ECA fuel switch, total cost)
 */
describe("Bunker Section", () => {
  describe("Consumption", () => {
    it("custom no-scrubber voyage consumes VLSFO and LSMGO but no HSFO", () => {
      const vessel = customVessel({ hasScrubber: false, scrubberCount: 0 });
      const sequence = [
        customLeg({ id: 1, operation: "load", distance: 1_000, ecaDistance: 0, seaTime: 3, ecaTime: 0, nonEcaTime: 3, portDays: 2 }),
        customLeg({ id: 2, operation: "disch", distance: 2_000, ecaDistance: 200, seaTime: 7, ecaTime: 0.7, nonEcaTime: 6.3, portDays: 3 }),
      ];

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ vessel, sequence }))).result.current;

      expect(r.hsfoConsumption).toBe(0);
      expect(r.vlsfoConsumption).toBeGreaterThan(0);
      expect(r.lsmgoConsumption).toBeGreaterThan(0);
    });

    it("custom ECA fuel breakdown is LSMGO-only inside ECA", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", distance: 600, ecaDistance: 300, seaTime: 2, ecaTime: 1, nonEcaTime: 1 }),
        customLeg({ id: 2, operation: "disch", distance: 800, ecaDistance: 400, seaTime: 3, ecaTime: 1.5, nonEcaTime: 1.5 }),
      ];

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;

      expect(r.ecaFuel.hsfo).toBe(0);
      expect(r.ecaFuel.vlsfo).toBe(0);
      expect(r.ecaFuel.lsmgo).toBeGreaterThan(0);
      expect(r.ecaFuel.total).toBeCloseTo(r.ecaFuel.lsmgo, 4);
    });

    it("custom higher ECA share creates higher relative LSMGO consumption", () => {
      const baseSequence = [
        customLeg({ id: 1, operation: "load", distance: 2_000, ecaDistance: 0, seaTime: 6, ecaTime: 0, nonEcaTime: 6 }),
        customLeg({ id: 2, operation: "disch", distance: 4_000, ecaDistance: 100, seaTime: 12, ecaTime: 0.3, nonEcaTime: 11.7 }),
      ];
      const ecaHeavySequence = [
        customLeg({ id: 1, operation: "load", distance: 1_000, ecaDistance: 700, seaTime: 4, ecaTime: 2.8, nonEcaTime: 1.2 }),
        customLeg({ id: 2, operation: "disch", distance: 1_000, ecaDistance: 900, seaTime: 4, ecaTime: 3.6, nonEcaTime: 0.4 }),
      ];

      const base = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence: baseSequence }))).result.current;
      const ecaHeavy = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence: ecaHeavySequence }))).result.current;
      const ratio = (result: typeof base) =>
        result.lsmgoConsumption / (result.hsfoConsumption + result.vlsfoConsumption + result.lsmgoConsumption);

      expect(ratio(ecaHeavy)).toBeGreaterThan(ratio(base));
    });
  });

  describe("Cost", () => {
    it("keeps consumption on BOB until the actual return-port bunkering operation", () => {
      const vessel = customVessel({ hasScrubber: false, speedProfile: "eco" });
      const sequence = [
        customLeg({
          id: 0,
          type: "open",
          operation: undefined,
          port: "Rotterdam",
          portUnloc: "NLRTM",
          seaTime: 0,
          nonEcaTime: 0,
          portDays: 0,
          quantity: 0,
        }),
        customLeg({
          id: 1,
          operation: "pssg",
          port: "Antwerp",
          portUnloc: "BEANR",
          seaTime: 1,
          nonEcaTime: 1,
          portDays: 1,
          quantity: 0,
        }),
        customLeg({
          id: 2,
          operation: "bunkering",
          port: "Rotterdam",
          portUnloc: "NLRTM",
          seaTime: 1,
          nonEcaTime: 1,
          portDays: 1,
          quantity: 0,
        }),
      ];

      const coverage = computeFifoCoverage(sequence, vessel, ["NLRTM"]);

      // BOB: Rotterdam→Antwerp sea (6), Antwerp passing-port stay (1 day at the
      // canal rate: computeFifoCoverage burns pssg stays at "canal", not "idle"),
      // Antwerp→Rotterdam sea (6). New lot starts at Rotterdam port stay.
      // The Go engine agrees (migration X-001, decision D-019).
      expect(coverage.vlsfo[0]).toBeCloseTo(15, 6);
      expect(coverage.vlsfo[1]).toBeCloseTo(0.4, 6);
      // AE on BOB: 1 + 1 sea days at the ballast AE rate (1); the pssg stay uses
      // the AE canal rate (0), not idle (0.5).
      expect(coverage.lsmgo[0]).toBeCloseTo(2, 6);
      expect(coverage.lsmgo[1]).toBeCloseTo(0.5, 6);
    });

    it("custom totalBunkerCost equals Σ(consumption × custom price)", () => {
      const bunker = customBunker({
        hsfo: { price: 420, robStart: 500 },
        vlsfo: { price: 610, robStart: 300 },
        lsmgo: { price: 790, robStart: 150 },
      });
      const sequence = [
        customLeg({ id: 1, operation: "load", seaTime: 4, ecaTime: 0, nonEcaTime: 4 }),
        customLeg({ id: 2, operation: "disch", seaTime: 6, ecaTime: 1, nonEcaTime: 5 }),
      ];

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ bunker, sequence }))).result.current;
      const expected =
        r.hsfoConsumption * bunker.hsfo.price +
        r.vlsfoConsumption * bunker.vlsfo.price +
        r.lsmgoConsumption * bunker.lsmgo.price;

      expect(r.totalBunkerCost).toBeCloseTo(expected, 2);
    });

    it("custom zero fuel prices produce zero bunker cost", () => {
      const bunker = customBunker({
        hsfo: { price: 0, robStart: 0 },
        vlsfo: { price: 0, robStart: 0 },
        lsmgo: { price: 0, robStart: 0 },
        co2Price: 0,
      });
      const sequence = [
        customLeg({ id: 1, operation: "load", seaTime: 3, ecaTime: 0, nonEcaTime: 3 }),
        customLeg({ id: 2, operation: "disch", seaTime: 5, ecaTime: 0.5, nonEcaTime: 4.5 }),
      ];

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ bunker, sequence }))).result.current;

      expect(r.totalBunkerCost).toBe(0);
    });

    it("doubling all custom prices doubles bunker cost", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", seaTime: 3, ecaTime: 0, nonEcaTime: 3 }),
        customLeg({ id: 2, operation: "disch", seaTime: 6, ecaTime: 1, nonEcaTime: 5 }),
      ];
      const baseBunker = customBunker({
        hsfo: { price: 400, robStart: 0 },
        vlsfo: { price: 500, robStart: 0 },
        lsmgo: { price: 700, robStart: 0 },
      });
      const doubledBunker = customBunker({
        hsfo: { price: 800, robStart: 0 },
        vlsfo: { price: 1_000, robStart: 0 },
        lsmgo: { price: 1_400, robStart: 0 },
      });

      const base = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ bunker: baseBunker, sequence }))).result.current;
      const doubled = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ bunker: doubledBunker, sequence }))).result.current;

      expect(doubled.totalBunkerCost).toBeCloseTo(base.totalBunkerCost * 2, 2);
    });
  });
});