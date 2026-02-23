/**
 * Mock sequence data for testing voyage calculations.
 */

import type { SequenceRow, CargoData, BunkerData, MiscCostsData, ExtraTimeData } from "@/hooks/useVoyageCalculation";

// Simple 2-leg voyage: Ballast to Load port, then Laden to Discharge port
export const mockSimpleSequence: SequenceRow[] = [
  {
    id: 1,
    operation: "load",
    port: "Santos",
    portUnloc: "BRSSZ",
    cgo: "Soybeans",
    distance: 1000,
    ecaDistance: 0,
    portDays: 3,
    quantity: 65000,
    expDa: 25000,
    seaTime: 3.33,    // 1000nm / (12.5kn * 24) = 3.33 days
    ecaTime: 0,
    nonEcaTime: 3.33,
    baseSeaTime: 3.18,
    seaMarginTime: 0.15,
    seaMargin: 5,
    turnTimeHours: 6,
    extraTimeHours: 0,
  },
  {
    id: 2,
    operation: "disch",
    port: "Rotterdam",
    portUnloc: "NLRTM",
    cgo: "Soybeans",
    distance: 5500,
    ecaDistance: 500,
    portDays: 4,
    quantity: 65000,
    expDa: 35000,
    seaTime: 18.33,   // 5500nm / (12.5kn * 24) = 18.33 days
    ecaTime: 1.67,    // 500nm ECA portion
    nonEcaTime: 16.66,
    baseSeaTime: 17.46,
    seaMarginTime: 0.87,
    seaMargin: 5,
    turnTimeHours: 8,
    extraTimeHours: 4,
  },
];

// Sequence with ECA zones for fuel switching tests
export const mockEcaSequence: SequenceRow[] = [
  {
    id: 1,
    operation: "load",
    port: "Hamburg",
    portUnloc: "DEHAM",
    cgo: "Steel Coils",
    distance: 800,
    ecaDistance: 400, // 50% ECA
    portDays: 2,
    quantity: 30000,
    expDa: 20000,
    seaTime: 2.67,
    ecaTime: 1.33,
    nonEcaTime: 1.34,
    baseSeaTime: 2.54,
    seaMarginTime: 0.13,
    seaMargin: 5,
    turnTimeHours: 4,
    extraTimeHours: 0,
  },
  {
    id: 2,
    operation: "disch",
    port: "Antwerp",
    portUnloc: "BEANR",
    cgo: "Steel Coils",
    distance: 200,
    ecaDistance: 200, // 100% ECA
    portDays: 2,
    quantity: 30000,
    expDa: 18000,
    seaTime: 0.67,
    ecaTime: 0.67,
    nonEcaTime: 0,
    baseSeaTime: 0.64,
    seaMarginTime: 0.03,
    seaMargin: 5,
    turnTimeHours: 4,
    extraTimeHours: 0,
  },
];

export const mockCargo: CargoData = {
  rate: 25,
  rateType: "mt",
  quantity: 65000,
  voyageCommission: 3.75,
  tcCommission: 2.5,
  demurrage: 15000,
  despatch: 0,
};

export const mockCargoLumpsum: CargoData = {
  rate: 1500000,
  rateType: "lumpsum",
  quantity: 65000,
  voyageCommission: 3.75,
  tcCommission: 2.5,
  demurrage: 0,
  despatch: 5000,
};

export const mockBunker: BunkerData = {
  hsfo: { price: 450, robStart: 500 },
  vlsfo: { price: 580, robStart: 300 },
  lsmgo: { price: 750, robStart: 150 },
  co2Price: 70,
  rewardFactor: 1.0,
};

export const mockMiscCosts: MiscCostsData = {
  miscCost: 5000,
  extraFees: 2000,
  extraInsurance: 3000,
  canalCost1: 50000,
  canalCost2: 0,
};

export const mockExtraTime: ExtraTimeData = {
  canal1Days: 1,
  canal2Days: 0,
  idlePortDays: 0.5,
  atSeaDays: 0,
  atSeaSpeedContext: "EV",
};
