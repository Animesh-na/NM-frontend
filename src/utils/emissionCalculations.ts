// CO₂ Emission and Efficiency Rating Calculation Module
// Based on IMO regulations and EU ETS requirements

// ===========================================
// EMISSION FACTORS (t CO₂ per ton fuel)
// ===========================================
export const CO2_EMISSION_FACTORS = {
  hsfo: 3.114, // Heavy Fuel Oil
  vlsfo: 3.114, // Very Low Sulphur Fuel Oil (same as HFO for CO2)
  lsmgo: 3.206, // Low Sulphur Marine Gas Oil
} as const;

// ===========================================
// EU ETS COVERAGE TYPES
// ===========================================
export type EtsVoyageType = 
  | 'eu_to_eu'      // 100% coverage
  | 'eu_to_non_eu'  // 50% coverage
  | 'non_eu_to_eu'  // 50% coverage
  | 'non_eu_to_non_eu'; // 0% coverage

// EU member states (ISO 2-letter country codes)
export const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA countries (also covered by EU ETS)
  'NO', 'IS', 'LI'
]);

// ===========================================
// EU ETS PHASE-IN PERCENTAGES BY YEAR
// ===========================================
export const ETS_PHASE_IN_PERCENTAGES: Record<number, number> = {
  2024: 0.40, // 40%
  2025: 0.70, // 70%
  2026: 1.00, // 100%
  2027: 1.00,
  2028: 1.00,
  2029: 1.00,
  2030: 1.00,
};

// ===========================================
// CII REFERENCE VALUES (IMO 2023)
// Based on ship type and capacity
// ===========================================
export interface CiiReference {
  a: number; // Coefficient 'a' 
  c: number; // Exponent 'c'
  reductionFactor: Record<number, number>; // Year-based reduction
}

// CII reference values by ship type (simplified)
export const CII_REFERENCE_VALUES: Record<string, CiiReference> = {
  bulk_carrier: {
    a: 4745,
    c: 0.622,
    reductionFactor: { 2023: 0.05, 2024: 0.07, 2025: 0.09, 2026: 0.11 }
  },
  tanker: {
    a: 5247,
    c: 0.610,
    reductionFactor: { 2023: 0.05, 2024: 0.07, 2025: 0.09, 2026: 0.11 }
  },
  container: {
    a: 1984,
    c: 0.489,
    reductionFactor: { 2023: 0.05, 2024: 0.07, 2025: 0.09, 2026: 0.11 }
  },
  general_cargo: {
    a: 588,
    c: 0.3885,
    reductionFactor: { 2023: 0.05, 2024: 0.07, 2025: 0.09, 2026: 0.11 }
  },
  default: {
    a: 4745,
    c: 0.622,
    reductionFactor: { 2023: 0.05, 2024: 0.07, 2025: 0.09, 2026: 0.11 }
  }
};

