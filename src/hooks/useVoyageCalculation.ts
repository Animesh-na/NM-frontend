import { useMemo } from "react";
import type { VesselData } from "@/data/vessels";

// Types for voyage calculation inputs
export interface SequenceRow {
  id: number;
  operation: string;
  port: string;
  portUnloc: string;
  cgo: string;
  distance: number; // nm
  ecaDistance: number; // nm in ECA zones
  portDays: number; // days in port
  quantity: number; // mt or cbm
  expDa: number; // port costs in USD
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

  // Bunker consumption
  hsfoConsumption: number;
  vlsfoConsumption: number;
  lsmgoConsumption: number;
  totalBunkerCost: number;

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

  // Environmental metrics
  totalCo2: number;
  co2Laden: number;
  co2Ballast: number;
  efoi: number; // gCO2/tnm
  afrCii: number; // gCO2/dwt-nm
  ciiRating: string;
}

// CO2 emission factors (tonnes CO2 per tonne fuel)
const CO2_FACTORS = {
  hsfo: 3.114,
  vlsfo: 3.151,
  lsmgo: 3.206,
};

// CII rating thresholds (simplified for bulk/tanker)
const getCiiRating = (cii: number): string => {
  if (cii <= 5.5) return "A";
  if (cii <= 6.5) return "B";
  if (cii <= 7.5) return "C";
  if (cii <= 8.5) return "D";
  return "E";
};

