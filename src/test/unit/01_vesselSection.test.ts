import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { buildInputs, mockVessel } from "../helpers/scenarios";

/**
 * UNIT — Vessel Section
 * Verifies that the vessel's speed profile and reward factor drive sea-fuel
 * consumption correctly.
 */
describe("Vessel Section", () => {
  describe("Speed profile", () => {
    it("eco profile produces lower fuel than full profile (same voyage)", () => {
      const eco = renderHook(() =>
        useVoyageCalculation(buildInputs({ vessel: { ...mockVessel, speedProfile: "eco" } })),
      ).result.current;
      const full = renderHook(() =>
        useVoyageCalculation(buildInputs({ vessel: { ...mockVessel, speedProfile: "full" } })),
      ).result.current;

      // Full speed uses faster speeds AND higher ME consumption per day.
      // Total VLSFO must be strictly higher on the full profile.
      expect(full.vlsfoConsumption).toBeGreaterThan(eco.vlsfoConsumption);
      // Full speed completes the voyage in less time → fewer sea days.
      expect(full.totalSeaDays).toBeLessThan(eco.totalSeaDays);
    });

    it("scrubber vessel burns HSFO instead of VLSFO outside ECA", () => {
      const noScrubber = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const scrubber = renderHook(() =>
        useVoyageCalculation(
          buildInputs({ vessel: { ...mockVessel, hasScrubber: true, scrubberCount: 1 } }),
        ),
      ).result.current;

      expect(noScrubber.hsfoConsumption).toBe(0);
      expect(noScrubber.vlsfoConsumption).toBeGreaterThan(0);
      expect(scrubber.hsfoConsumption).toBeGreaterThan(0);
    });
  });

  describe("Reward factor (wind assistance)", () => {
    it("rewardFactor < 1 reduces sea fuel proportionally", () => {
      const base = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const assisted = renderHook(() =>
        useVoyageCalculation(
          buildInputs({ bunker: { ...buildInputs().bunker, rewardFactor: 0.8 } }),
        ),
      ).result.current;

      expect(assisted.vlsfoConsumption).toBeLessThan(base.vlsfoConsumption);
      // 20% reduction on sea fuel — assisted total must not exceed base.
      expect(assisted.totalBunkerCost).toBeLessThan(base.totalBunkerCost);
    });

    it("rewardFactor === 1 matches the default (no change)", () => {
      const base = renderHook(() => useVoyageCalculation(buildInputs())).result.current;
      const same = renderHook(() =>
        useVoyageCalculation(
          buildInputs({ bunker: { ...buildInputs().bunker, rewardFactor: 1 } }),
        ),
      ).result.current;
      expect(same.vlsfoConsumption).toBeCloseTo(base.vlsfoConsumption, 4);
    });
  });
});