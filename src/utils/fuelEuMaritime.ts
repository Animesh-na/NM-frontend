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
  hsfo:  { lcv: 0.0405, wtt: 13.5, ttwCf: 3.1631, wtwCf: 78.1012, ghg: 91.6012 },
  vlsfo: { lcv: 0.0410, wtt: 13.2, ttwCf: 3.2001, wtwCf: 78.0512, ghg: 91.2512 },
  lsmgo: { lcv: 0.0427, wtt: 14.4, ttwCf: 3.2551, wtwCf: 76.2319, ghg: 90.6319 },
};

// Year-specific GHG intensity limits (gCO2eq/MJ)
export const FUEL_EU_GHG_LIMITS: Array<{ year: number; limit: number }> = [
  { year: 2025, limit: 89.34 },
  { year: 2030, limit: 85.69 },
  { year: 2035, limit: 77.94 },
  { year: 2040, limit: 62.90 },
  { year: 2045, limit: 34.64 },
  { year: 2050, limit: 18.23 },
];

// Static FuelEU per-ton costs (USD/t) — configurable override for current pricing.
// The user can update these constants later; the engine currently uses them directly
// to compute FuelEU Maritime costs rather than deriving them from GHG balance.
export const FUEL_EU_STATIC_COST_PER_TON: Record<FuelEuFuelType, number> = {
  hsfo: 71.82,
  vlsfo: 62.32,
  lsmgo: 45.48,
};

// Legacy penalty rates retained for reference; static costs are now authoritative.
export const FUEL_EU_PENALTY_RATE_EUR_PER_MJ = 0.058537;
export const FUEL_EU_PENALTY_RATE_EUR_PER_T_CO2EQ = 2400;

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

  const build = (fuelType: FuelEuFuelType): FuelEuFuelDetail => {
    const props = FUEL_EU_PROPERTIES[fuelType];
    const qty = Math.max(0, euCoveredFuel[fuelType] || 0);
    // Energy: tonnes × 1e6 g/t × LCV MJ/g  =  MJ
    const euEnergy = qty * 1_000_000 * props.lcv;
    const balance = (ghgLimit - props.ghg) * euEnergy; // gCO2eq
    return {
      fuelType,
      euQuantity: qty,
      lcv: props.lcv,
      ghg: props.ghg,
      euEnergy,
      balance,
      penaltyEur: 0,
      costPerTon: 0,
      cost: 0,
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

  // Penalty only if non-compliant (negative balance)
  //   Penalty (€) = (|Total Balance gCO2eq| / voyageGhg gCO2eq/MJ) × 0.058537 €/MJ
  //   (Total Balance / voyageGhg) yields MJ of the shortfall, then × penalty €/MJ
  let penaltyEur = 0;
  if (totalBalance < 0 && voyageGhg > 0) {
    const shortfallMj = Math.abs(totalBalance) / voyageGhg;
    penaltyEur = shortfallMj * FUEL_EU_PENALTY_RATE_EUR_PER_MJ * rewardFactor;
  }

  // Distribute penalty across fuels using each fuel's share of the negative balance
  const negatives = [hsfo, vlsfo, lsmgo].map((f) => (f.balance < 0 ? Math.abs(f.balance) : 0));
  const totalNeg = negatives.reduce((s, v) => s + v, 0);
  const perFuel = [hsfo, vlsfo, lsmgo];
  perFuel.forEach((f, i) => {
    const share = totalNeg > 0 ? negatives[i] / totalNeg : 0;
    f.penaltyEur = penaltyEur * share;
    f.cost = f.penaltyEur;
    f.costPerTon = f.euQuantity > 0 ? f.penaltyEur / f.euQuantity : 0;
  });

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
    rewardFactor,
    fuels: { hsfo, vlsfo, lsmgo },
    costPerTon: {
      hsfo: hsfo.costPerTon,
      vlsfo: vlsfo.costPerTon,
      lsmgo: lsmgo.costPerTon,
    },
    legs: legOutputs,
  };
}