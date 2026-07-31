import { describe, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customBunker, customLeg } from "@/test/helpers/scenarios";

describe("eua price", () => {
  it("uses euEtsPrice when co2Price is 0", () => {
    const sequence = [
      customLeg({ id: 1, operation: "", port: "Open", portUnloc: "GIGIB", seaTime: 0, portDays: 0 }),
      customLeg({ id: 2, operation: "loading", port: "L", portUnloc: "AAAAA", isEuEea: true, seaTime: 4, nonEcaTime: 4, portDays: 2, quantity: 30000 }),
      customLeg({ id: 3, operation: "discharging", port: "D", portUnloc: "BBBBB", isEuEea: true, seaTime: 5, nonEcaTime: 5, portDays: 2, quantity: 30000 }),
    ];
    const inputs = createVoyageTestInputs({ sequence, bunker: { ...customBunker({ co2Price: 0 }), euEtsPrice: 80 } as any });
    const r = renderHook(() => useVoyageCalculation(inputs)).result.current;
    console.log("RESULT", { chargeable: r.chargeableCo2, cost: r.etsCost, impact: r.euaFreightImpact });
  });
});
