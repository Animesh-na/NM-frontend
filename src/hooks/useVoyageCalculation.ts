import { useMemo } from "react";
import type { VesselData } from "@/data/vessels";
import {
  CO2_EMISSION_FACTORS,
  calculateCo2Emissions,
  calculateEtsCost,
  calculateCiiRating,
  calculateEfoi,
  getEtsVoyageCoverage,
  getEtsPhaseInPercentage,
  isEuPort,
  validateEmissionInputs,
  type EtsResult,
  type CiiResult,
  type Co2BreakdownByFuel,
} from "@/utils/emissionCalculations";

// Types for voyage calculation inputs
export interface SequenceRow {
  id: number;
  operation: string;
  port: string;
  portUnloc: string;
  cgo: string;
  distance: number; // nm (non-ECA)
  ecaDistance: number; // nm in ECA zones
  portDays: number; // days in port (total including working + turn + extra)
  quantity: number; // mt or cbm
  expDa: number; // port costs in USD
  // Sea margin adjusted times (calculated in VoyageContext)
  seaTime?: number; // Total sea time WITH sea margin applied
  ecaTime?: number; // ECA sea time WITH sea margin applied
  nonEcaTime?: number; // Non-ECA sea time WITH sea margin applied
  baseSeaTime?: number; // Base time without margin
  seaMarginTime?: number; // Extra time from sea margin
  seaMargin?: number; // Sea margin percentage
  // Port time breakdown
  turnTimeHours?: number; // Turn time in hours
  extraTimeHours?: number; // Extra time in hours
}

export interface CargoData {
  rate: number; // $/mt or lumpsum
  rateType: "mt" | "lumpsum";
  quantity: number;
  voyageCommission: number; // percentage
  tcCommission: number; // percentage
  demurrage: number;
  despatch: number;
}

export interface BunkerData {
  hsfo: { price: number; robStart: number };
  vlsfo: { price: number; robStart: number };
  lsmgo: { price: number; robStart: number };
  co2Price: number;
  rewardFactor?: number; // Multiplier for wind-assisted propulsion (default 1.0)
}

// Extra time data for calculation
export interface ExtraTimeData {
  canal1Days: number; // Extra canal 1 time in days
  canal2Days: number; // Extra canal 2 time in days
  idlePortDays: number; // Extra idle port time in days
  atSeaDays: number; // Extra at sea time in days
  atSeaSpeedContext: string; // EV or FV for fuel consumption
}

// Misc costs data
export interface MiscCostsData {
  miscCost: number;
  extraFees: number;
  extraInsurance: number;
  canalCost1: number;
  canalCost2: number;
}

export interface VoyageInputs {
  vessel: VesselData;
  sequence: SequenceRow[];
  cargo: CargoData;
  bunker: BunkerData;
  hireRate: number; // $/day for TC equivalent comparison
  misc?: MiscCostsData;
  extraTime?: ExtraTimeData;
}

export interface VoyageResults {
  // Time calculations
  totalDistance: number;
  totalEcaDistance: number;
  seaDaysBallast: number;
  seaDaysLaden: number;
  totalSeaDays: number;
  totalPortDays: number;
  extraSeaDays: number;
  extraPortDays: number;
  extraCanalDays: number;
  totalVoyageDays: number;
  // Sea margin breakdown for transparency
  baseSeaTime: number; // Total base sea time before margin
  seaMarginTime: number; // Total extra time from sea margin

  // Bunker consumption
  hsfoConsumption: number;
  vlsfoConsumption: number;
  lsmgoConsumption: number;
  totalBunkerCost: number;
  
  // ECA-based fuel breakdown
  nonEcaFuel: { hsfo: number; vlsfo: number; lsmgo: number; total: number };
  ecaFuel: { hsfo: number; vlsfo: number; lsmgo: number; total: number };
  nonEcaCo2: number;
  ecaCo2: number;
  nonEcaDistance: number;

