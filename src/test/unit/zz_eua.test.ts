import { describe, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customBunker, customLeg } from "@/test/helpers/scenarios";

describe("eua", () => {
  it("prints", () => {
    const sequence = [
      customLeg({ id: 1, operation: "", port: "Gibraltar", portUnloc: "GIGIB", seaTime: 0, portDays: 0 }),
      customLeg({ id: 2, operation: "loading", port: "Rotterdam", portUnloc: "NLRTM", isEuEea: true, seaTime: 4, nonEcaTime: 4, portDays: 2, quantity: 30000 }),
      customLeg({ id: 3, operation: "discharging", port: "Hamburg", portUnloc: "DEHAM", isEuEea: true, seaTime: 3, nonEcaTime: 3, portDays: 2, quantity: 30000 }),
    ];
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence, bunker: customBunker({ co2Price: 90 }) }))).result.current;
    console.log({ etsCost: r.etsCost, euaCo2Cost: r.euaCo2Cost, impact: r.euaFreightImpact, chargeable: r.chargeableCo2, uk: r.ukEtsFreightImpact });
  });
});
