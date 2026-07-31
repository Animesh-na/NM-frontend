import { describe, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customBunker, customLeg } from "@/test/helpers/scenarios";

const run = (name: string, sequence: any[], bunker: any) => {
  const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence, bunker }))).result.current;
  console.log(name, { eu: r.euCoveredFuel, chargeable: r.chargeableCo2, cost: r.etsCost, impact: r.euaFreightImpact, qty: r.grossFreight });
};

describe("eua matrix", () => {
  it("cases", () => {
    const base = (euLoad: boolean, euDisch: boolean) => [
      customLeg({ id: 1, operation: "", port: "Open", portUnloc: "GIGIB", seaTime: 0, portDays: 0 }),
      customLeg({ id: 2, operation: "loading", port: "L", portUnloc: "AAAAA", isEuEea: euLoad, seaTime: 4, nonEcaTime: 4, portDays: 2, quantity: 30000 }),
      customLeg({ id: 3, operation: "discharging", port: "D", portUnloc: "BBBBB", isEuEea: euDisch, seaTime: 5, nonEcaTime: 5, portDays: 2, quantity: 30000 }),
    ];
    run("EU->EU price euEts", base(true, true), customBunker({ euEtsPrice: 80 }));
    run("nonEU->EU price euEts", base(false, true), customBunker({ euEtsPrice: 80 }));
    run("nonEU->EU price co2Price", base(false, true), customBunker({ co2Price: 80 }));
    run("EU->EU no price", base(true, true), customBunker({}));
  });
});