  // Revenue & costs
  grossFreight: number;
  voyageCommission: number;
  netFreight: number;
  portCosts: number;
  miscCosts: number;
  canalCosts: number;
  totalVoyageCosts: number;
  hireCost: number;
  voyageCostInclHire: number;
  voyageCostExclHire: number;

  // Profitability metrics
  grossProfit: number;
  netProfit: number;
  tce: number; // Time Charter Equivalent ($/day)
  ntce: number; // Net TCE
  gtce: number; // Gross TCE
  pAndL: number; // Profit & Loss

  // Environmental metrics - Enhanced
  totalCo2: number;
  co2Laden: number;
  co2Ballast: number;
  co2ByFuel: Co2BreakdownByFuel;
  efoi: number; // gCO2/tnm
  afrCii: number; // gCO2/dwt-nm (Actual CII)
  ciiRating: string;
  ciiResult: CiiResult;
  
  // EU ETS metrics
  etsResult: EtsResult;
  etsCost: number;
  chargeableCo2: number;
  etsVoyageCoverage: number;
  etsPhaseIn: number;
  
  // Validation
  emissionWarnings: string[];
  emissionErrors: string[];
  
  // Laden distance (for EFOI)
  ladenDistance: number;
}

export function useVoyageCalculation(inputs: VoyageInputs): VoyageResults {
  return useMemo(() => {
    const { vessel, sequence, cargo, bunker, hireRate, misc, extraTime } = inputs;

    // 1. Calculate distances, times, and identify leg types
    // IMPORTANT: Use pre-calculated seaTime from sequence which includes sea margin
    let totalDistance = 0;
    let totalEcaDistance = 0;
    let ballastDistance = 0;
    let ladenDistance = 0;
    let totalPortDays = 0;
    let portCosts = 0;
    let isLaden = false;
    
    // Sea time tracking - use pre-calculated values with sea margin
    let seaDaysBallast = 0;
    let seaDaysLaden = 0;
    let totalBaseSeaTime = 0;
    let totalSeaMarginTime = 0;
    
    // ECA vs Non-ECA sea time tracking
    let ecaSeaDaysBallast = 0;
    let ecaSeaDaysLaden = 0;
    let nonEcaSeaDaysBallast = 0;
    let nonEcaSeaDaysLaden = 0;
    
    // Track operation-specific time for detailed consumption
    let loadingDays = 0;
    let dischargingDays = 0;
    let idleDays = 0;
    let bunkeringDays = 0;
    let canalDays = 0;

    sequence.forEach((leg) => {
      totalDistance += leg.distance || 0;
      totalEcaDistance += leg.ecaDistance || 0;
      totalPortDays += leg.portDays || 0;
      portCosts += leg.expDa || 0;
      
      // Track base sea time and margin time for transparency
      totalBaseSeaTime += leg.baseSeaTime || 0;
      totalSeaMarginTime += leg.seaMarginTime || 0;

      // Use pre-calculated seaTime (includes sea margin) for ballast/laden split
      // IMPORTANT: Assign sea time BEFORE updating isLaden flag
      // The ship sails to a loading port in BALLAST, and sails from loading to discharge in LADEN
      const legSeaTime = leg.seaTime || 0;
      const legEcaTime = leg.ecaTime || 0;
      const legNonEcaTime = leg.nonEcaTime || (legSeaTime - legEcaTime);
      
      if (isLaden) {
        ladenDistance += leg.distance || 0;
        seaDaysLaden += legSeaTime;
        ecaSeaDaysLaden += legEcaTime;
        nonEcaSeaDaysLaden += legNonEcaTime;
      } else {
        ballastDistance += leg.distance || 0;
        seaDaysBallast += legSeaTime;
        ecaSeaDaysBallast += legEcaTime;
        nonEcaSeaDaysBallast += legNonEcaTime;
      }

      // Track operation types for port consumption
      // Update isLaden AFTER sea time assignment so the leg TO loading is ballast, leg FROM loading is laden
      // For load/discharge: split into working days (load/discharge rates) and idle days (turn+extra time at idle rates)
      const turnExtraDays = ((leg.turnTimeHours || 0) + (leg.extraTimeHours || 0)) / 24;
      const workingDays = Math.max(0, (leg.portDays || 0) - turnExtraDays);
      
      if (leg.operation === "load" || leg.operation === "loading") {
        loadingDays += workingDays;
        idleDays += turnExtraDays; // Turn time + extra time at idle consumption
        isLaden = true;
      } else if (leg.operation === "disch" || leg.operation === "discharging") {
        dischargingDays += workingDays;
        idleDays += turnExtraDays; // Turn time + extra time at idle consumption
        isLaden = false;
      } else if (leg.operation === "waiting" || leg.operation === "idle") {
        idleDays += leg.portDays || 0;
      } else if (leg.operation === "bunkering") {
        bunkeringDays += leg.portDays || 0;
      } else if (leg.portDays > 0) {
        idleDays += leg.portDays || 0;
      }
    });

    // 2. Calculate extra time (from misc section) - convert to days
    const extraSeaDays = extraTime?.atSeaDays || 0;
    const extraPortDays = extraTime?.idlePortDays || 0;
    const extraCanalDays = (extraTime?.canal1Days || 0) + (extraTime?.canal2Days || 0);

    // 3. Total sea days = sum of all leg sea times (already includes sea margin) + extra sea days
    const totalSeaDays = seaDaysBallast + seaDaysLaden + extraSeaDays;
    
    // Total voyage days includes all extra time
    const totalVoyageDays = totalSeaDays + totalPortDays + extraPortDays + extraCanalDays;

    // ============================================
    // 4. BUNKER CONSUMPTION CALCULATION (AXS Marine Model)
    // Consumption = Daily Rate × Time × Reward Factor
    // ============================================
    
    // Get the appropriate consumption profile based on vessel speed profile
    const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
    
    // Reward factor adjusts consumption (wind-assisted propulsion, etc.)
    const rewardFactor = bunker?.rewardFactor ?? 1.0;
    
    // --- Sea Consumption (Ballast + Laden) split by ECA / Non-ECA ---
    // Non-ECA: uses HSFO/VLSFO at normal rates
    // ECA: fuel switches to LSMGO (MGO) for compliance; HSFO/VLSFO = 0 in ECA
    
    const totalEcaSeaDays = ecaSeaDaysBallast + ecaSeaDaysLaden;
    const totalNonEcaSeaDays = nonEcaSeaDaysBallast + nonEcaSeaDaysLaden;
    
    // --- Non-ECA Sea Consumption (HSFO/VLSFO used normally) ---
    const hsfoSeaBallastNonEca = nonEcaSeaDaysBallast * (profile.hsfo.ballast || vessel.consumption.hsfo.ecoBallast || 0);
    const hsfoSeaLadenNonEca = nonEcaSeaDaysLaden * (profile.hsfo.laden || vessel.consumption.hsfo.ecoLaden || 0);
    const hsfoSeaExtraNonEca = extraSeaDays * (profile.hsfo.laden || vessel.consumption.hsfo.ecoLaden || 0);
    const hsfoSeaTotal = (hsfoSeaBallastNonEca + hsfoSeaLadenNonEca + hsfoSeaExtraNonEca) * rewardFactor;
    
    const vlsfoSeaBallastNonEca = nonEcaSeaDaysBallast * (profile.vlsfo.ballast || vessel.consumption.vlsfo.ecoBallast || 0);
    const vlsfoSeaLadenNonEca = nonEcaSeaDaysLaden * (profile.vlsfo.laden || vessel.consumption.vlsfo.ecoLaden || 0);
    const vlsfoSeaExtraNonEca = extraSeaDays * (profile.vlsfo.laden || vessel.consumption.vlsfo.ecoLaden || 0);
    const vlsfoSeaTotal = (vlsfoSeaBallastNonEca + vlsfoSeaLadenNonEca + vlsfoSeaExtraNonEca) * rewardFactor;
    
    // Non-ECA LSMGO: ZERO — LSMGO is only used inside ECA zones
    const lsmgoSeaNonEcaTotal = 0;
    
    // --- ECA Sea Consumption (LSMGO only — uses LSMGO matrix rate directly) ---
    // In ECA zones, HSFO/VLSFO = 0, vessel burns LSMGO at the rate defined in the matrix
    const ecaLsmgoBallastRate = profile.lsmgo.ballast || 0;
    const ecaLsmgoLadenRate = profile.lsmgo.laden || 0;
    const lsmgoEcaFromHsfoVlsfo = (
      ecaSeaDaysBallast * ecaLsmgoBallastRate + 
      ecaSeaDaysLaden * ecaLsmgoLadenRate
    ) * rewardFactor;
    
    // Total LSMGO sea consumption = ECA only (no LSMGO outside ECA)
    const lsmgoSeaTotal = lsmgoEcaFromHsfoVlsfo;
    
    // --- Port Consumption (by operation type) ---
    // Loading consumption (ME fuel only — AE is added separately below)
    const hsfoLoading = loadingDays * (profile.hsfo.load || 0);
    const vlsfoLoading = loadingDays * (profile.vlsfo.load || 0);
    const lsmgoLoading = loadingDays * (profile.lsmgo.load || 0);
    
    // Discharging consumption (ME fuel only — AE is added separately below)
    const hsfoDischarging = dischargingDays * (profile.hsfo.discharge || 0);
    const vlsfoDischarging = dischargingDays * (profile.vlsfo.discharge || 0);
    const lsmgoDischarging = dischargingDays * (profile.lsmgo.discharge || 0);
    
    // Idle/Waiting consumption (including bunkering operations)
    const idleAndBunkeringDays = idleDays + bunkeringDays + extraPortDays;
    const hsfoIdle = idleAndBunkeringDays * (profile.hsfo.idle || 0);
    const vlsfoIdle = idleAndBunkeringDays * (profile.vlsfo.idle || 0);
    const lsmgoIdle = idleAndBunkeringDays * (profile.lsmgo.idle || 0);
    
    // Canal consumption
    const totalCanalDays = canalDays + extraCanalDays;
    const hsfoCanal = totalCanalDays * (profile.hsfo.canal || 0);
    const vlsfoCanal = totalCanalDays * (profile.vlsfo.canal || 0);
    const lsmgoCanal = totalCanalDays * (profile.lsmgo.canal || 0);
    
    // --- AE (Auxiliary Engine) Consumption ---
    // AE runs on LSMGO — only counted for ECA sea time (no LSMGO outside ECA)
    const aeSeaConsumption = (
      ecaSeaDaysBallast * (profile.ae.ballast || 0) +
      ecaSeaDaysLaden * (profile.ae.laden || 0)
    ) * rewardFactor;
    
    // No AE LSMGO for canal or port (outside ECA)
    const aeCanalConsumption = 0;
    const aePortConsumption = 0;
    
    // Total AE contribution to LSMGO = ECA sea only
    const lsmgoAeTotal = aeSeaConsumption;
    
    // --- Total Fuel Consumption ---
    const hsfoConsumption = hsfoSeaTotal + hsfoLoading + hsfoDischarging + hsfoIdle + hsfoCanal;
    const vlsfoConsumption = vlsfoSeaTotal + vlsfoLoading + vlsfoDischarging + vlsfoIdle + vlsfoCanal;
    const lsmgoConsumption = lsmgoSeaTotal + lsmgoLoading + lsmgoDischarging + lsmgoIdle + lsmgoCanal + lsmgoAeTotal;

    // --- ECA vs Non-ECA Fuel Breakdown ---
    const nonEcaFuel = {
      hsfo: hsfoSeaTotal,
      vlsfo: vlsfoSeaTotal,
      lsmgo: lsmgoSeaNonEcaTotal,
      total: hsfoSeaTotal + vlsfoSeaTotal + lsmgoSeaNonEcaTotal,
    };
    const ecaFuel = {
      hsfo: 0, // No HSFO in ECA
      vlsfo: 0, // No VLSFO in ECA
      lsmgo: lsmgoEcaFromHsfoVlsfo,
      total: lsmgoEcaFromHsfoVlsfo,
    };
    const nonEcaDistance = totalDistance - totalEcaDistance;

    // ============================================
    // 5. BUNKER COST CALCULATION (Price × Consumption)
    // ============================================
    
    // Get fuel prices from bunker section
    const hsfoPrice = bunker.hsfo.price || 0;
    const vlsfoPrice = bunker.vlsfo.price || 0;
    const lsmgoPrice = bunker.lsmgo.price || 0;
    
    // Calculate costs: Consumption × Price
    const hsfoCost = hsfoConsumption * hsfoPrice;
    const vlsfoCost = vlsfoConsumption * vlsfoPrice;
    const lsmgoCost = lsmgoConsumption * lsmgoPrice;
    const totalBunkerCost = hsfoCost + vlsfoCost + lsmgoCost;

    // 6. Calculate freight and revenue
    let grossFreight = 0;
    if (cargo.rateType === "lumpsum") {
      grossFreight = cargo.rate;
    } else {
      grossFreight = cargo.rate * cargo.quantity;
    }

    const voyageCommission = grossFreight * (cargo.voyageCommission / 100);
    const netFreight = grossFreight - voyageCommission;

    // 7. Calculate misc costs
    const miscCosts = (misc?.miscCost || 0) + (misc?.extraFees || 0) + (misc?.extraInsurance || 0);
    const canalCosts = (misc?.canalCost1 || 0) + (misc?.canalCost2 || 0);

    // 8. Total voyage costs (Bunker + Port + Canal + Misc — NO commissions mixed in)
    const totalVoyageCosts = totalBunkerCost + portCosts + miscCosts + canalCosts;
    
    // 9. Hire calculations — TC Commission reduces hire ONLY, never freight
    const grossHireRate = hireRate;
    const tcCommissionPct = cargo.tcCommission / 100;
    const netHireRate = grossHireRate * (1 - tcCommissionPct);
    const hireCost = grossHireRate * totalVoyageDays;
    const netHireCost = netHireRate * totalVoyageDays;
    const tcCommissionAmount = hireCost * tcCommissionPct;
    const voyageCostInclHire = totalVoyageCosts + hireCost;
    const voyageCostExclHire = totalVoyageCosts;

    // 10. Profitability calculations
    // Voyage Result = Net Freight − Voyage Costs (commissions NOT in voyage costs)
    const voyageResult = netFreight - totalVoyageCosts + cargo.demurrage - cargo.despatch;
    const grossProfit = voyageResult;
    const netProfit = grossProfit;
    
    // P&L = Voyage Result − Hire Cost
    const pAndL = voyageResult - hireCost;

    // NTCE = (Net Freight - Voyage Expenses Excl Hire) / Total Days
    const ntce = totalVoyageDays > 0 
      ? (netFreight - totalVoyageCosts) / totalVoyageDays 
      : 0;
    
    // GTCE = NTCE / (1 - TC Commission Rate)
    const gtce = tcCommissionPct < 1
      ? ntce / (1 - tcCommissionPct) 
      : 0;
    
    // TCE = GTCE (industry standard, used interchangeably)
    const tce = gtce;

    // 10. Environmental calculations using emission module
    const fuelConsumption = {
      hsfo: hsfoConsumption,
      vlsfo: vlsfoConsumption,
      lsmgo: lsmgoConsumption,
    };
    
    // Calculate CO2 emissions by fuel type
    const co2ByFuel = calculateCo2Emissions(fuelConsumption);
    const totalCo2 = co2ByFuel.total;

    // Calculate ECA vs Non-ECA CO2 separately
    const nonEcaCo2Calc = calculateCo2Emissions(nonEcaFuel);
    const ecaCo2Calc = calculateCo2Emissions(ecaFuel);
    const nonEcaCo2 = nonEcaCo2Calc.total;
    const ecaCo2 = ecaCo2Calc.total;

    // Split CO2 proportionally between ballast and laden
    const co2Ballast = totalSeaDays > 0 ? totalCo2 * (seaDaysBallast / totalSeaDays) : 0;
    const co2Laden = totalSeaDays > 0 ? totalCo2 * (seaDaysLaden / totalSeaDays) : 0;

    // Calculate EFOI using the module
    const efoiResult = calculateEfoi(totalCo2, cargo.quantity, ladenDistance);
    const efoi = efoiResult.efoi;

    // Build voyage legs for ETS calculation
    const voyageLegs: Array<{ originUnloc: string; destinationUnloc: string; co2: number }> = [];
    let previousPort = '';
    let legIndex = 0;
    
    sequence.forEach((leg) => {
      if (leg.portUnloc && previousPort) {
        // Calculate CO2 proportion for this leg based on sea time
        const legSeaTime = leg.seaTime || 0;
        const legCo2 = totalSeaDays > 0 ? totalCo2 * (legSeaTime / totalSeaDays) : 0;
        
        voyageLegs.push({
          originUnloc: previousPort,
          destinationUnloc: leg.portUnloc,
          co2: legCo2,
        });
        legIndex++;
      }
      if (leg.portUnloc) {
        previousPort = leg.portUnloc;
      }
    });

    // Calculate EU ETS cost
    const etsResult = calculateEtsCost({
      totalCo2,
      voyageLegs,
      co2Price: bunker.co2Price || 0,
    });

    // Calculate CII rating using IMO methodology
    const ciiResult = calculateCiiRating({
      totalCo2,
      dwt: vessel.dwt,
      distanceTravelled: totalDistance,
      shipType: vessel.type || 'bulk_carrier',
    });
    
    const afrCii = ciiResult.actualCii;
    const ciiRating = ciiResult.rating;

    // Validate emission inputs
    const validation = validateEmissionInputs(
      fuelConsumption,
      vessel.dwt,
      totalDistance,
      cargo.quantity,
      bunker.co2Price
    );

    return {
      totalDistance,
      totalEcaDistance,
      seaDaysBallast,
      seaDaysLaden,
      totalSeaDays,
      totalPortDays,
      extraSeaDays,
      extraPortDays,
      extraCanalDays,
      totalVoyageDays,
      baseSeaTime: totalBaseSeaTime,
      seaMarginTime: totalSeaMarginTime,
      hsfoConsumption,
      vlsfoConsumption,
      lsmgoConsumption,
      totalBunkerCost,
      // ECA-based breakdown
      nonEcaFuel,
      ecaFuel,
      nonEcaCo2,
      ecaCo2,
      nonEcaDistance,
      grossFreight,
      voyageCommission,
      netFreight,
      portCosts,
      miscCosts,
      canalCosts,
      totalVoyageCosts,
      hireCost,
      voyageCostInclHire,
      voyageCostExclHire,
      grossProfit,
      netProfit,
      tce,
      ntce,
      gtce,
      pAndL,
      // Enhanced environmental metrics
      totalCo2,
      co2Laden,
      co2Ballast,
      co2ByFuel,
      efoi,
      afrCii,
      ciiRating,
      ciiResult,
      // EU ETS metrics
      etsResult,
      etsCost: etsResult.etsCost,
      chargeableCo2: etsResult.chargeableCo2,
      etsVoyageCoverage: etsResult.etsVoyageCoverage,
      etsPhaseIn: etsResult.phaseInPercentage,
      // Validation
      emissionWarnings: validation.warnings,
      emissionErrors: validation.errors,
      // Additional
      ladenDistance,
    };
  }, [inputs]);
}

// Helper to parse distance string like "370 & EL" or "1555"
export function parseDistanceString(str: string): { distance: number; ecaDistance: number } {
  if (!str) return { distance: 0, ecaDistance: 0 };
  
  const cleaned = str.replace(/[^\d.\s&]/gi, "");
  const parts = cleaned.split("&").map(s => parseFloat(s.trim()) || 0);
  
  return {
    distance: parts[0] || 0,
    ecaDistance: parts[1] || 0,
  };
}

// Helper to parse port time like "5.42 d" or "0d"  
export function parsePortDays(str: string): number {
  if (!str) return 0;
  const match = str.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}
