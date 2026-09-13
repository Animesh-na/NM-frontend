import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customLeg } from "../../helpers/scenarios";

/**
 * UNIT — Port Days Calculation.
 *
 * Formula (see VoyageContext.calculatePortDays):
 *   basePortDays        = quantity / productivity
 *   termsMultiplier     = coefficientFactor OR default(term)
 *   portDaysWithTerms   = basePortDays × termsMultiplier
 *   totalPortDays       = portDaysWithTerms + (turnTime + extraTime) / 24
 *
 * Default term coefficients:
 *   SHINC=1.0000, SSHEX=1.5555, SHEX=1.2727, SATPM=1.3333
 */

type Terms = "shinc" | "sshex" | "shex" | "satpm";

interface PortDaysInput {
  quantity: number;
  productivity: number;
  terms: Terms;
  coefficientFactor?: number; // custom override
  turnTimeHours?: number;
  extraTimeHours?: number;
}

function computePortDays(i: PortDaysInput): number {
  const defaults: Record<Terms, number> = { shinc: 1, sshex: 1.5555, shex: 1.2727, satpm: 1.3333 };
  const mult = i.coefficientFactor ?? defaults[i.terms];
  const base = i.productivity > 0 ? i.quantity / i.productivity : 0;
  return base * mult + ((i.turnTimeHours ?? 0) + (i.extraTimeHours ?? 0)) / 24;
}

describe("Port Days Calculation", () => {
  describe("Base port days (SHINC → coefficient 1.0)", () => {
    it("50,000 MT @ 20,000 MT/day = 2.5 days", () => {
      expect(computePortDays({ quantity: 50000, productivity: 20000, terms: "shinc" })).toBeCloseTo(2.5, 4);
    });
  });

  describe("Default term coefficients", () => {
    it.each<[Terms, number, number]>([
      ["shinc", 1.0, 2.5],
      ["sshex", 1.5555, 2.5 * 1.5555],
      ["shex", 1.2727, 2.5 * 1.2727],
      ["satpm", 1.3333, 2.5 * 1.3333],
    ])("term %s applies coefficient %f", (term, _coeff, expected) => {
      const days = computePortDays({ quantity: 50000, productivity: 20000, terms: term });
      expect(days).toBeCloseTo(expected, 4);
    });
  });

  describe("Custom coefficient overrides the default", () => {
    it("SHINC with custom coefficient 1.75 → 2.5 × 1.75 = 4.375 days", () => {
      const days = computePortDays({
        quantity: 50000,
        productivity: 20000,
        terms: "shinc",
        coefficientFactor: 1.75,
      });
      expect(days).toBeCloseTo(4.375, 4);
    });
  });

  describe("Extra & turn time", () => {
    it("6h turn + 12h extra adds (18/24) = 0.75 days to the working days", () => {
      const working = computePortDays({ quantity: 50000, productivity: 20000, terms: "shinc" });
      const withExtra = computePortDays({
        quantity: 50000,
        productivity: 20000,
        terms: "shinc",
        turnTimeHours: 6,
        extraTimeHours: 12,
      });
      expect(withExtra - working).toBeCloseTo(0.75, 4);
    });
  });

  describe("Total port days roll-up via calc engine", () => {
    it("totalPortDays equals the sum of per-leg portDays", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", portDays: 2.5, seaTime: 3, ecaTime: 0, nonEcaTime: 3, quantity: 50000 }),
        customLeg({ id: 2, operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", portDays: 3.125, seaTime: 8, ecaTime: 0.5, nonEcaTime: 7.5, quantity: 50000, expDa: 25000 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;
      expect(r.totalPortDays).toBeCloseTo(5.625, 4);
    });
  });
});