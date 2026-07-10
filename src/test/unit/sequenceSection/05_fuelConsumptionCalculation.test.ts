import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customLeg, customVessel } from "../../helpers/scenarios";

/**
 * UNIT — Fuel Consumption Calculation.
 *   - Non-ECA sea burns VLSFO (no scrubber) or HSFO (scrubber).
 *   - ECA sea burns LSMGO.
 *   - Port fuel is per-leg (portFuelType).
 *   - Total voyage fuel = HSFO + VLSFO + LSMGO across sea, port, canal.
 */

describe("Fuel Consumption Calculation", () => {
  it("Non-ECA sea (no scrubber) burns VLSFO at the laden/ballast rate × sea days", () => {
    const vessel = customVessel({
      hasScrubber: false,
      ecoConsumption: {
        speed: { ballast: 12, laden: 12, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        hsfo: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        vlsfo: { ballast: 10, laden: 12, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        lsmgo: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        ae: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        aeScrubber: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
      },
    });
    const sequence = [
      customLeg({ id: 1, operation: "load", distance: 1000, ecaDistance: 0, seaTime: 4, ecaTime: 0, nonEcaTime: 4, portDays: 0, quantity: 30000 }),
      customLeg({ id: 2, operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", distance: 3000, ecaDistance: 0, seaTime: 10, ecaTime: 0, nonEcaTime: 10, portDays: 0, quantity: 30000, expDa: 25000 }),
    ];
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ vessel, sequence }))).result.current;

    // Ballast leg (4 days × 10 mt/d) + Laden leg (10 days × 12 mt/d) = 160 mt
    expect(r.vlsfoConsumption).toBeCloseTo(160, 2);
    expect(r.hsfoConsumption).toBe(0);
    expect(r.ecaFuel.total).toBe(0);
  });

  it("ECA sea burns LSMGO at the matrix LSMGO rate", () => {
    const vessel = customVessel({
      hasScrubber: false,
      ecoConsumption: {
        speed: { ballast: 12, laden: 12, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        hsfo: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        vlsfo: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        lsmgo: { ballast: 12, laden: 14, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        ae: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        aeScrubber: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
      },
    });
    const sequence = [
      customLeg({ id: 1, operation: "load", distance: 0, ecaDistance: 800, seaTime: 3, ecaTime: 3, nonEcaTime: 0, portDays: 0, quantity: 30000 }),
      customLeg({ id: 2, operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", distance: 0, ecaDistance: 1200, seaTime: 5, ecaTime: 5, nonEcaTime: 0, portDays: 0, quantity: 30000, expDa: 25000 }),
    ];
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ vessel, sequence }))).result.current;

    // Ballast 3 days × 12 + Laden 5 days × 14 = 36 + 70 = 106 mt LSMGO from ECA
    expect(r.ecaFuel.lsmgo).toBeCloseTo(106, 2);
    expect(r.ecaFuel.total).toBeCloseTo(106, 2);
    expect(r.nonEcaFuel.total).toBe(0);
  });

  it("Port fuel: leg with portFuelType='vlsfo' consumes VLSFO load rate × port days", () => {
    const vessel = customVessel({
      hasScrubber: false,
      ecoConsumption: {
        speed: { ballast: 12, laden: 12, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        hsfo: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        vlsfo: { ballast: 0, laden: 0, canal: 0, load: 1.5, discharge: 1.2, idle: 0, misc1: 0, misc2: 0 },
        lsmgo: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        ae: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
        aeScrubber: { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
      },
    });
    const sequence = [
      customLeg({ id: 1, operation: "load", distance: 0, ecaDistance: 0, seaTime: 0, ecaTime: 0, nonEcaTime: 0, portDays: 2, quantity: 30000, portFuelType: "vlsfo" }),
      customLeg({ id: 2, operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", distance: 0, ecaDistance: 0, seaTime: 0, ecaTime: 0, nonEcaTime: 0, portDays: 3, quantity: 30000, expDa: 25000, portFuelType: "vlsfo" }),
    ];
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ vessel, sequence }))).result.current;

    // Load 2d × 1.5 + Disch 3d × 1.2 = 3.0 + 3.6 = 6.6 mt VLSFO
    expect(r.vlsfoConsumption).toBeCloseTo(6.6, 2);
  });

  it("Total voyage fuel = HSFO + VLSFO + LSMGO across sea, port, canal", () => {
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs())).result.current;
    const sum = r.hsfoConsumption + r.vlsfoConsumption + r.lsmgoConsumption;
    expect(sum).toBeGreaterThan(0);
    // ecaFuel + nonEcaFuel account only for sea; total consumption ≥ sea total.
    expect(sum).toBeGreaterThanOrEqual(r.ecaFuel.total + r.nonEcaFuel.total);
  });
});