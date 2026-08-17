/**
 * FuelEU Maritime Compliance Module
 * -------------------------------------------------------------
 * Independent implementation per the FuelEU Maritime Regulation.
 * Uses Well-to-Wake (WtW) methodology with per-fuel LCV and GHG
 * intensity, year-specific GHG limits, and a penalty rate of
 * €2,400 per tonne CO₂eq (0.058537 €/MJ equivalent).
 *
 * This module does NOT reuse EU ETS or UK ETS logic. It only
 * consumes the EU-covered fuel quantities (derived elsewhere using
 * port `eu_zone` flags with the standard 100/50/50/0 coverage rules).
 */

export type FuelEuFuelType = 'hsfo' | 'vlsfo' | 'lsmgo';

export interface FuelEuFuelProperties {
  lcv: number;      // MJ/g  (Lower Calorific Value)
  wtt: number;      // gCO2eq/MJ (Well-to-Tank)
  ttwCf: number;    // gCO2/gFuel (Tank-to-Wake carbon factor)
  wtwCf: number;    // gCO2eq/gFuel (Well-to-Wake carbon factor)
  ghg: number;      // gCO2eq/MJ (WtW intensity)
}

// Fuel properties per FuelEU Maritime Annex II
export const FUEL_EU_PROPERTIES: Record<FuelEuFuelType, FuelEuFuelProperties> = {
  hsfo:  { lcv: 0.0405, wtt: 13.5, ttwCf: 3.1631, wtwCf: 78.1012, ghg: 91.74 },
  vlsfo: { lcv: 0.0410, wtt: 13.2, ttwCf: 3.2001, wtwCf: 78.0512, ghg: 91.39 },
  lsmgo: { lcv: 0.0427, wtt: 14.4, ttwCf: 3.2551, wtwCf: 76.2319, ghg: 90.77 },
};

// Year-specific GHG intensity limits (gCO2eq/MJ)
export const FUEL_EU_GHG_LIMITS: Array<{ year: number; limit: number }> = [
  { year: 2025, limit: 89.34 },
  { year: 2026, limit: 89.34 },
  { year: 2030, limit: 85.69 },
  { year: 2035, limit: 77.94 },
  { year: 2040, limit: 62.90 },
  { year: 2045, limit: 34.64 },
  { year: 2050, limit: 18.23 },
];

// FuelEU penalty factor: €2,400 per 41,000 MJ of VLSFO-equivalent energy.
export const FUEL_EU_PENALTY_REFERENCE_ENERGY_MJ = 41_000;
export const FUEL_EU_PENALTY_RATE_EUR_PER_T_CO2EQ = 2400;
export const FUEL_EU_PENALTY_RATE_EUR_PER_MJ =
  FUEL_EU_PENALTY_RATE_EUR_PER_T_CO2EQ / FUEL_EU_PENALTY_REFERENCE_ENERGY_MJ; // 0.058536585…

// Configurable EUR → USD conversion rate used to express FuelEU cost in USD.
export const DEFAULT_EUR_USD_RATE = 1.157;

export interface FuelEuPerTonneDetail {
  fuelType: FuelEuFuelType;
  fuelGhgIntensity: number;        // gCO2eq/MJ
  windRewardFactor: number;        // f_wind (1.00 | 0.99 | 0.97 | 0.95)
  adjustedGhgIntensity: number;    // gCO2eq/MJ  = ghg × f_wind
  fuelEuTarget: number;            // gCO2eq/MJ
  ghgDifference: number;           // gCO2eq/MJ
  energyPerTonneMj: number;        // MJ/t
  complianceDeficitGco2eq: number; // gCO2eq/t
  equivalentEnergyMj: number;      // MJ
  eurPerTonne: number;             // €/t
  usdPerTonne: number;             // $/t
  eurUsdRate: number;
}

/**
 * Dynamic FuelEU Maritime penalty per tonne of each fuel.
 * Pure fuel-specific sensitivity — no EU ETS / CII / voyage compliance logic.
 */
