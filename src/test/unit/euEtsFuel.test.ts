import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs, type SequenceRow } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "../helpers/mockVesselData";
import { mockCargo, mockBunker } from "../helpers/mockSequenceData";

/**
 * UNIT TEST: EU ETS & FuelEU Fuel Allocation
 * Verifies segment-wise EU fuel calculation with isEuEea flags.
 */

const makeSequence = (legs: Partial<SequenceRow>[]): SequenceRow[] =>
  legs.map((l, i) => ({
    id: i + 1,
    operation: l.operation ?? "load",
    port: l.port ?? "Port",
    portUnloc: l.portUnloc ?? "XXXXX",
    cgo: "Cargo",
    distance: l.distance ?? 1000,
    ecaDistance: l.ecaDistance ?? 0,
    portDays: l.portDays ?? 3,
    quantity: l.quantity ?? 65000,
    expDa: l.expDa ?? 25000,
    seaTime: l.seaTime ?? 3.33,
    ecaTime: l.ecaTime ?? 0,
    nonEcaTime: l.nonEcaTime ?? 3.33,
    baseSeaTime: l.baseSeaTime ?? 3.18,
    seaMarginTime: l.seaMarginTime ?? 0.15,
    seaMargin: l.seaMargin ?? 5,
    turnTimeHours: l.turnTimeHours ?? 6,
    extraTimeHours: l.extraTimeHours ?? 0,
    isEuEea: l.isEuEea,
  }));