export function useVoyageCalculation(inputs: VoyageInputs): VoyageResults {
  return useMemo(() => {
    const { vessel, sequence, cargo, bunker, hireRate, misc, extraTime } = inputs;

    // 1. Calculate distances and identify leg types
    let totalDistance = 0;
    let totalEcaDistance = 0;
    let ballastDistance = 0;
    let ladenDistance = 0;
    let totalPortDays = 0;
    let portCosts = 0;
    let isLaden = false;
    
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

      // Track operation types for port consumption
      if (leg.operation === "load" || leg.operation === "loading") {
        loadingDays += leg.portDays || 0;
        isLaden = true;
      } else if (leg.operation === "disch" || leg.operation === "discharging") {
        dischargingDays += leg.portDays || 0;
        isLaden = false;
      } else if (leg.operation === "waiting" || leg.operation === "idle") {
        idleDays += leg.portDays || 0;
      } else if (leg.operation === "bunkering") {
        bunkeringDays += leg.portDays || 0;
      }

      if (isLaden) {
        ladenDistance += leg.distance || 0;
      } else {
        ballastDistance += leg.distance || 0;
      }
    });

    // 2. Calculate extra time (from misc section) - convert to days
    const extraSeaDays = extraTime?.atSeaDays || 0;
    const extraPortDays = extraTime?.idlePortDays || 0;
    const extraCanalDays = (extraTime?.canal1Days || 0) + (extraTime?.canal2Days || 0);

    // 3. Calculate sea time based on vessel speed
    const ballastSpeed = vessel.consumption.speed.ecoBallast || 12;
    const ladenSpeed = vessel.consumption.speed.ecoLaden || 12;

    const seaDaysBallast = ballastSpeed > 0 ? ballastDistance / (ballastSpeed * 24) : 0;
    const seaDaysLaden = ladenSpeed > 0 ? ladenDistance / (ladenSpeed * 24) : 0;
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
    
    // --- Sea Consumption (Ballast + Laden) ---
    // HSFO: Sea consumption using ballast/laden rates from vessel matrix
    const hsfoSeaBallast = seaDaysBallast * (profile.hsfo.ballast || vessel.consumption.hsfo.ecoBallast || 0);
    const hsfoSeaLaden = seaDaysLaden * (profile.hsfo.laden || vessel.consumption.hsfo.ecoLaden || 0);
    const hsfoSeaExtra = extraSeaDays * (profile.hsfo.laden || vessel.consumption.hsfo.ecoLaden || 0); // Extra sea uses laden rate
    const hsfoSeaTotal = (hsfoSeaBallast + hsfoSeaLaden + hsfoSeaExtra) * rewardFactor;
    
    // VLSFO: Sea consumption
    const vlsfoSeaBallast = seaDaysBallast * (profile.vlsfo.ballast || vessel.consumption.vlsfo.ecoBallast || 0);
    const vlsfoSeaLaden = seaDaysLaden * (profile.vlsfo.laden || vessel.consumption.vlsfo.ecoLaden || 0);
    const vlsfoSeaExtra = extraSeaDays * (profile.vlsfo.laden || vessel.consumption.vlsfo.ecoLaden || 0);
    const vlsfoSeaTotal = (vlsfoSeaBallast + vlsfoSeaLaden + vlsfoSeaExtra) * rewardFactor;
    
    // LSMGO: Sea consumption
    const lsmgoSeaBallast = seaDaysBallast * (profile.lsmgo.ballast || vessel.consumption.lsmgo.ecoBallast || 0);
    const lsmgoSeaLaden = seaDaysLaden * (profile.lsmgo.laden || vessel.consumption.lsmgo.ecoLaden || 0);
    const lsmgoSeaExtra = extraSeaDays * (profile.lsmgo.laden || vessel.consumption.lsmgo.ecoLaden || 0);
    const lsmgoSeaTotal = (lsmgoSeaBallast + lsmgoSeaLaden + lsmgoSeaExtra) * rewardFactor;
    
    // --- Port Consumption (by operation type) ---
    // Loading consumption
    const hsfoLoading = loadingDays * (profile.hsfo.load || 0);
    const vlsfoLoading = loadingDays * (profile.vlsfo.load || 0);
    const lsmgoLoading = loadingDays * (profile.lsmgo.load || profile.ae.load || 0);
    
    // Discharging consumption  
    const hsfoDischarging = dischargingDays * (profile.hsfo.discharge || 0);
    const vlsfoDischarging = dischargingDays * (profile.vlsfo.discharge || 0);
    const lsmgoDischarging = dischargingDays * (profile.lsmgo.discharge || profile.ae.discharge || 0);
    
    // Idle/Waiting consumption (including bunkering operations)
    const idleAndBunkeringDays = idleDays + bunkeringDays + extraPortDays;
    const hsfoIdle = idleAndBunkeringDays * (profile.hsfo.idle || 0);
    const vlsfoIdle = idleAndBunkeringDays * (profile.vlsfo.idle || 0);
    const lsmgoIdle = idleAndBunkeringDays * (profile.lsmgo.idle || profile.ae.idle || 0);
    
    // Canal consumption
    const totalCanalDays = canalDays + extraCanalDays;
    const hsfoCanal = totalCanalDays * (profile.hsfo.canal || 0);
    const vlsfoCanal = totalCanalDays * (profile.vlsfo.canal || 0);
    const lsmgoCanal = totalCanalDays * (profile.lsmgo.canal || profile.ae.canal || 0);
    
    // --- AE (Auxiliary Engine) Consumption for port/idle ---
    // AE runs during port operations for electricity
    const aePortConsumption = (
      loadingDays * (profile.ae.load || 0) +
      dischargingDays * (profile.ae.discharge || 0) +
      idleAndBunkeringDays * (profile.ae.idle || 0) +
      totalCanalDays * (profile.ae.canal || 0)
    );
    
    // Add AE consumption to LSMGO (AE typically runs on MGO)
    const lsmgoAeTotal = aePortConsumption;
    
    // --- Total Fuel Consumption ---
    const hsfoConsumption = hsfoSeaTotal + hsfoLoading + hsfoDischarging + hsfoIdle + hsfoCanal;
    const vlsfoConsumption = vlsfoSeaTotal + vlsfoLoading + vlsfoDischarging + vlsfoIdle + vlsfoCanal;
    const lsmgoConsumption = lsmgoSeaTotal + lsmgoLoading + lsmgoDischarging + lsmgoIdle + lsmgoCanal + lsmgoAeTotal;

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

    // 8. Total voyage costs (including misc and canal costs)
    const totalVoyageCosts = totalBunkerCost + portCosts + miscCosts + canalCosts;
    const hireCost = hireRate * totalVoyageDays;
    const voyageCostInclHire = totalVoyageCosts + hireCost;
    const voyageCostExclHire = totalVoyageCosts;

    // 9. Profitability calculations
    const grossProfit = netFreight - voyageCostExclHire + cargo.demurrage - cargo.despatch;
    const netProfit = grossProfit;
    const pAndL = grossProfit - hireCost;

    // TCE = (Net Freight - Voyage Costs) / Voyage Days
    const tce = totalVoyageDays > 0 ? grossProfit / totalVoyageDays : 0;
    
    // NTCE = TCE after TC commission
    const tcCommissionAmount = tce * (cargo.tcCommission / 100);
    const ntce = tce - tcCommissionAmount;
    
    // GTCE = (Gross Freight - Voyage Costs) / Voyage Days
    const gtce = totalVoyageDays > 0 
      ? (grossFreight - voyageCostExclHire) / totalVoyageDays 
      : 0;

    // 10. Environmental calculations
    const co2Hsfo = hsfoConsumption * CO2_FACTORS.hsfo;
    const co2Vlsfo = vlsfoConsumption * CO2_FACTORS.vlsfo;
    const co2Lsmgo = lsmgoConsumption * CO2_FACTORS.lsmgo;
    const totalCo2 = co2Hsfo + co2Vlsfo + co2Lsmgo;

    // Split CO2 proportionally
    const co2Ballast = totalSeaDays > 0 ? totalCo2 * (seaDaysBallast / totalSeaDays) : 0;
    const co2Laden = totalSeaDays > 0 ? totalCo2 * (seaDaysLaden / totalSeaDays) : 0;

    // EFOI = gCO2 / (cargo quantity * laden distance) - grams CO2 per tonne-nautical mile
    const efoi = cargo.quantity > 0 && ladenDistance > 0
      ? (totalCo2 * 1000000) / (cargo.quantity * ladenDistance)
      : 0;

    // AFR/CII = gCO2 / (DWT * total distance)
    const afrCii = vessel.dwt > 0 && totalDistance > 0
      ? (totalCo2 * 1000000) / (vessel.dwt * totalDistance)
      : 0;

    const ciiRating = getCiiRating(afrCii);

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
      hsfoConsumption,
      vlsfoConsumption,
      lsmgoConsumption,
      totalBunkerCost,
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
      totalCo2,
      co2Laden,
      co2Ballast,
      efoi,
      afrCii,
      ciiRating,
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