export function calculateFuelEuPerTonne(
  year?: number,
  eurUsdRate: number = DEFAULT_EUR_USD_RATE,
  windRewardFactor: number = 1.0
): Record<FuelEuFuelType, FuelEuPerTonneDetail> {
  const target = getFuelEuGhgLimit(year);
  const fWind = windRewardFactor > 0 ? windRewardFactor : 1.0;
  const build = (fuelType: FuelEuFuelType): FuelEuPerTonneDetail => {
    const props = FUEL_EU_PROPERTIES[fuelType];
    // Wind-assisted propulsion reward: GHGadjusted = GHGcalculated × f_wind
    const adjustedGhg = props.ghg * fWind;
    const ghgDifference = adjustedGhg - target;
    const energyPerTonneMj = props.lcv * 1_000_000;
    if (ghgDifference <= 0) {
      return {
        fuelType,
        fuelGhgIntensity: props.ghg,
        windRewardFactor: fWind,
        adjustedGhgIntensity: adjustedGhg,
        fuelEuTarget: target,
        ghgDifference,
        energyPerTonneMj,
        complianceDeficitGco2eq: 0,
        equivalentEnergyMj: 0,
        eurPerTonne: 0,
        usdPerTonne: 0,
        eurUsdRate,
      };
    }
    const complianceDeficitGco2eq = ghgDifference * energyPerTonneMj;
    const equivalentEnergyMj = complianceDeficitGco2eq / adjustedGhg;
    const eurPerTonne = equivalentEnergyMj * FUEL_EU_PENALTY_RATE_EUR_PER_MJ;
    return {
      fuelType,
      fuelGhgIntensity: props.ghg,
      windRewardFactor: fWind,
      adjustedGhgIntensity: adjustedGhg,
      fuelEuTarget: target,
      ghgDifference,
      energyPerTonneMj,
      complianceDeficitGco2eq,
      equivalentEnergyMj,
      eurPerTonne,
      usdPerTonne: eurPerTonne * eurUsdRate,
      eurUsdRate,
    };
  };
  return { hsfo: build('hsfo'), vlsfo: build('vlsfo'), lsmgo: build('lsmgo') };
}

/** Convenience: USD per tonne map for a given year / FX rate. */
export function fuelEuCostPerTonUsd(
  year?: number,
  eurUsdRate: number = DEFAULT_EUR_USD_RATE,
  windRewardFactor: number = 1.0
): Record<FuelEuFuelType, number> {
  const d = calculateFuelEuPerTonne(year, eurUsdRate, windRewardFactor);
  return { hsfo: d.hsfo.usdPerTonne, vlsfo: d.vlsfo.usdPerTonne, lsmgo: d.lsmgo.usdPerTonne };
}

/** Select the GHG limit that applies to the given voyage year (piecewise-constant). */
export function getFuelEuGhgLimit(year?: number): number {
  const y = year ?? new Date().getFullYear();
  let applicable = FUEL_EU_GHG_LIMITS[0].limit;
  for (const step of FUEL_EU_GHG_LIMITS) {
    if (y >= step.year) applicable = step.limit;
  }
  return applicable;
}

export interface FuelEuFuelDetail {
  fuelType: FuelEuFuelType;
  euQuantity: number;     // tonnes of EU-covered fuel
  lcv: number;            // MJ/g
  ghg: number;            // gCO2eq/MJ (WtW)
  euEnergy: number;       // MJ  = tonnes × 1e6 × LCV
  balance: number;        // gCO2eq  = (ghgLimit − ghg) × euEnergy
  penaltyEur: number;     // €     (only if balance < 0)
  costPerTon: number;     // €/t   (penalty / quantity)  — for legacy display
  cost: number;           // alias of penaltyEur (legacy)
}

export interface FuelEuResult {
  voyageYear: number;
  ghgLimit: number;                 // gCO2eq/MJ target for this year
  voyageGhg: number;                // weighted WtW intensity across EU-covered energy
  totalEuEnergy: number;            // MJ
  hsfoBalance: number;              // gCO2eq
  vlsfoBalance: number;
  mgoBalance: number;
  totalBalance: number;             // gCO2eq (negative = non-compliant)
  penaltyEur: number;               // €  (0 when compliant)
  totalPenalty: number;             // alias of penaltyEur (legacy consumers)
  rewardFactor: number;             // pass-through multiplier
  fuels: {
    hsfo: FuelEuFuelDetail;
    vlsfo: FuelEuFuelDetail;
    lsmgo: FuelEuFuelDetail;
  };
  costPerTon: { hsfo: number; vlsfo: number; lsmgo: number };
  legs: FuelEuLegOutput[];          // populated when leg data is supplied
}

export interface FuelEuLegInput {
  fromPort: string;
  toPort: string;
  fromEu: boolean;
  toEu: boolean;
  /** Fuel consumed on this leg, tonnes, by type. */
  fuel: Partial<Record<FuelEuFuelType, number>>;
}

export interface FuelEuLegOutput {
  fromPort: string;
  toPort: string;
  fuelType: FuelEuFuelType;
  euFactor: number;    // 1.0 | 0.5 | 0
  euEnergy: number;    // MJ
}

