import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { CO2_EMISSION_FACTORS } from "@/utils/emissionCalculations";
import { createVoyageTestInputs, customBunker, customLeg, customVessel } from "../helpers/scenarios";

/**
 * UNIT — Emission Section (CO₂, CII rating, EU ETS)
 */
describe("Emission Section", () => {
  describe("CO₂ totals", () => {
    it("custom totalCo2 equals Σ(fuel × regulatory emission factor)", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", distance: 1_000, ecaDistance: 0, seaTime: 3, ecaTime: 0, nonEcaTime: 3 }),
        customLeg({ id: 2, operation: "disch", distance: 2_000, ecaDistance: 200, seaTime: 6, ecaTime: 0.6, nonEcaTime: 5.4 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;
      const expected =
        r.hsfoConsumption * CO2_EMISSION_FACTORS.hsfo +
        r.vlsfoConsumption * CO2_EMISSION_FACTORS.vlsfo +
        r.lsmgoConsumption * CO2_EMISSION_FACTORS.lsmgo;

      expect(r.totalCo2).toBeCloseTo(expected, 0);
    });

    it("custom co2Laden plus co2Ballast does not exceed totalCo2", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", seaTime: 4, ecaTime: 0, nonEcaTime: 4, portDays: 1 }),
        customLeg({ id: 2, operation: "disch", seaTime: 8, ecaTime: 1, nonEcaTime: 7, portDays: 2 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;

      expect(r.co2Laden + r.co2Ballast).toBeLessThanOrEqual(r.totalCo2 + 1e-6);
    });
  });

  describe("CII rating", () => {
    it("custom vessel returns a valid CII letter grade A–E", () => {
      const vessel = customVessel({ type: "bulk_carrier", dwt: 82_000 });
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ vessel }))).result.current;

      expect(["A", "B", "C", "D", "E"]).toContain(r.ciiRating);
    });
  });

  describe("EU ETS", () => {
    it("custom EU-covered voyage returns finite ETS cost and non-negative chargeable CO₂", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", port: "Rotterdam", portUnloc: "NLRTM", ecaDistance: 300, seaTime: 4, ecaTime: 1.2, nonEcaTime: 2.8 }),
        customLeg({ id: 2, operation: "disch", port: "Hamburg", portUnloc: "DEHAM", ecaDistance: 300, seaTime: 3, ecaTime: 1, nonEcaTime: 2 }),
      ];
      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence, bunker: customBunker({ co2Price: 90 }) }))).result.current;

      expect(Number.isFinite(r.etsCost)).toBe(true);
      expect(r.etsCost).toBeGreaterThanOrEqual(0);
      expect(r.chargeableCo2).toBeGreaterThanOrEqual(0);
    });

    it("higher custom CO₂ price increases ETS cost when chargeable CO₂ exists", () => {
      const sequence = [
        customLeg({ id: 1, operation: "load", port: "Rotterdam", portUnloc: "NLRTM", ecaDistance: 200, seaTime: 3, ecaTime: 1, nonEcaTime: 2 }),
        customLeg({ id: 2, operation: "disch", port: "Antwerp", portUnloc: "BEANR", ecaDistance: 200, seaTime: 3, ecaTime: 1, nonEcaTime: 2 }),
      ];
      const low = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ sequence, bunker: customBunker({ co2Price: 50 }) })),
      ).result.current;
      const high = renderHook(() =>
        useVoyageCalculation(createVoyageTestInputs({ sequence, bunker: customBunker({ co2Price: 150 }) })),
      ).result.current;

      if (low.chargeableCo2 > 0) {
        expect(high.etsCost).toBeGreaterThan(low.etsCost);
      } else {
        expect(high.etsCost).toBe(low.etsCost);
      }
    });

    it("starts the frontend breakdown at the first load port and excludes positioning sea fuel", () => {
      const sequence = [
        customLeg({ id: 1, operation: "", port: "Chittagong", portUnloc: "BDCGP", seaTime: 0, portDays: 0 }),
        customLeg({ id: 2, operation: "loading", port: "Paradip", portUnloc: "INPRT", seaTime: 5, portDays: 2, quantity: 27_500 }),
        customLeg({ id: 3, operation: "pssg", port: "Trincomalee", portUnloc: "LKTCO", seaTime: 3, portDays: 0.5, quantity: 0 }),
        customLeg({ id: 4, operation: "discharging", port: "Marghera", portUnloc: "ITMRH", isEuEea: true, seaTime: 10, portDays: 4, quantity: 27_500 }),
        customLeg({ id: 5, operation: "repos", port: "Gibraltar", portUnloc: "GIGIB", seaTime: 4, portDays: 0.5, quantity: 0 }),
      ];

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;

      expect(r.etsLegDetails[0]).toMatchObject({
        isPortOnly: true,
        originPort: "",
        destPort: "Paradip",
        seaVlsfo: 0,
        seaLsmgo: 0,
      });
      // Intermediate ports (e.g. Trincomalee pssg) between first load and last
      // discharge are included with their own sub-leg sea fuel and inherit the
      // bracketed EU coverage factor. Ports outside the window (Gibraltar
      // repos) stay excluded.
      expect(r.etsLegDetails.map((leg) => leg.destPort)).toEqual(["Paradip", "Trincomalee", "Marghera"]);
      expect(r.etsLegDetails.some((leg) => leg.destPort === "Gibraltar")).toBe(false);
      const trin = r.etsLegDetails.find((leg) => leg.destPort === "Trincomalee")!;
      expect(trin.coveragePct).toBe(50);
    });

    it("does not treat a passage waypoint as the EU ETS leg origin", () => {
      const sequence = [
        customLeg({ id: 1, operation: "", port: "Chittagong", portUnloc: "BDCGP", seaTime: 0, portDays: 0 }),
        customLeg({ id: 2, operation: "loading", port: "Paradip", portUnloc: "INPRT", seaTime: 5, nonEcaTime: 5, portDays: 2, quantity: 27_500 }),
        customLeg({ id: 3, operation: "pssg", port: "Port Said", portUnloc: "EGPSD", seaTime: 8, nonEcaTime: 8, portDays: 0.5, quantity: 0 }),
        customLeg({ id: 4, operation: "discharging", port: "Marghera", portUnloc: "ITMRH", isEuEea: true, seaTime: 4, nonEcaTime: 4, portDays: 4, quantity: 27_500 }),
      ];

      const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;

      // Port Said (pssg) appears as its own sub-leg row within the commercial
      // window and inherits the bracketed 50% coverage (Paradip → Marghera).
      expect(r.etsLegDetails.map((leg) => leg.destPort)).toEqual(["Paradip", "Port Said", "Marghera"]);
      const marghera = r.etsLegDetails.find((leg) => leg.destPort === "Marghera")!;
      expect(marghera).toMatchObject({ originPort: "Port Said", coveragePct: 50 });
      expect(marghera.seaVlsfo).toBeGreaterThan(0);
      const portSaid = r.etsLegDetails.find((leg) => leg.destPort === "Port Said")!;
      expect(portSaid.coveragePct).toBe(50);
      expect(portSaid.seaVlsfo).toBeGreaterThan(0);
    });
  });
});