// CII Rating boundaries (as ratio to required CII)
export const CII_RATING_BOUNDARIES = {
  A: { max: 0.82 },      // Superior - CII ratio ≤ 82% of required
  B: { min: 0.82, max: 0.93 }, // Minor superior
  C: { min: 0.93, max: 1.08 }, // Moderate - meets requirements
  D: { min: 1.08, max: 1.20 }, // Inferior
  E: { min: 1.20 },      // Inferior - needs corrective action
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Determine if a port is in an EU/EEA country
 * Uses the country code from UNLOC (first 2 chars)
 */
export function isEuPort(portUnloc: string): boolean {
  if (!portUnloc || portUnloc.length < 2) return false;
  const countryCode = portUnloc.substring(0, 2).toUpperCase();
  return EU_COUNTRIES.has(countryCode);
}

/**
 * Determine EU ETS voyage coverage based on origin/destination
 */
export function getEtsVoyageCoverage(
  originUnloc: string,
  destinationUnloc: string
): { type: EtsVoyageType; percentage: number } {
  const originIsEu = isEuPort(originUnloc);
  const destinationIsEu = isEuPort(destinationUnloc);
  
  if (originIsEu && destinationIsEu) {
    return { type: 'eu_to_eu', percentage: 1.0 };
  } else if (originIsEu && !destinationIsEu) {
    return { type: 'eu_to_non_eu', percentage: 0.5 };
  } else if (!originIsEu && destinationIsEu) {
    return { type: 'non_eu_to_eu', percentage: 0.5 };
  } else {
    return { type: 'non_eu_to_non_eu', percentage: 0.0 };
  }
}

/**
 * Get EU ETS phase-in percentage for a given year
 */
export function getEtsPhaseInPercentage(year?: number): number {
  const currentYear = year || new Date().getFullYear();
  if (currentYear < 2024) return 0;
  if (currentYear >= 2026) return 1.0;
  return ETS_PHASE_IN_PERCENTAGES[currentYear] || 1.0;
}

// ===========================================
// CO₂ EMISSION CALCULATIONS
// ===========================================

export interface FuelConsumption {
  hsfo: number;
  vlsfo: number;
  lsmgo: number;
}

export interface Co2BreakdownByFuel {
  hsfo: number;
  vlsfo: number;
  lsmgo: number;
  total: number;
}

/**
 * Calculate CO₂ emissions from fuel consumption
 */
export function calculateCo2Emissions(fuel: FuelConsumption): Co2BreakdownByFuel {
  const hsfo = fuel.hsfo * CO2_EMISSION_FACTORS.hsfo;
  const vlsfo = fuel.vlsfo * CO2_EMISSION_FACTORS.vlsfo;
  const lsmgo = fuel.lsmgo * CO2_EMISSION_FACTORS.lsmgo;
  
  return {
    hsfo,
    vlsfo,
    lsmgo,
    total: hsfo + vlsfo + lsmgo,
  };
}

// ===========================================
// EU ETS CALCULATIONS
// ===========================================

export interface EtsCalculationInput {
  totalCo2: number;
  voyageLegs: Array<{
    originUnloc: string;
    destinationUnloc: string;
    co2: number; // CO2 for this leg
  }>;
  co2Price: number;
  year?: number;
}

export interface EtsResult {
  totalCo2: number;
  etsVoyageCoverage: number; // Weighted average coverage
  phaseInPercentage: number;
  chargeableCo2: number;
  etsCost: number;
  legBreakdown: Array<{
    origin: string;
    destination: string;
    coverage: number;
    co2: number;
    chargeableCo2: number;
  }>;
}

/**
 * Calculate EU ETS emissions cost
 * Considers voyage coverage (EU-EU, EU-NonEU, etc.) and phase-in
 */
export function calculateEtsCost(input: EtsCalculationInput): EtsResult {
  const { totalCo2, voyageLegs, co2Price, year } = input;
  const phaseInPercentage = getEtsPhaseInPercentage(year);
  
  let totalChargeableCo2 = 0;
  const legBreakdown: EtsResult['legBreakdown'] = [];
  
  // Calculate coverage for each leg
  voyageLegs.forEach(leg => {
    const coverage = getEtsVoyageCoverage(leg.originUnloc, leg.destinationUnloc);
    const chargeableCo2 = leg.co2 * coverage.percentage * phaseInPercentage;
    totalChargeableCo2 += chargeableCo2;
    
    legBreakdown.push({
      origin: leg.originUnloc,
      destination: leg.destinationUnloc,
      coverage: coverage.percentage,
      co2: leg.co2,
      chargeableCo2,
    });
  });
  
  // If no legs provided, use simplified calculation
  if (voyageLegs.length === 0) {
    totalChargeableCo2 = totalCo2 * phaseInPercentage;
  }
  
  // Calculate weighted average coverage
  const etsVoyageCoverage = totalCo2 > 0 && legBreakdown.length > 0
    ? legBreakdown.reduce((sum, leg) => sum + (leg.co2 / totalCo2) * leg.coverage, 0)
    : 0;
  
  return {
    totalCo2,
    etsVoyageCoverage,
    phaseInPercentage,
    chargeableCo2: totalChargeableCo2,
    etsCost: totalChargeableCo2 * co2Price,
    legBreakdown,
  };
}

// ===========================================
// CII RATING CALCULATIONS
// ===========================================

export interface CiiCalculationInput {
  totalCo2: number; // tonnes
  dwt: number; // deadweight tonnage
  distanceTravelled: number; // nautical miles
  shipType?: string;
  year?: number;
}

export interface CiiResult {
  actualCii: number; // gCO2/dwt-nm
  requiredCii: number; // Reference CII value
  ciiRatio: number; // Actual / Required
  rating: 'A' | 'B' | 'C' | 'D' | 'E';
  ratingDescription: string;
  boundaries: {
    A: number;
    B: number;
    C: number;
    D: number;
  };
}

/**
 * Calculate vessel CII rating based on IMO methodology
 */
export function calculateCiiRating(input: CiiCalculationInput): CiiResult {
  const { totalCo2, dwt, distanceTravelled, shipType = 'default', year } = input;
  const currentYear = year || new Date().getFullYear();
  
  // Calculate Actual CII = Total CO2 × 10^6 / (DWT × Distance)
  // Result in gCO2/dwt-nm
  const actualCii = dwt > 0 && distanceTravelled > 0
    ? (totalCo2 * 1000000) / (dwt * distanceTravelled)
    : 0;
  
  // Get reference values for ship type
  const ref = CII_REFERENCE_VALUES[shipType] || CII_REFERENCE_VALUES.default;
  
  // Calculate Required CII = a × DWT^(-c) × (1 - reduction factor)
  const baseRef = ref.a * Math.pow(dwt, -ref.c);
  const reductionFactor = ref.reductionFactor[currentYear] || 0.11;
  const requiredCii = baseRef * (1 - reductionFactor);
  
  // Calculate CII Ratio
  const ciiRatio = requiredCii > 0 ? actualCii / requiredCii : 0;
  
  // Determine rating based on ratio
  let rating: 'A' | 'B' | 'C' | 'D' | 'E';
  let ratingDescription: string;
  
  if (ciiRatio <= CII_RATING_BOUNDARIES.A.max) {
    rating = 'A';
    ratingDescription = 'Superior performance - significantly exceeds requirements';
  } else if (ciiRatio <= CII_RATING_BOUNDARIES.B.max) {
    rating = 'B';
    ratingDescription = 'Minor superior - exceeds requirements';
  } else if (ciiRatio <= CII_RATING_BOUNDARIES.C.max) {
    rating = 'C';
    ratingDescription = 'Moderate - meets requirements';
  } else if (ciiRatio <= CII_RATING_BOUNDARIES.D.max) {
    rating = 'D';
    ratingDescription = 'Inferior - below requirements, corrective action advised';
  } else {
    rating = 'E';
    ratingDescription = 'Inferior - significant action required within 3 years';
  }
  
  // Calculate boundary values for display
  const boundaries = {
    A: requiredCii * CII_RATING_BOUNDARIES.A.max,
    B: requiredCii * CII_RATING_BOUNDARIES.B.max,
    C: requiredCii * CII_RATING_BOUNDARIES.C.max,
    D: requiredCii * CII_RATING_BOUNDARIES.D.max,
  };
  
  return {
    actualCii,
    requiredCii,
    ciiRatio,
    rating,
    ratingDescription,
    boundaries,
  };
}

// ===========================================
// EFOI (Energy Efficiency Operational Indicator)
// ===========================================

export interface EfoiResult {
  efoi: number; // gCO2/tonne-nm
  cargoCarried: number;
  ladenDistance: number;
}

/**
 * Calculate EFOI (gCO2 per tonne-nautical mile of cargo)
 */
export function calculateEfoi(
  totalCo2: number,
  cargoCarried: number,
  ladenDistance: number
): EfoiResult {
  const efoi = cargoCarried > 0 && ladenDistance > 0
    ? (totalCo2 * 1000000) / (cargoCarried * ladenDistance)
    : 0;
  
  return {
    efoi,
    cargoCarried,
    ladenDistance,
  };
}

// ===========================================
// VALIDATION HELPERS
// ===========================================

export interface EmissionValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export function validateEmissionInputs(
  fuel: FuelConsumption,
  dwt: number,
  distance: number,
  cargo: number,
  co2Price: number
): EmissionValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Check required inputs
  if (fuel.hsfo + fuel.vlsfo + fuel.lsmgo === 0) {
    errors.push('No fuel consumption data available');
  }
  
  if (dwt <= 0) {
    errors.push('Vessel DWT is required for CII calculation');
  }
  
  if (distance <= 0) {
    errors.push('Total voyage distance is required');
  }
  
  if (cargo <= 0) {
    warnings.push('Cargo quantity missing - EFOI cannot be calculated');
  }
  
  if (co2Price <= 0) {
    warnings.push('CO₂ price not set - ETS cost will be zero');
  }
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Check if CII rating requires corrective action
 */
export function requiresCiiCorrectiveAction(rating: string): boolean {
  return rating === 'D' || rating === 'E';
}

// ===========================================
// FUEL EU MARITIME COMPLIANCE
// ===========================================

// Well-to-Wake GHG Intensity by fuel type (gCO₂eq/MJ)
export const FUEL_EU_GHG_INTENSITY: Record<string, number> = {
  hsfo: 91.74,
  vlsfo: 91.39,
  lsmgo: 90.77,
};

// FuelEU Maritime GHG intensity targets by year (gCO₂eq/MJ)
export const FUEL_EU_TARGETS: Record<number, number> = {
  2025: 89.34,
  2026: 89.34,
  2030: 80.70,
  2035: 72.00,
  2040: 63.40,
  2045: 54.70,
  2050: 26.10,
};

// Per-ton penalty rates for 2026 (USD) — derived from FuelEU Maritime regulation
export const FUEL_EU_PENALTY_PER_TON: Record<string, number> = {
  hsfo: 73.30,
  vlsfo: 63.61,
  lsmgo: 46.42,
};

export function getFuelEuTarget(year?: number): number {
  const y = year || new Date().getFullYear();
  if (y <= 2025) return FUEL_EU_TARGETS[2025] || 89.34;
  if (y <= 2029) return FUEL_EU_TARGETS[2026] || 89.34;
  if (y <= 2034) return FUEL_EU_TARGETS[2030] || 80.70;
  if (y <= 2039) return FUEL_EU_TARGETS[2035] || 72.00;
  if (y <= 2044) return FUEL_EU_TARGETS[2040] || 63.40;
  if (y <= 2049) return FUEL_EU_TARGETS[2045] || 54.70;
  return FUEL_EU_TARGETS[2050] || 26.10;
}

export interface FuelEuResult {
  target: number; // gCO₂eq/MJ target for year
  rewardFactor: number;
  fuels: {
    hsfo: { intensity: number; penalty_per_ton: number; euQuantity: number; penalty: number };
    vlsfo: { intensity: number; penalty_per_ton: number; euQuantity: number; penalty: number };
    lsmgo: { intensity: number; penalty_per_ton: number; euQuantity: number; penalty: number };
  };
  totalPenalty: number;
}

/**
 * Calculate FuelEU Maritime penalties
 * Penalties apply only to EU-covered fuel quantities
 */
export function calculateFuelEuPenalty(
  euCoveredFuel: { hsfo: number; vlsfo: number; lsmgo: number },
  rewardFactor: number = 1.0,
  year?: number
): FuelEuResult {
  const target = getFuelEuTarget(year);

  const calcPenalty = (fuelType: 'hsfo' | 'vlsfo' | 'lsmgo') => {
    const intensity = FUEL_EU_GHG_INTENSITY[fuelType];
    const penaltyPerTon = FUEL_EU_PENALTY_PER_TON[fuelType];
    const qty = euCoveredFuel[fuelType];
    // Penalty only applies if intensity exceeds target
    const penalty = intensity > target ? qty * penaltyPerTon : 0;
    return { intensity, penalty_per_ton: penaltyPerTon, euQuantity: qty, penalty };
  };

  const hsfo = calcPenalty('hsfo');
  const vlsfo = calcPenalty('vlsfo');
  const lsmgo = calcPenalty('lsmgo');

  return {
    target,
    rewardFactor,
    fuels: { hsfo, vlsfo, lsmgo },
    totalPenalty: hsfo.penalty + vlsfo.penalty + lsmgo.penalty,
  };
}