/** EU coverage factor for a sailing leg based on port eu_zone flags. */
export function fuelEuLegFactor(fromEu: boolean, toEu: boolean): number {
  if (fromEu && toEu) return 1.0;
  if (fromEu || toEu) return 0.5;
  return 0;
}

/**
 * Core FuelEU calculation.
 *
 * @param euCoveredFuel  EU-covered fuel quantities (tonnes) by type.
 *                       These MUST already incorporate leg + port stay EU coverage.
 * @param rewardFactor   Multiplier applied to the final penalty (default 1.0).
 * @param year           Voyage year for GHG limit selection (default = current year).
 * @param legs           Optional per-leg breakdown for detailed output.
 */
export function calculateFuelEu(
  euCoveredFuel: { hsfo: number; vlsfo: number; lsmgo: number },
  rewardFactor: number = 1.0,
  year?: number,
  legs?: FuelEuLegInput[]
): FuelEuResult {
  const voyageYear = year ?? new Date().getFullYear();
  const ghgLimit = getFuelEuGhgLimit(voyageYear);
  // rewardFactor = f_wind (wind-assisted propulsion). It adjusts the GHG
  // intensity used by FuelEU only — it never changes fuel consumption.
  const fWind = rewardFactor > 0 ? rewardFactor : 1.0;
  const perTonne = calculateFuelEuPerTonne(voyageYear, DEFAULT_EUR_USD_RATE, fWind);

  const build = (fuelType: FuelEuFuelType): FuelEuFuelDetail => {
    const props = FUEL_EU_PROPERTIES[fuelType];
    const qty = Math.max(0, euCoveredFuel[fuelType] || 0);
    // Energy: tonnes × 1e6 g/t × LCV MJ/g  =  MJ
    const euEnergy = qty * 1_000_000 * props.lcv;
    const adjGhg = props.ghg * fWind;
    const balance = (ghgLimit - adjGhg) * euEnergy; // gCO2eq
    const staticCostPerTon = perTonne[fuelType].usdPerTonne; // dynamic $/t
    const cost = qty * staticCostPerTon; // USD
    return {
      fuelType,
      euQuantity: qty,
      lcv: props.lcv,
      ghg: adjGhg,
      euEnergy,
      balance,
      penaltyEur: cost,    // legacy alias: static cost per fuel
      costPerTon: staticCostPerTon,
      cost,
    };
  };

  const hsfo = build('hsfo');
  const vlsfo = build('vlsfo');
  const lsmgo = build('lsmgo');

  const totalEuEnergy = hsfo.euEnergy + vlsfo.euEnergy + lsmgo.euEnergy;
  const totalBalance = hsfo.balance + vlsfo.balance + lsmgo.balance;

  // Weighted WtW intensity across EU-covered energy
  const voyageGhg = totalEuEnergy > 0
    ? (hsfo.euEnergy * hsfo.ghg + vlsfo.euEnergy * vlsfo.ghg + lsmgo.euEnergy * lsmgo.ghg) / totalEuEnergy
    : 0;

  // Per-ton cost total applied to EU-covered fuel quantities. The wind reward
  // factor is already baked into the per-tonne rates via the adjusted GHG.
  const penaltyEur = hsfo.cost + vlsfo.cost + lsmgo.cost;

  // Per-leg breakdown (optional)
  const legOutputs: FuelEuLegOutput[] = [];
  if (legs?.length) {
    for (const leg of legs) {
      const factor = fuelEuLegFactor(leg.fromEu, leg.toEu);
      (Object.keys(FUEL_EU_PROPERTIES) as FuelEuFuelType[]).forEach((ft) => {
        const tons = leg.fuel[ft] || 0;
        if (tons <= 0) return;
        const energy = tons * 1_000_000 * FUEL_EU_PROPERTIES[ft].lcv * factor;
        legOutputs.push({
          fromPort: leg.fromPort,
          toPort: leg.toPort,
          fuelType: ft,
          euFactor: factor,
          euEnergy: energy,
        });
      });
    }
  }

  return {
    voyageYear,
    ghgLimit,
    voyageGhg,
    totalEuEnergy,
    hsfoBalance: hsfo.balance,
    vlsfoBalance: vlsfo.balance,
    mgoBalance: lsmgo.balance,
    totalBalance,
    penaltyEur,
    totalPenalty: penaltyEur,
    rewardFactor: fWind,
    fuels: { hsfo, vlsfo, lsmgo },
    costPerTon: {
      hsfo: hsfo.costPerTon,
      vlsfo: vlsfo.costPerTon,
      lsmgo: lsmgo.costPerTon,
    },
    legs: legOutputs,
  };
}