import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customExtraTime, customLeg, customVessel } from "../helpers/scenarios";

/**
 * UNIT — Sequence Section (distance, time, port days)
 */
describe("Sequence Section", () => {
  describe("Distance roll-up", () => {
    it("sums custom leg distances into totalDistance and totalEcaDistance", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", distance: 1_200, ecaDistance: 100, seaTime: 4, ecaTime: 0.3, nonEcaTime: 3.7 }),
        customLeg({ id: 2, operation: "disch", distance: 3_400, ecaDistance: 300, seaTime: 11, ecaTime: 1, nonEcaTime: 10 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;

      expect(r.totalDistance).toBe(4_600);
      expect(r.totalEcaDistance).toBe(400);
    });
  });

  describe("Sea time", () => {
    it("totalSeaDays equals ballast + laden", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", seaTime: 2.5, ecaTime: 0, nonEcaTime: 2.5, quantity: 30_000 }),
        customLeg({ id: 2, operation: "disch", seaTime: 6.5, ecaTime: 0.5, nonEcaTime: 6, quantity: 30_000 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;

      expect(r.seaDaysBallast).toBeCloseTo(2.5, 4);
      expect(r.seaDaysLaden).toBeCloseTo(6.5, 4);
      expect(r.extraSeaDays).toBeCloseTo(0, 4);
      expect(r.totalSeaDays).toBeCloseTo(9, 4);
    });

    it("first custom load leg sails ballast and next discharge leg sails laden", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", seaTime: 3.25, ecaTime: 0, nonEcaTime: 3.25, quantity: 40_000 }),
        customLeg({ id: 2, operation: "disch", seaTime: 7.75, ecaTime: 0, nonEcaTime: 7.75, quantity: 40_000 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;

      expect(r.seaDaysBallast).toBeCloseTo(3.25, 4);
      expect(r.seaDaysLaden).toBeCloseTo(7.75, 4);
    });
  });

  describe("Port days", () => {
    it("totalPortDays equals the sum of custom leg portDays", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", portDays: 2.25 }),
        customLeg({ id: 2, operation: "disch", portDays: 3.75 }),
        customLeg({ id: 3, operation: "bunkering", portDays: 0.5, seaTime: 0, distance: 0, ecaDistance: 0, quantity: 0 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;

      expect(r.totalPortDays).toBeCloseTo(6.5, 4);
    });
  });

  describe("Total voyage time", () => {
    it("totalVoyageDays equals custom sea, port, and canal time", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", seaTime: 3, ecaTime: 0, nonEcaTime: 3, portDays: 2 }),
        customLeg({ id: 2, operation: "disch", seaTime: 5, ecaTime: 0, nonEcaTime: 5, portDays: 4 }),
      ];
      const extraTime = customExtraTime({ canal1Days: 1 });
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence, extraTime }))).result.current;

      expect(r.totalVoyageDays).toBeCloseTo(3 + 5 + 2 + 4 + 1, 4);
      expect(r.totalVoyageDays).toBeGreaterThan(0);
    });
  });

  describe("ECA distance split", () => {
    it("custom ECA-heavy sequence reports a higher ECA ratio than custom baseline", () => {
      const vessel = customVessel();
      const baselineSequence = [
        customLeg({ id: 1, operation: "load", distance: 2_000, ecaDistance: 50, seaTime: 6, ecaTime: 0.15, nonEcaTime: 5.85 }),
        customLeg({ id: 2, operation: "disch", distance: 3_000, ecaDistance: 50, seaTime: 10, ecaTime: 0.15, nonEcaTime: 9.85 }),
      ];
      const ecaHeavySequence = [
        customLeg({ id: 1, operation: "load", distance: 500, ecaDistance: 400, seaTime: 2, ecaTime: 1.6, nonEcaTime: 0.4 }),
        customLeg({ id: 2, operation: "disch", distance: 500, ecaDistance: 500, seaTime: 2, ecaTime: 2, nonEcaTime: 0 }),
      ];

      const baseline = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ vessel, sequence: baselineSequence }))).result.current;
      const ecaHeavy = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ vessel, sequence: ecaHeavySequence }))).result.current;

      expect(ecaHeavy.totalEcaDistance).toBeGreaterThan(0);
      expect(ecaHeavy.totalEcaDistance / ecaHeavy.totalDistance).toBeGreaterThan(
        baseline.totalEcaDistance / baseline.totalDistance,
      );
    });
  });
});