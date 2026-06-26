import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { buildInputs, mockSimpleSequence, mockEcaSequence } from "../helpers/scenarios";

/**
 * UNIT — Sequence Section (distance, time, port days)
 */
describe("Sequence Section", () => {
  describe("Distance roll-up", () => {
    it("sums leg distances into totalDistance and totalEcaDistance", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const expectedDistance = mockSimpleSequence.reduce((s, l) => s + (l.distance || 0), 0);
      const expectedEca = mockSimpleSequence.reduce((s, l) => s + (l.ecaDistance || 0), 0);
      expect(r.totalDistance).toBe(expectedDistance);
      expect(r.totalEcaDistance).toBe(expectedEca);
    });
  });

  describe("Sea time", () => {
    it("totalSeaDays = ballast + laden (+ extra at sea)", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(r.totalSeaDays).toBeCloseTo(r.seaDaysBallast + r.seaDaysLaden, 4);
    });

    it("first leg sails BALLAST (no cargo on board) — has ballast sea days", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(r.seaDaysBallast).toBeGreaterThan(0);
      expect(r.seaDaysLaden).toBeGreaterThan(0);
    });
  });

  describe("Port days", () => {
    it("totalPortDays equals sum of leg.portDays", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const expected = mockSimpleSequence.reduce((s, l) => s + (l.portDays || 0), 0);
      expect(r.totalPortDays).toBeCloseTo(expected, 4);
    });
  });

  describe("Total voyage time", () => {
    it("totalVoyageDays = sea + port + extras and is strictly positive", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const expected =
        r.totalSeaDays + r.totalPortDays + r.extraPortDays + r.extraCanalDays;
      expect(r.totalVoyageDays).toBeCloseTo(expected, 4);
      expect(r.totalVoyageDays).toBeGreaterThan(0);
    });
  });

  describe("ECA distance split", () => {
    it("ECA-heavy sequence reports more ECA distance than baseline", () => {
      const baseline = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const ecaHeavy = renderHook(() =>
        useVoyageCalculation(buildInputs({ sequence: mockEcaSequence })),
      ).result.current;
      expect(ecaHeavy.totalEcaDistance).toBeGreaterThan(0);
      // ECA-heavy sequence is short but has ECA on every leg.
      expect(ecaHeavy.totalEcaDistance / ecaHeavy.totalDistance).toBeGreaterThan(
        baseline.totalEcaDistance / baseline.totalDistance,
      );
    });
  });
});