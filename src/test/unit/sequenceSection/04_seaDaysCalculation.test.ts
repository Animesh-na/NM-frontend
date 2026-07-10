import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customExtraTime, customLeg } from "../../helpers/scenarios";

/**
 * UNIT — Sea Days Calculation.
 *   - Ballast sea days = sea time of load legs (running to load port).
 *   - Laden sea days   = sea time of discharge legs (running with cargo).
 *   - ECA / Non-ECA split comes from leg.ecaTime and leg.nonEcaTime.
 *   - Weather delay is entered as extra at-sea days and adds to totalSeaDays.
 */

describe("Sea Days Calculation", () => {
  it("Ballast: first custom load leg contributes to seaDaysBallast", () => {
    const sequence = [
      customLeg({ id: 1, operation: "load", seaTime: 4.25, ecaTime: 0, nonEcaTime: 4.25, quantity: 30000 }),
      customLeg({ id: 2, operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", seaTime: 9.5, ecaTime: 0, nonEcaTime: 9.5, quantity: 30000, expDa: 25000 }),
    ];
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;
    expect(r.seaDaysBallast).toBeCloseTo(4.25, 4);
  });

  it("Laden: discharge leg contributes to seaDaysLaden", () => {
    const sequence = [
      customLeg({ id: 1, operation: "load", seaTime: 2, ecaTime: 0, nonEcaTime: 2, quantity: 30000 }),
      customLeg({ id: 2, operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", seaTime: 11.75, ecaTime: 0.5, nonEcaTime: 11.25, quantity: 30000, expDa: 25000 }),
    ];
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;
    expect(r.seaDaysLaden).toBeCloseTo(11.75, 4);
  });

  it("ECA distance rolls up across every leg", () => {
    const sequence = [
      customLeg({ id: 1, operation: "load", distance: 800, ecaDistance: 200, seaTime: 3, ecaTime: 0.7, nonEcaTime: 2.3, quantity: 30000 }),
      customLeg({ id: 2, operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", distance: 3200, ecaDistance: 400, seaTime: 12, ecaTime: 1.4, nonEcaTime: 10.6, quantity: 30000, expDa: 25000 }),
    ];
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;
    expect(r.totalEcaDistance).toBe(600);
    expect(r.nonEcaDistance).toBe(4000 - 600);
  });

  it("Non-ECA distance = totalDistance − totalEcaDistance", () => {
    const sequence = [
      customLeg({ id: 1, operation: "load", distance: 1000, ecaDistance: 100, seaTime: 3.5, ecaTime: 0.35, nonEcaTime: 3.15, quantity: 30000 }),
      customLeg({ id: 2, operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", distance: 4000, ecaDistance: 200, seaTime: 14, ecaTime: 0.7, nonEcaTime: 13.3, quantity: 30000, expDa: 25000 }),
    ];
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;
    expect(r.totalDistance - r.totalEcaDistance).toBe(r.nonEcaDistance);
  });

  it("Weather delay (extra at-sea days) is added to totalSeaDays", () => {
    const sequence = [
      customLeg({ id: 1, operation: "load", seaTime: 3, ecaTime: 0, nonEcaTime: 3, quantity: 30000 }),
      customLeg({ id: 2, operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", seaTime: 7, ecaTime: 0, nonEcaTime: 7, quantity: 30000, expDa: 25000 }),
    ];
    const noWeather = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;
    const withWeather = renderHook(() =>
      useVoyageCalculation(createVoyageTestInputs({ sequence, extraTime: customExtraTime({ atSeaDays: 1.5 }) })),
    ).result.current;

    expect(withWeather.extraSeaDays).toBeCloseTo(1.5, 4);
    expect(withWeather.totalSeaDays - noWeather.totalSeaDays).toBeCloseTo(1.5, 4);
  });
});