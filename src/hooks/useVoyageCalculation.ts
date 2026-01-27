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
}

export interface VoyageInputs {
  vessel: VesselData;
  sequence: SequenceRow[];
  cargo: CargoData;
  bunker: BunkerData;
  hireRate: number; // $/day for TC equivalent comparison
}

export interface VoyageResults {
  // Time calculations
  totalDistance: number;
  totalEcaDistance: number;
  seaDaysBallast: number;
  seaDaysLaden: number;
  totalSeaDays: number;
  totalPortDays: number;
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
    const { vessel, sequence, cargo, bunker, hireRate } = inputs;

    // 1. Calculate distances and identify leg types
    let totalDistance = 0;
    let totalEcaDistance = 0;
    let ballastDistance = 0;
    let ladenDistance = 0;
    let totalPortDays = 0;
    let portCosts = 0;
    let isLaden = false;

    sequence.forEach((leg) => {
      totalDistance += leg.distance || 0;
      totalEcaDistance += leg.ecaDistance || 0;
      totalPortDays += leg.portDays || 0;
      portCosts += leg.expDa || 0;

      // Check for loading operations (handles both old "load" and new "loading")
      if (leg.operation === "load" || leg.operation === "loading") {
        isLaden = true;
      }

      if (isLaden) {
        ladenDistance += leg.distance || 0;
      } else {
        ballastDistance += leg.distance || 0;
      }

      // Check for discharge operations (handles both old "disch" and new "discharging")
      if (leg.operation === "disch" || leg.operation === "discharging") {
        isLaden = false;
      }
    });

    // 2. Calculate sea time based on vessel speed
    const ballastSpeed = vessel.consumption.speed.ecoBallast || 12;
    const ladenSpeed = vessel.consumption.speed.ecoLaden || 12;

    const seaDaysBallast = ballastSpeed > 0 ? ballastDistance / (ballastSpeed * 24) : 0;
    const seaDaysLaden = ladenSpeed > 0 ? ladenDistance / (ladenSpeed * 24) : 0;
    const totalSeaDays = seaDaysBallast + seaDaysLaden;
    const totalVoyageDays = totalSeaDays + totalPortDays;

    // 3. Calculate bunker consumption
    // At sea consumption (per day)
    const ballastVlsfo = vessel.consumption.vlsfo.ecoBallast || 0;
    const ladenVlsfo = vessel.consumption.vlsfo.ecoLaden || 0;
    const ballastLsmgo = vessel.consumption.lsmgo.ecoBallast || 0;
    const ladenLsmgo = vessel.consumption.lsmgo.ecoLaden || 0;
    const ballastHsfo = vessel.consumption.hsfo.ecoBallast || 0;
    const ladenHsfo = vessel.consumption.hsfo.ecoLaden || 0;

    // Port consumption (AE)
    const portAeConsumption = vessel.consumption.ae.ecoLaden || 0.5;

    // Total consumption
    const hsfoConsumption = (seaDaysBallast * ballastHsfo) + (seaDaysLaden * ladenHsfo);
    const vlsfoConsumption = (seaDaysBallast * ballastVlsfo) + (seaDaysLaden * ladenVlsfo);
    const lsmgoConsumption = 
      (seaDaysBallast * ballastLsmgo) + 
      (seaDaysLaden * ladenLsmgo) + 
      (totalPortDays * portAeConsumption);

    // Bunker costs
    const hsfoCost = hsfoConsumption * bunker.hsfo.price;
    const vlsfoCost = vlsfoConsumption * bunker.vlsfo.price;
    const lsmgoCost = lsmgoConsumption * bunker.lsmgo.price;
    const totalBunkerCost = hsfoCost + vlsfoCost + lsmgoCost;

    // 4. Calculate freight and revenue
    let grossFreight = 0;
    if (cargo.rateType === "lumpsum") {
      grossFreight = cargo.rate;
    } else {
      grossFreight = cargo.rate * cargo.quantity;
    }

    const voyageCommission = grossFreight * (cargo.voyageCommission / 100);
    const netFreight = grossFreight - voyageCommission;

    // 5. Total voyage costs
    const totalVoyageCosts = totalBunkerCost + portCosts;
    const hireCost = hireRate * totalVoyageDays;
    const voyageCostInclHire = totalVoyageCosts + hireCost;
    const voyageCostExclHire = totalVoyageCosts;

    // 6. Profitability calculations
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

    // 7. Environmental calculations
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
      totalVoyageDays,
      hsfoConsumption,
      vlsfoConsumption,
      lsmgoConsumption,
      totalBunkerCost,
      grossFreight,
      voyageCommission,
      netFreight,
      portCosts,
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
