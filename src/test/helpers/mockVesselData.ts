/**
 * Mock vessel data for testing the voyage calculation engine.
 */

import type { VesselData, ConsumptionMatrix, ExtendedConsumption } from "@/data/vessels";

function ext(vals: Partial<ExtendedConsumption> = {}): ExtendedConsumption {
  return { ballast: 0, laden: 0, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0, ...vals };
}

function matrix(overrides: Partial<ConsumptionMatrix> = {}): ConsumptionMatrix {
  return {
    speed: ext({ ballast: 12.5, laden: 12.5, canal: 8 }),
    hsfo: ext(),
    vlsfo: ext(),
    lsmgo: ext(),
    ae: ext(),
    aeScrubber: ext(),
    ...overrides,
  };
}

const ecoConsumption: ConsumptionMatrix = matrix({
  speed: ext({ ballast: 12.5, laden: 12.5, canal: 8 }),
  hsfo: ext({ ballast: 20, laden: 22, load: 2, discharge: 2, idle: 1, canal: 15 }),
  vlsfo: ext({ ballast: 5, laden: 5.5, load: 0.5, discharge: 0.5, idle: 0.3, canal: 3 }),
  lsmgo: ext({ ballast: 1, laden: 1.2, load: 0.3, discharge: 0.3, idle: 0.2, canal: 1 }),
  ae: ext({ ballast: 1.5, laden: 1.8, load: 1.0, discharge: 1.0, idle: 0.8, canal: 1.2 }),
  aeScrubber: ext(),
});

const fullConsumption: ConsumptionMatrix = matrix({
  speed: ext({ ballast: 14.5, laden: 14.5, canal: 8 }),
  hsfo: ext({ ballast: 26, laden: 28.6, load: 2, discharge: 2, idle: 1, canal: 15 }),
  vlsfo: ext({ ballast: 6.5, laden: 7.15, load: 0.5, discharge: 0.5, idle: 0.3, canal: 3 }),
  lsmgo: ext({ ballast: 1.3, laden: 1.56, load: 0.3, discharge: 0.3, idle: 0.2, canal: 1 }),
  ae: ext({ ballast: 1.5, laden: 1.8, load: 1.0, discharge: 1.0, idle: 0.8, canal: 1.2 }),
  aeScrubber: ext(),
});

export const mockVessel: VesselData = {
  name: "Test Bulk Carrier",
  type: "bulk_carrier",
  imo: "9876543",
  dwt: 75000,
  gt: 40000,
  cubic: 90000,
  cubicUnit: "cbm",
  draft: 14.5,
  tpcTpi: 65,
  hsfoCapability: true,
  hasScrubber: false,
  scrubberCount: 0,
  builtYear: 2018,
  speedProfile: "eco",
  ecoConsumption,
  fullConsumption,
  loadDischIdleSame: false,
  miscMultiplier: 1,
  consumption: {
    speed: { ecoBallast: 12.5, ecoLaden: 12.5, canal: 8 },
    hsfo: { ecoBallast: 20, ecoLaden: 22, canal: 15 },
    vlsfo: { ecoBallast: 5, ecoLaden: 5.5, canal: 3 },
    lsmgo: { ecoBallast: 1, ecoLaden: 1.2, canal: 1 },
    ae: { ecoBallast: 1.5, ecoLaden: 1.8, canal: 1.2 },
    aeScrubber: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
  },
};

export const mockVesselFullSpeed: VesselData = {
  ...mockVessel,
  speedProfile: "full",
};
