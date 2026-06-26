import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { buildInputs, mockBunker, mockEcaSequence } from "../helpers/scenarios";

/**
 * UNIT — Bunker Section (consumption, ECA fuel switch, total cost)
 */
describe("Bunker Section", () => {
  describe("Consumption", () => {
    it("no-scrubber vessel: HSFO=0, VLSFO>0, LSMGO>0", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(r.hsfoConsumption).toBe(0);
      expect(r.vlsfoConsumption).toBeGreaterThan(0);
      expect(r.lsmgoConsumption).toBeGreaterThan(0);
    });

    it("ECA fuel breakdown is LSMGO-only (HSFO/VLSFO = 0 inside ECA)", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      expect(r.ecaFuel.hsfo).toBe(0);
      expect(r.ecaFuel.vlsfo).toBe(0);
      expect(r.ecaFuel.lsmgo).toBeGreaterThan(0);
      expect(r.ecaFuel.total).toBeCloseTo(r.ecaFuel.lsmgo, 4);
    });

    it("higher ECA share → higher relative LSMGO consumption", () => {
      const base = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const ecaHeavy = renderHook(() =>
        useVoyageCalculation(buildInputs({ sequence: mockEcaSequence })),
      ).result.current;
      const ratio = (r: typeof base) =>
        r.lsmgoConsumption / (r.hsfoConsumption + r.vlsfoConsumption + r.lsmgoConsumption);
      expect(ratio(ecaHeavy)).toBeGreaterThan(ratio(base));
    });
  });

  describe("Cost", () => {
    it("totalBunkerCost = Σ(consumption × price)", () => {
      const r = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const expected =
        r.hsfoConsumption * mockBunker.hsfo.price +
        r.vlsfoConsumption * mockBunker.vlsfo.price +
        r.lsmgoConsumption * mockBunker.lsmgo.price;
      expect(r.totalBunkerCost).toBeCloseTo(expected, 2);
    });

    it("zero prices → zero total cost", () => {
      const r = renderHook(() =>
        useVoyageCalculation(
          buildInputs({
            bunker: {
              hsfo: { price: 0, robStart: 0 },
              vlsfo: { price: 0, robStart: 0 },
              lsmgo: { price: 0, robStart: 0 },
              co2Price: 0,
            },
          }),
        ),
      ).result.current;
      expect(r.totalBunkerCost).toBe(0);
    });

    it("doubling all prices roughly doubles the total cost", () => {
      const base = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const dbl = renderHook(() =>
        useVoyageCalculation(
          buildInputs({
            bunker: {
              ...mockBunker,
              hsfo: { ...mockBunker.hsfo, price: mockBunker.hsfo.price * 2 },
              vlsfo: { ...mockBunker.vlsfo, price: mockBunker.vlsfo.price * 2 },
              lsmgo: { ...mockBunker.lsmgo, price: mockBunker.lsmgo.price * 2 },
            },
          }),
        ),
      ).result.current;
      expect(dbl.totalBunkerCost).toBeCloseTo(base.totalBunkerCost * 2, 2);
    });
  });
});