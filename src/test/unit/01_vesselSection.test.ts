import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import {
  createVoyageTestInputs,
  customBunker,
  customConsumptionMatrix,
  customLeg,
  customVessel,
} from "../helpers/scenarios";

/**
 * UNIT — Vessel Section
 * Every scenario declares its own custom vessel, sequence, cargo, bunker, and
 * hire assumptions through the custom input builder.
 */
describe("Vessel Section", () => {
  describe("Speed profile", () => {
    it("eco profile produces lower fuel than full profile for the same custom voyage", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", distance: 1_200, seaTime: 4, ecaTime: 0, nonEcaTime: 4, portDays: 1.5 }),
        customLeg({ id: 2, operation: "disch", distance: 2_400, seaTime: 8, ecaTime: 0, nonEcaTime: 8, portDays: 2.5 }),
      ];
      const ecoMatrix = customConsumptionMatrix({ vlsfo: { ballast: 5, laden: 6 }, ae: { ballast: 1, laden: 1 } });
      const fullMatrix = customConsumptionMatrix({ vlsfo: { ballast: 8, laden: 10 }, ae: { ballast: 1.2, laden: 1.2 } });

      const eco = renderHook(() =>
        useVoyageCalculation(
          createVoyageTestInputs({
            vessel: customVessel({ speedProfile: "eco", ecoConsumption: ecoMatrix, fullConsumption: fullMatrix }),
            sequence,
            bunker: customBunker({ vlsfo: { price: 620, robStart: 200 }, lsmgo: { price: 810, robStart: 100 } }),
            hireRate: 14_000,
          }),
        ),
      ).result.current;
      const full = renderHook(() =>
        useVoyageCalculation(
          createVoyageTestInputs({
            vessel: customVessel({ speedProfile: "full", ecoConsumption: ecoMatrix, fullConsumption: fullMatrix }),
            sequence,
            bunker: customBunker({ vlsfo: { price: 620, robStart: 200 }, lsmgo: { price: 810, robStart: 100 } }),
            hireRate: 14_000,
          }),
        ),
      ).result.current;

      expect(full.vlsfoConsumption).toBeGreaterThan(eco.vlsfoConsumption);
      expect(full.totalSeaDays).toBeCloseTo(eco.totalSeaDays, 4);
    });

    it("scrubber vessel burns HSFO instead of VLSFO outside ECA for custom non-ECA legs", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", distance: 900, ecaDistance: 0, seaTime: 3, ecaTime: 0, nonEcaTime: 3, portDays: 0, turnTimeHours: 0 }),
        customLeg({ id: 2, operation: "disch", distance: 1_800, ecaDistance: 0, seaTime: 6, ecaTime: 0, nonEcaTime: 6, portDays: 0, turnTimeHours: 0 }),
      ];
      const bunker = customBunker({ hsfo: { price: 430, robStart: 400 }, vlsfo: { price: 610, robStart: 250 } });

      const noScrubber = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ vessel: customVessel({ hasScrubber: false, scrubberCount: 0 }), sequence, bunker })),
      ).result.current;
      const scrubber = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ vessel: customVessel({ hasScrubber: true, scrubberCount: 1 }), sequence, bunker })),
      ).result.current;

      expect(noScrubber.hsfoConsumption).toBe(0);
      expect(noScrubber.vlsfoConsumption).toBeGreaterThan(0);
      expect(scrubber.hsfoConsumption).toBeGreaterThan(0);
      expect(scrubber.vlsfoConsumption).toBe(0);
    });
  });

  describe("Reward factor (wind assistance)", () => {
    it("rewardFactor below 1 reduces sea fuel and bunker cost for custom inputs", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", distance: 1_500, seaTime: 5, ecaTime: 0, nonEcaTime: 5, portDays: 0 }),
        customLeg({ id: 2, operation: "disch", distance: 3_000, seaTime: 10, ecaTime: 0, nonEcaTime: 10, portDays: 0 }),
      ];
      const vessel = customVessel({ ecoConsumption: customConsumptionMatrix({ vlsfo: { ballast: 7, laden: 8 }, ae: { ballast: 1, laden: 1 } }) });

      const base = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ vessel, sequence, bunker: customBunker({ rewardFactor: 1 }) })),
      ).result.current;
      const assisted = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ vessel, sequence, bunker: customBunker({ rewardFactor: 0.8 }) })),
      ).result.current;

      expect(assisted.vlsfoConsumption).toBeLessThan(base.vlsfoConsumption);
      expect(assisted.totalBunkerCost).toBeLessThan(base.totalBunkerCost);
    });

    it("rewardFactor equal to 1 leaves the custom baseline unchanged", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", distance: 1_000, seaTime: 4, ecaTime: 0, nonEcaTime: 4 }),
        customLeg({ id: 2, operation: "disch", distance: 2_000, seaTime: 8, ecaTime: 0, nonEcaTime: 8 }),
      ];
      const vessel = customVessel({ ecoConsumption: customConsumptionMatrix({ vlsfo: { ballast: 6, laden: 7 } }) });

      const base = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ vessel, sequence, bunker: customBunker({ rewardFactor: 1 }) })),
      ).result.current;
      const same = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ vessel, sequence, bunker: customBunker({ rewardFactor: 1 }) })),
      ).result.current;

      expect(same.vlsfoConsumption).toBeCloseTo(base.vlsfoConsumption, 4);
      expect(same.totalBunkerCost).toBeCloseTo(base.totalBunkerCost, 4);
    });
  });
});