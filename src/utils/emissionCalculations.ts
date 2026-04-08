// CO₂ Emission and Efficiency Rating Calculation Module
// Based on IMO regulations and EU ETS requirements

// ===========================================
// EMISSION FACTORS (t CO₂ per ton fuel)
// ===========================================
export const CO2_EMISSION_FACTORS = {
  hsfo: 3.114, // Heavy Fuel Oil
  vlsfo: 3.151, // Very Low Sulphur Fuel Oil
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
 * Determine EU ETS voyage coverage based on origin/destination UNLOC codes
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
 * Determine EU ETS coverage based on ECA distances of origin and destination legs.
 * 
 * Rules:
 * - Origin ECA > 0 && Destination ECA > 0 → EU→EU = 100%
 * - Origin ECA = 0 && Destination ECA > 0 → Non-EU→EU = 50%
 * - Origin ECA > 0 && Destination ECA = 0 → EU→Non-EU = 50%
 * - Origin ECA = 0 && Destination ECA = 0 → Non-EU→Non-EU = 0%
 * 
 * @param originEcaDistance ECA distance (NM) of the leg arriving at the origin port
 * @param destinationEcaDistance ECA distance (NM) of the leg arriving at the destination port (current leg)
 */
export function getEtsCoverageFromEca(
  originEcaDistance: number,
  destinationEcaDistance: number
): { type: EtsVoyageType; percentage: number } {
  const originIsEu = originEcaDistance > 0;
  const destinationIsEu = destinationEcaDistance > 0;

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
// FUEL EU MARITIME COMPLIANCE (Sheet-Aligned)
// ===========================================

// Static FuelEU cost per ton of bunker ($/ton) — from sheet
export const FUEL_EU_COST_PER_TON: Record<string, number> = {
  hsfo: 71.64,
  vlsfo: 61.94,
  lsmgo: 45.37,
};

export interface FuelEuFuelDetail {
  ghgShortfall: number;   // kg CO₂/t fuel
  costPerTon: number;     // (ghgShortfall / 1000) × co2CostRate  ($/t fuel)
  euQuantity: number;     // EU-covered fuel quantity (t)
  cost: number;           // euQuantity × costPerTon ($)
}

export interface FuelEuResult {
  co2CostRate: number;
  rewardFactor: number;
  fuels: {
    hsfo: FuelEuFuelDetail;
    vlsfo: FuelEuFuelDetail;
    lsmgo: FuelEuFuelDetail;
  };
  totalPenalty: number;
  costPerTon: { hsfo: number; vlsfo: number; lsmgo: number };
}

/**
 * Calculate FuelEU Maritime cost using sheet-aligned logic.
 *
 * Step 1: cost_per_ton = (ghg_shortfall / 1000) × co2_cost_rate
 * Step 2: fuelEU_cost  = EU_fuel × cost_per_ton
 * Step 3: total        = sum of all fuel costs
 */
export function calculateFuelEuPenalty(
  euCoveredFuel: { hsfo: number; vlsfo: number; lsmgo: number },
  rewardFactor: number = 1.0,
  _year?: number
): FuelEuResult {
  const calc = (fuelType: 'hsfo' | 'vlsfo' | 'lsmgo'): FuelEuFuelDetail => {
    const ghgShortfall = FUEL_EU_GHG_SHORTFALL[fuelType];
    const costPerTon = (ghgShortfall / 1000) * FUEL_EU_CO2_COST_RATE;
    const qty = euCoveredFuel[fuelType];
    return { ghgShortfall, costPerTon, euQuantity: qty, cost: qty * costPerTon };
  };

  const hsfo = calc('hsfo');
  const vlsfo = calc('vlsfo');
  const lsmgo = calc('lsmgo');

  return {
    co2CostRate: FUEL_EU_CO2_COST_RATE,
    rewardFactor,
    fuels: { hsfo, vlsfo, lsmgo },
    totalPenalty: hsfo.cost + vlsfo.cost + lsmgo.cost,
    costPerTon: { hsfo: hsfo.costPerTon, vlsfo: vlsfo.costPerTon, lsmgo: lsmgo.costPerTon },
  };
}
