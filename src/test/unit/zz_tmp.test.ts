import { describe, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { createVoyageTestInputs, customLeg } from "../helpers/scenarios";

describe("eu ballast", () => {
  it("rows", () => {
    const sequence = [
      customLeg({ id: 1, operation: "", port: "Antwerpen", portUnloc: "BEANR", isEuEea: true, seaTime: 0, portDays: 0 }),
      customLeg({ id: 2, operation: "loading", port: "Rotterdam", portUnloc: "NLRTM", isEuEea: true, seaTime: 0.31, nonEcaTime: 0, ecaTime: 0.31, portDays: 1, quantity: 40000 }),
      customLeg({ id: 3, operation: "discharging", port: "Aviles", portUnloc: "ESAVS", isEuEea: true, seaTime: 2.83, nonEcaTime: 1.5, ecaTime: 1.33, portDays: 2, quantity: 40000 }),
    ];
    const r = renderHook(() => useVoyageCalculation(createVoyageTestInputs({ sequence }))).result.current;
    console.log("ROWS", JSON.stringify(r.etsLegDetails.map(l => ({i:l.legIndex,o:l.originPort,d:l.destPort,pct:l.coveragePct,port:l.portCoveragePct,po:l.isPortOnly,sea:l.seaVlsfo+l.seaLsmgo}))));
  });
});