describe("EU ETS Fuel Allocation", () => {
  const baseInputs: VoyageInputs = {
    vessel: mockVessel,
    cargo: mockCargo,
    bunker: mockBunker,
    hireRate: 15000,
    sequence: [],
  };

  it("NonEU → EU (Santos→Rotterdam): sea factor=0.5, port EU=100%", () => {
    const seq = makeSequence([
      { operation: "load", port: "Santos", portUnloc: "BRSSZ", isEuEea: false, distance: 1000, seaTime: 3.33, ecaTime: 0, nonEcaTime: 3.33, quantity: 65000 },
      { operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", isEuEea: true, distance: 5500, ecaDistance: 500, seaTime: 18.33, ecaTime: 1.67, nonEcaTime: 16.66, portDays: 4, turnTimeHours: 8, extraTimeHours: 4, quantity: 65000 },
    ]);
    const { result } = renderHook(() => useVoyageCalculation({ ...baseInputs, sequence: seq }));
    const r = result.current;

    // Sea leg Santos→Rotterdam: NonEU→EU = 0.5 factor
    // Port at Santos (NonEU): factor=0, Port at Rotterdam (EU): factor=1
    expect(r.euCoveredFuel.vlsfo).toBeGreaterThan(0);
    expect(r.euCoveredFuel.lsmgo).toBeGreaterThan(0);

    // VLSFO EU should be roughly 50% of sea VLSFO + 100% of Rotterdam port VLSFO
    // Not simply 50% of total
    expect(r.euCoveredFuel.vlsfo).toBeLessThan(r.vlsfoConsumption);
    expect(r.euCoveredFuel.lsmgo).toBeLessThan(r.lsmgoConsumption);

    console.log(`NonEU→EU: VLSFO total=${r.vlsfoConsumption.toFixed(2)}, EU=${r.euCoveredFuel.vlsfo.toFixed(2)} (${(r.euCoveredFuel.vlsfo/r.vlsfoConsumption*100).toFixed(1)}%)`);
    console.log(`NonEU→EU: LSMGO total=${r.lsmgoConsumption.toFixed(2)}, EU=${r.euCoveredFuel.lsmgo.toFixed(2)} (${(r.euCoveredFuel.lsmgo/r.lsmgoConsumption*100).toFixed(1)}%)`);
  });

  it("EU → EU (Rotterdam→Barcelona): second leg 100%, first leg origin unknown", () => {
    const seq = makeSequence([
      { operation: "load", port: "Rotterdam", portUnloc: "NLRTM", isEuEea: true, distance: 500, seaTime: 1.67, ecaTime: 0.5, nonEcaTime: 1.17, quantity: 30000 },
      { operation: "disch", port: "Barcelona", portUnloc: "ESBCN", isEuEea: true, distance: 2000, seaTime: 6.67, ecaTime: 0, nonEcaTime: 6.67, portDays: 3, quantity: 30000 },
    ]);
    const { result } = renderHook(() => useVoyageCalculation({ ...baseInputs, sequence: seq, cargo: { ...mockCargo, quantity: 30000 } }));
    const r = result.current;

    // First leg: unknown origin → EU = 0.5 factor for sea
    // Second leg: EU → EU = 1.0 factor for sea
    // All ports are EU = 100% port coverage
    expect(r.euCoveredFuel.vlsfo).toBeGreaterThan(0);
    // EU covered should be > 50% because second leg (larger) is 100%
    const vlsfoPct = r.euCoveredFuel.vlsfo / r.vlsfoConsumption;
    expect(vlsfoPct).toBeGreaterThan(0.5);
    expect(vlsfoPct).toBeLessThanOrEqual(1.0);

    console.log(`EU→EU: VLSFO total=${r.vlsfoConsumption.toFixed(2)}, EU=${r.euCoveredFuel.vlsfo.toFixed(2)} (${(vlsfoPct*100).toFixed(1)}%)`);
  });

  it("NonEU → NonEU (Santos→Paranagua): factor=0, no EU fuel", () => {
    const seq = makeSequence([
      { operation: "load", port: "Santos", portUnloc: "BRSSZ", isEuEea: false, distance: 200, seaTime: 0.67, ecaTime: 0, nonEcaTime: 0.67, quantity: 65000 },
      { operation: "disch", port: "Paranagua", portUnloc: "BRPNG", isEuEea: false, distance: 300, seaTime: 1.0, ecaTime: 0, nonEcaTime: 1.0, quantity: 65000 },
    ]);
    const { result } = renderHook(() => useVoyageCalculation({ ...baseInputs, sequence: seq }));
    const r = result.current;

    expect(r.euCoveredFuel.hsfo).toBe(0);
    expect(r.euCoveredFuel.vlsfo).toBe(0);
    expect(r.euCoveredFuel.lsmgo).toBe(0);
  });

  it("Multi-leg: NonEU→EU→EU→NonEU mixes factors correctly", () => {
    const seq = makeSequence([
      { operation: "load", port: "Santos", portUnloc: "BRSSZ", isEuEea: false, distance: 1000, seaTime: 3.33, ecaTime: 0, nonEcaTime: 3.33, quantity: 50000 },
      { operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", isEuEea: true, distance: 5000, seaTime: 16.67, ecaTime: 1.0, nonEcaTime: 15.67, portDays: 3, quantity: 25000 },
      { operation: "disch", port: "Hamburg", portUnloc: "DEHAM", isEuEea: true, distance: 300, seaTime: 1.0, ecaTime: 0.5, nonEcaTime: 0.5, portDays: 3, quantity: 25000 },
    ]);
    const { result } = renderHook(() => useVoyageCalculation({ ...baseInputs, sequence: seq, cargo: { ...mockCargo, quantity: 50000 } }));
    const r = result.current;

    // Leg 1 (Santos→Rotterdam): NonEU→EU = 0.5
    // Leg 2 (Rotterdam→Hamburg): EU→EU = 1.0
    // Port Santos: 0, Port Rotterdam: 1.0, Port Hamburg: 1.0
    expect(r.euCoveredFuel.vlsfo).toBeGreaterThan(0);
    expect(r.euCoveredFuel.vlsfo).toBeLessThan(r.vlsfoConsumption);

    // LSMGO EU% should be higher than VLSFO EU% because more port time is at EU ports
    const vlsfoPct = r.euCoveredFuel.vlsfo / r.vlsfoConsumption;
    const lsmgoPct = r.euCoveredFuel.lsmgo / r.lsmgoConsumption;
    expect(lsmgoPct).toBeGreaterThanOrEqual(vlsfoPct - 0.05); // LSMGO typically higher

    console.log(`Multi-leg: VLSFO EU%=${(vlsfoPct*100).toFixed(1)}%, LSMGO EU%=${(lsmgoPct*100).toFixed(1)}%`);
  });

  it("Port fuel at EU port is 100% covered regardless of sea factor", () => {
    // Even if sea leg is NonEU→EU (50%), port stay at EU port = 100%
    const seq = makeSequence([
      { operation: "load", port: "Santos", portUnloc: "BRSSZ", isEuEea: false, distance: 1000, seaTime: 3.33, ecaTime: 0, nonEcaTime: 3.33, portDays: 3, quantity: 65000 },
      { operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", isEuEea: true, distance: 5500, seaTime: 18.33, ecaTime: 1.67, nonEcaTime: 16.66, portDays: 4, turnTimeHours: 8, extraTimeHours: 4, quantity: 65000 },
    ]);
    const { result } = renderHook(() => useVoyageCalculation({ ...baseInputs, sequence: seq }));
    const r = result.current;

    // The EU LSMGO should include 100% of Rotterdam port AE consumption
    // This means LSMGO EU% > VLSFO EU% (because port AE is fully covered)
    const vlsfoPct = r.euCoveredFuel.vlsfo / r.vlsfoConsumption;
    const lsmgoPct = r.euCoveredFuel.lsmgo / r.lsmgoConsumption;
    expect(lsmgoPct).toBeGreaterThan(vlsfoPct);

    console.log(`Port coverage: VLSFO EU%=${(vlsfoPct*100).toFixed(1)}%, LSMGO EU%=${(lsmgoPct*100).toFixed(1)}%`);
  });

  it("ECA/EU ports without port code still count in ETS fuel allocation", () => {
    const seq = makeSequence([
      { operation: "load", port: "Santos", portUnloc: "BRSSZ", isEuEea: false, distance: 1000, seaTime: 3.33, ecaTime: 0, nonEcaTime: 3.33, quantity: 65000 },
      { operation: "disch", port: "Antwerpen", portUnloc: "", isEuEea: true, distance: 5500, ecaDistance: 500, seaTime: 18.33, ecaTime: 1.67, nonEcaTime: 16.66, portDays: 4, turnTimeHours: 8, extraTimeHours: 4, quantity: 65000 },
    ]);
    const { result } = renderHook(() => useVoyageCalculation({ ...baseInputs, sequence: seq }));
    const r = result.current;

    expect(r.euCoveredFuel.vlsfo).toBeGreaterThan(0);
    expect(r.euCoveredFuel.lsmgo).toBeGreaterThan(0);
  });

  it("Passing and bunkering ports inherit the Load→Discharge ETS bracket", () => {
    const seq = makeSequence([
      { operation: "load", port: "Santos", portUnloc: "BRSSZ", isEuEea: false, seaTime: 0, nonEcaTime: 0, quantity: 65000 },
      { operation: "pssg", port: "Tenerife", portUnloc: "ESTCI", isEuEea: false, distance: 2500, seaTime: 8.33, nonEcaTime: 8.33, portDays: 0, quantity: 0 },
      { operation: "bunkering", port: "Gibraltar", portUnloc: "GIGIB", isEuEea: false, distance: 700, seaTime: 2.33, nonEcaTime: 2.33, portDays: 1, quantity: 0 },
      { operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", isEuEea: true, distance: 1200, seaTime: 4, nonEcaTime: 3, ecaTime: 1, portDays: 3, quantity: 65000 },
    ]);

    const { result } = renderHook(() => useVoyageCalculation({ ...baseInputs, sequence: seq }));
    const details = result.current.etsLegDetails;

    expect(details.find(d => d.destPort === "Tenerife")?.coveragePct).toBe(50);
    expect(details.find(d => d.destPort === "Gibraltar")?.coveragePct).toBe(50);
    expect(details.find(d => d.destPort === "Rotterdam")?.coveragePct).toBe(50);
  });

  it("Sea legs between two EU discharge ports are 100% even after a NonEU load", () => {
    const seq = makeSequence([
      { operation: "load", port: "Santos", portUnloc: "BRSSZ", isEuEea: false, seaTime: 0, nonEcaTime: 0, quantity: 65000 },
      { operation: "disch", port: "Rotterdam", portUnloc: "NLRTM", isEuEea: true, distance: 5000, seaTime: 16.67, nonEcaTime: 15.67, ecaTime: 1, portDays: 3, quantity: 30000 },
      { operation: "pssg", port: "North Sea", portUnloc: "PASS1", isEuEea: true, distance: 150, seaTime: 0.5, nonEcaTime: 0, ecaTime: 0.5, portDays: 0, quantity: 0 },
      { operation: "disch", port: "Hamburg", portUnloc: "DEHAM", isEuEea: true, distance: 300, seaTime: 1, nonEcaTime: 0.5, ecaTime: 0.5, portDays: 3, quantity: 35000 },
    ]);

    const { result } = renderHook(() => useVoyageCalculation({ ...baseInputs, sequence: seq, cargo: { ...mockCargo, quantity: 65000 } }));
    const details = result.current.etsLegDetails;

    expect(details.find(d => d.destPort === "Rotterdam")?.coveragePct).toBe(50);
    expect(details.find(d => d.destPort === "North Sea")?.coveragePct).toBe(100);
    expect(details.find(d => d.destPort === "Hamburg")?.coveragePct).toBe(100);
  });
});
