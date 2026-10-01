import { useMemo } from "react";
import type { VesselData } from "@/data/vessels";
import {
  CO2_EMISSION_FACTORS,
  calculateCo2Emissions,
  calculateEtsCost,
  calculateCiiRating,
  calculateEfoi,
  getEtsVoyageCoverage,
  getEtsCoverageFromEca,
  getEtsPhaseInPercentage,
  isEuPort,
  validateEmissionInputs,
  calculateFuelEuPenalty,
  type EtsResult,
  type CiiResult,
  type Co2BreakdownByFuel,
  type FuelEuResult,
} from "@/utils/emissionCalculations";
import { vlog, vlogBegin, vlogEnd, exposeVoyageDebug } from "@/utils/voyageLogger";
import { buildFuelPricing, effectivePrice } from "@/utils/bunkerPricing";
import { computeFifoCoverage, orderBunkerLots } from "@/utils/fuelBreakdown";
import {
  getUkEtsSeaCoverage,
  getUkEtsPortCoverage,
  getUkEtsPhaseIn,
  ukCo2FromFuel,
  emptyUkEtsResult,
  type UkEtsResult,
  type UkEtsLegDetail,
  type UkZone,
} from "@/utils/ukEtsCalculations";
import { contextFuel } from "@/utils/speedContext";

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
  // Raw port inputs required by the Go engine to independently derive port time.
  productivity?: number;
  terms?: string;
  coefficientFactor?: number;
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
  // Terms coefficient (SHINC = 1, SSHEX = 1.5555, …) — the >1 portion of the
  // working time is non-working and burns at the idle rate.
  termsFactor?: number;
  // Port fuel type selection
  portFuelType?: "hsfo" | "vlsfo" | "lsmgo";
  // Per-leg speed/fuel contexts (e.g. "EV", "FH", "EL")
  distanceSpeedContext?: string;
  ecaDistanceSpeedContext?: string;
  // EU/EEA flag from port API
  isEuEea?: boolean;
  // UK ETS flags from port API (independent from EU ETS)
  ukEts?: boolean;
  ukZone?: UkZone;
  // Row type: "open" | "port" | "repos"  (used for repositioning detection in per-cargo allocation)
  type?: string;
  // Cargo assignment for per-cargo gross rate & route-bounded cost allocation
  assignedCargoIds?: number[];
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
  /** @deprecated legacy single carbon price — no longer used. */
  co2Price?: number;
  rewardFactor?: number; // Multiplier for wind-assisted propulsion (default 1.0)
  euEtsPrice?: number;
  ukEtsPrice?: number;
  // Fuel accounting (average / FIFO / ignore BOB) + bunkering port lots
  fuelMode?: "average" | "fifo";
  ignoreBOB?: boolean;
  portBunkering?: Array<{
    portUnloc?: string;
    portName?: string;
    hsfo: { quantity: number; price: number };
    vlsfo: { quantity: number; price: number };
    lsmgo: { quantity: number; price: number };
  }>;
}

// Extra time data for calculation
export interface ExtraTimeData {
  canal1Days: number; // Canal transit time in days
  /** @deprecated legacy fields kept optional for older saved sheets — always ignored. */
  canal2Days?: number;
  idlePortDays?: number;
  atSeaDays?: number;
  atSeaSpeedContext?: string;
  canalFuel?: "hsfo" | "vlsfo" | "lsmgo"; // ME fuel burned during canal transit
}

// Misc costs data
export interface MiscCostsData {
  miscCost: number;
  extraFees: number;
  extraInsurance: number;
  canalCost1: number;
  /** @deprecated no longer used — kept optional for older saved sheets. */
  canalCost2?: number;
}

export interface VoyageInputs {
  vessel: VesselData;
  sequence: SequenceRow[];
  cargo: CargoData;
  bunker: BunkerData;
  hireRate: number; // $/day for TC equivalent comparison
  netBB?: number; // Net Ballast Bonus (lumpsum added to hire)
  misc?: MiscCostsData;
  extraTime?: ExtraTimeData;
  applyEuaImpact?: boolean;
  applyFuelEuImpact?: boolean;
  applyUkEtsImpact?: boolean;
  /** Optional per-cargo entries used for per-cargo gross-rate breakdown. */
  cargos?: Array<{
    id: number;
    rate: number;
    rateType: "mt" | "lumpsum";
    voyageCommission: number;
    tcCommission: number;
    /** Per-cargo laytime results (from Cargo section operational overrides). */
    demurrage?: number;
    despatch?: number;
    extraDays?: number;
  }>;
}

// Per-leg ETS detail for UI breakdown table
export interface EtsLegDetail {
  legIndex: number;
  isPortOnly: boolean;
  originPort: string;
  originUnloc: string;
  originIsEu: boolean;
  destPort: string;
  destUnloc: string;
  destIsEu: boolean;
  coveragePct: number; // 0, 50, or 100
  portCoveragePct: number; // 0 or 100
  coverageLabel: string; // e.g. "NonEU → EU: 50%"
  // Total fuel consumed on this leg (sea + port at destination)
  seaVlsfo: number;
  seaLsmgo: number;
  seaHsfo: number;
  portVlsfo: number;
  portLsmgo: number;
  portHsfo: number;
  // EU-chargeable fuel
  chargeableVlsfo: number;
  chargeableLsmgo: number;
  chargeableHsfo: number;
  // CO₂ from chargeable fuel
  chargeableCo2: number;
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
  /** Effective $/mt actually used by the engine per fuel (average / FIFO / ignore-BOB). */
  effectiveFuelPrices: { hsfo: number; vlsfo: number; lsmgo: number };
  
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
  
  // Leg-by-leg ETS breakdown
  etsLegDetails: EtsLegDetail[];

  // UK ETS metrics (independent from EU ETS)
  ukEtsResult: UkEtsResult;
  ukEtsCost: number;
  ukChargeableCo2: number;
  ukEtsVoyageCoverage: number;
  ukEtsPhaseIn: number;
  ukEtsFreightImpact: number;
  
  // Validation
  emissionWarnings: string[];
  emissionErrors: string[];
  
  // Laden distance (for EFOI)
  ladenDistance: number;
  // EEOI transport work Σ(leg distance incl. ECA × cargo on board), t·nm
  transportWork?: number;
  
  // Gross Rate: Net Rate / (1 − voyage commission %) where Net Rate = freight rate × (1 − voy comm) − total voyage P&L / cargo qty
  grossRate: number;


  // EU-covered fuel quantities (for EU ETS & FuelEU)
  euCoveredFuel: { hsfo: number; vlsfo: number; lsmgo: number };
  
  // Total CO2 cost (all CO2 × CO2 price)
  totalCo2Cost: number;
  
  // EUA CO2 cost (chargeable CO2 × CO2 price) — same as etsCost
  euaCo2Cost: number;
  
  // EUA Freight Impact (ETS cost / cargo quantity)
  euaFreightImpact: number;
  
  // FuelEU Maritime penalties
  fuelEuResult: FuelEuResult;
  fuelEuTotalPenalty: number;
  
  // FuelEU Freight Impact (FuelEU penalty / cargo quantity)
  fuelEuFreightImpact: number;

  // Per-cargo breakdown (route-bounded allocation). Empty when no explicit cargo mapping is set.
  perCargoBreakdown: PerCargoBreakdown[];
  // Costs not attributed to any cargo (repositioning legs + out-of-window legs).
  repositioningCost: number;
}

export interface PerCargoBreakdown {
  cargoId: number;
  cargoLabel: string; // "#1", "#2", ...
  loadedQty: number;
  grossFreight: number;
  /** Voyage commission $ on this cargo's own gross freight. */
  voyageCommissionAmount: number;
  /** gross freight − own voyage commission (never blended with other cargoes). */
  netFreight: number;
  share: number; // 0..1 share of total grossFreight (or qty if all lumpsum)

  allocatedBunker: number;
  allocatedPortCosts: number;
  allocatedVoyageCosts: number; // bunker + port (route-bounded)
  allocatedHire: number; // hire over the route window
  grossRate: number; // Net Rate / (1 − voy comm%), where Net Rate = own freight rate × (1 − voy comm%) − total voyage P&L / own qty
  routeStartIdx: number;
  routeEndIdx: number;
  // ── Ton-mile allocation (spec: Multi-Cargo Gross Rate) ──
  /** Per-cargo laytime outcome */
  extraDays: number;
  demurrage: number;
  despatch: number;
  cargoDistanceNm: number;
  cargoTonMiles: number;
  tonMileShare: number; // 0..1 share of total ton miles
  allocatedDirectPortCost: number;
  allocatedSharedPortCost: number;
  allocatedMiscCost: number;
  allocatedCanalCost: number;
  allocatedRepositioningCost: number;
  allocatedTotalCost: number;
  netRate: number; // allocatedTotalCost / qty
  voyageCommissionPct: number;
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
    // EEOI transport work: Σ (leg distance incl. ECA × cargo on board) per leg
    let transportWork = 0;
    let ladenDistanceInclEca = 0;
    let totalPortDays = 0;
    let portCosts = 0;
    // Ballast/laden is determined by running cargo on board (load adds, discharge subtracts)
    
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
    // Same sea days, but bucketed by the fuel the leg's speed context selects.
    // Scrubber vessels may burn HSFO inside ECA zones too.
    const seaDaysByFuel: Record<"hsfo" | "vlsfo" | "lsmgo", { ballast: number; laden: number }> = {
      hsfo: { ballast: 0, laden: 0 },
      vlsfo: { ballast: 0, laden: 0 },
      lsmgo: { ballast: 0, laden: 0 },
    };
    
    // Track operation-specific time for detailed consumption
    // Split by port fuel type selection
    let loadingDays_hsfo = 0, loadingDays_vlsfo = 0, loadingDays_lsmgo = 0;
    let dischargingDays_hsfo = 0, dischargingDays_vlsfo = 0, dischargingDays_lsmgo = 0;
    let idleDays_hsfo = 0, idleDays_vlsfo = 0, idleDays_lsmgo = 0;
    let bunkeringDays_hsfo = 0, bunkeringDays_vlsfo = 0, bunkeringDays_lsmgo = 0;
    let loadingDays = 0;
    let dischargingDays = 0;
    let idleDays = 0;
    let bunkeringDays = 0;
    let canalDays = 0;
    // Passing (pssg) ports burn at the CANAL rate — their turn + extra time only
    let canalDays_hsfo = 0, canalDays_vlsfo = 0, canalDays_lsmgo = 0;
    const hasScrubber = vessel.hasScrubber === true;
    let cargoOnBoard = 0;

    vlogBegin(`Voyage Calculation — ${vessel.name} (${vessel.speedProfile})`);
    vlog(`[Input] Vessel: ${vessel.name}, DWT: ${vessel.dwt}, Speed Profile: ${vessel.speedProfile}`);
    vlog(`[Input] Hire Rate: $${hireRate}/day`);
    vlog(`[Input] Cargo: rate=${cargo.rate} ${cargo.rateType}, qty=${cargo.quantity}, voyComm=${cargo.voyageCommission}%, tcComm=${cargo.tcCommission}%`);
    vlog(`[Input] Bunker Prices: HSFO=$${bunker.hsfo.price}, VLSFO=$${bunker.vlsfo.price}, LSMGO=$${bunker.lsmgo.price}, EU ETS=$${bunker.euEtsPrice || 0}`);
    vlog(`[Input] Reward Factor: ${bunker?.rewardFactor ?? 1.0}`);

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
      
      const operation = (leg.operation || "").toLowerCase();
      const legQuantity = Math.max(0, leg.quantity || 0);

      // Determine ballast/laden using running cargo on board (before current port operation)
      const legIsLaden = cargoOnBoard > 0;
      
      vlog(`\n[Step 1] Leg ${leg.id} - "${leg.operation}" at ${leg.port}:
    distance=${leg.distance} nm, ecaDistance=${leg.ecaDistance} nm
    portDays=${leg.portDays} d, expDa=$${leg.expDa}
    seaTime=${legSeaTime} d (total with margin)
    ecaTime=${legEcaTime} d, nonEcaTime=${legNonEcaTime} d
    cargoOnBoardBefore=${cargoOnBoard} mt, portQty=${legQuantity} mt → assigned as ${legIsLaden ? 'LADEN' : 'BALLAST'} leg`);
      if (legIsLaden) {
        ladenDistance += leg.distance || 0;
        const legTotalDist = (leg.distance || 0) + (leg.ecaDistance || 0);
        ladenDistanceInclEca += legTotalDist;
        transportWork += legTotalDist * cargoOnBoard;
        seaDaysLaden += legSeaTime;
        ecaSeaDaysLaden += legEcaTime;
        nonEcaSeaDaysLaden += legNonEcaTime;
      } else {
        ballastDistance += leg.distance || 0;
        seaDaysBallast += legSeaTime;
        ecaSeaDaysBallast += legEcaTime;
        nonEcaSeaDaysBallast += legNonEcaTime;
      }

      {
        const side = legIsLaden ? "laden" : "ballast";
        const nonEcaFuel = contextFuel(leg.distanceSpeedContext, hasScrubber ? "hsfo" : "vlsfo");
        const ecaFuel = contextFuel(leg.ecaDistanceSpeedContext, "lsmgo");
        seaDaysByFuel[nonEcaFuel][side] += legNonEcaTime;
        seaDaysByFuel[ecaFuel][side] += legEcaTime;
      }

      // Port time breakdown
      const turnExtraDays = ((leg.turnTimeHours || 0) + (leg.extraTimeHours || 0)) / 24;
      const legTermsFactor = (leg.termsFactor || 0) > 1 ? (leg.termsFactor as number) : 1;
      const grossWorkingDays = Math.max(0, (leg.portDays || 0) - turnExtraDays);
      // Only the pure cargo-work portion (terms factor 1.0) burns at the
      // load/discharge rate; the terms surcharge + turn + extra burn at idle.
      const workingDays = grossWorkingDays / legTermsFactor;
      const termsIdleDays = grossWorkingDays - workingDays;
      const portIdleDays = termsIdleDays + turnExtraDays;

      vlog(`    Port breakdown: turnTimeHrs=${leg.turnTimeHours || 0}, extraTimeHrs=${leg.extraTimeHours || 0} → turnExtraDays=${turnExtraDays}, termsFactor=${legTermsFactor}, workingDays(pure)=${workingDays}, idleDays(terms+turn+extra)=${portIdleDays}`);
      
      // Determine port fuel type for this leg
      const legPortFuel = leg.portFuelType || (hasScrubber ? "hsfo" : "vlsfo");
      
      const addPortDays = (working: number, idle: number) => {
        if (legPortFuel === "hsfo") {
          loadingDays_hsfo += working; idleDays_hsfo += idle;
        } else if (legPortFuel === "vlsfo") {
          loadingDays_vlsfo += working; idleDays_vlsfo += idle;
        } else {
          loadingDays_lsmgo += working; idleDays_lsmgo += idle;
        }
      };
      const addDischDays = (working: number, idle: number) => {
        if (legPortFuel === "hsfo") {
          dischargingDays_hsfo += working; idleDays_hsfo += idle;
        } else if (legPortFuel === "vlsfo") {
          dischargingDays_vlsfo += working; idleDays_vlsfo += idle;
        } else {
          dischargingDays_lsmgo += working; idleDays_lsmgo += idle;
        }
      };
      const addIdleDays = (days: number) => {
        if (legPortFuel === "hsfo") idleDays_hsfo += days;
        else if (legPortFuel === "vlsfo") idleDays_vlsfo += days;
        else idleDays_lsmgo += days;
      };
      const addBunkeringDays = (days: number) => {
        if (legPortFuel === "hsfo") bunkeringDays_hsfo += days;
        else if (legPortFuel === "vlsfo") bunkeringDays_vlsfo += days;
        else bunkeringDays_lsmgo += days;
      };
      
      if (operation === "load" || operation === "loading") {
        loadingDays += workingDays;
        idleDays += portIdleDays;
        addPortDays(workingDays, portIdleDays);
        vlog(`    → LOADING (${legPortFuel}): loadRate days=${workingDays}, idleRate days=${portIdleDays}`);
      } else if (operation === "disch" || operation === "discharging") {
        dischargingDays += workingDays;
        idleDays += portIdleDays;
        addDischDays(workingDays, portIdleDays);
        vlog(`    → DISCHARGING (${legPortFuel}): dischRate days=${workingDays}, idleRate days=${portIdleDays}`);
      } else if (operation === "pssg" || operation === "passage") {
        // Passing port: turn time + extra time burn at the CANAL rate (ME + AE)
        const days = leg.portDays || 0;
        canalDays += days;
        if (legPortFuel === "hsfo") canalDays_hsfo += days;
        else if (legPortFuel === "vlsfo") canalDays_vlsfo += days;
        else canalDays_lsmgo += days;
        vlog(`    → PASSING (${legPortFuel}): ${days} days added to canalDays (canal rate)`);
      } else if (operation === "waiting" || operation === "idle") {
        idleDays += leg.portDays || 0;
        addIdleDays(leg.portDays || 0);
        vlog(`    → IDLE/WAITING (${legPortFuel}): ${leg.portDays} days added to idleDays`);
      } else if (operation === "bunkering") {
        bunkeringDays += leg.portDays || 0;
        addBunkeringDays(leg.portDays || 0);
        vlog(`    → BUNKERING (${legPortFuel}): ${leg.portDays} days added to bunkeringDays`);
      } else if (leg.portDays > 0) {
        idleDays += leg.portDays || 0;
        addIdleDays(leg.portDays || 0);
        vlog(`    → OTHER (${legPortFuel}) with port time: ${leg.portDays} days added to idleDays`);
      }

      if (operation === "load" || operation === "loading") {
        cargoOnBoard += legQuantity;
      } else if (operation === "disch" || operation === "discharging") {
        cargoOnBoard = Math.max(0, cargoOnBoard - legQuantity);
      }

      vlog(`    cargoOnBoardAfter=${cargoOnBoard} mt`);
    });

    vlog(`\n[Step 1 Summary] After sequence loop:
    totalDistance=${totalDistance} nm, totalEcaDistance=${totalEcaDistance} nm
    seaDaysBallast=${seaDaysBallast.toFixed(4)} d, seaDaysLaden=${seaDaysLaden.toFixed(4)} d
    ecaSeaDaysBallast=${ecaSeaDaysBallast.toFixed(4)}, ecaSeaDaysLaden=${ecaSeaDaysLaden.toFixed(4)}
    nonEcaSeaDaysBallast=${nonEcaSeaDaysBallast.toFixed(4)}, nonEcaSeaDaysLaden=${nonEcaSeaDaysLaden.toFixed(4)}
    totalPortDays=${totalPortDays.toFixed(4)} d, portCosts=$${portCosts}
    loadingDays=${loadingDays.toFixed(4)}, dischargingDays=${dischargingDays.toFixed(4)}, idleDays=${idleDays.toFixed(4)}, bunkeringDays=${bunkeringDays.toFixed(4)}
    ballastDistance=${ballastDistance} nm, ladenDistance=${ladenDistance} nm
    totalBaseSeaTime=${totalBaseSeaTime.toFixed(4)}, totalSeaMarginTime=${totalSeaMarginTime.toFixed(4)}`);

    // 2. Calculate extra time (from misc section) - convert to days
    // Legacy extra sea / idle-port entries were removed from the UI — always 0.
    const extraSeaDays = 0;
    const extraPortDays = 0;
    const extraCanalDays = extraTime?.canal1Days || 0;

    // 3. Total sea days = sum of all leg sea times (already includes sea margin) + extra sea days
    const totalSeaDays = seaDaysBallast + seaDaysLaden + extraSeaDays;
    
    // Total voyage days includes all extra time
    const totalVoyageDays = totalSeaDays + totalPortDays + extraPortDays + extraCanalDays;

    vlog(`\n[Step 2-3] Extra & Total Time:
    extraSeaDays=${extraSeaDays}, extraPortDays=${extraPortDays}, extraCanalDays=${extraCanalDays}
    totalSeaDays = seaDaysBallast(${seaDaysBallast.toFixed(4)}) + seaDaysLaden(${seaDaysLaden.toFixed(4)}) + extraSea(${extraSeaDays}) = ${totalSeaDays.toFixed(4)}
    totalVoyageDays = totalSea(${totalSeaDays.toFixed(4)}) + totalPort(${totalPortDays.toFixed(4)}) + extraPort(${extraPortDays}) + extraCanal(${extraCanalDays}) = ${totalVoyageDays.toFixed(4)}`);

    // ============================================
    // 4. BUNKER CONSUMPTION CALCULATION (AXS Marine Model)
    // Consumption = Daily Rate × Time × Reward Factor
    // ============================================
    
    // Get the appropriate consumption profile based on vessel speed profile
    const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
    
    // Wind-assisted propulsion reward factor impacts FuelEU GHG intensity ONLY.
    // Fuel consumption is never scaled by it.
    const rewardFactor = 1.0;
    
    // --- Sea Consumption (Ballast + Laden) split by ECA / Non-ECA ---
    // SCRUBBER LOGIC:
    // - No scrubber → VLSFO only (HSFO = 0) outside ECA, LSMGO in ECA
    // - Scrubber fitted → HSFO only (VLSFO = 0) outside ECA, LSMGO in ECA
    
    const totalEcaSeaDays = ecaSeaDaysBallast + ecaSeaDaysLaden;
    const totalNonEcaSeaDays = nonEcaSeaDaysBallast + nonEcaSeaDaysLaden;
    // hasScrubber moved above sequence loop
    
    // --- Sea Consumption by fuel, driven by each leg's speed/fuel context ---
    // Scrubber vessels may select HSFO for ECA legs as well (EH / FH).
    const hsfoSeaBallastNonEca = seaDaysByFuel.hsfo.ballast * (profile.hsfo.ballast || vessel.consumption.hsfo.ecoBallast || 0);
    const hsfoSeaLadenNonEca = seaDaysByFuel.hsfo.laden * (profile.hsfo.laden || vessel.consumption.hsfo.ecoLaden || 0);
    const hsfoSeaExtraNonEca = hasScrubber ? extraSeaDays * (profile.hsfo.laden || vessel.consumption.hsfo.ecoLaden || 0) : 0;
    const hsfoSeaTotal = (hsfoSeaBallastNonEca + hsfoSeaLadenNonEca + hsfoSeaExtraNonEca) * rewardFactor;
    
    const vlsfoSeaBallastNonEca = seaDaysByFuel.vlsfo.ballast * (profile.vlsfo.ballast || vessel.consumption.vlsfo.ecoBallast || 0);
    const vlsfoSeaLadenNonEca = seaDaysByFuel.vlsfo.laden * (profile.vlsfo.laden || vessel.consumption.vlsfo.ecoLaden || 0);
    const vlsfoSeaExtraNonEca = !hasScrubber ? extraSeaDays * (profile.vlsfo.laden || vessel.consumption.vlsfo.ecoLaden || 0) : 0;
    const vlsfoSeaTotal = (vlsfoSeaBallastNonEca + vlsfoSeaLadenNonEca + vlsfoSeaExtraNonEca) * rewardFactor;
    
    // Non-ECA LSMGO: ZERO — LSMGO is only used inside ECA zones
    const lsmgoSeaNonEcaTotal = 0;
    
    // --- LSMGO sea consumption (legs whose context selects LSMGO — normally ECA) ---
    const ecaLsmgoBallastRate = profile.lsmgo.ballast || 0;
    const ecaLsmgoLadenRate = profile.lsmgo.laden || 0;
    const lsmgoEcaFromHsfoVlsfo = (
      seaDaysByFuel.lsmgo.ballast * ecaLsmgoBallastRate +
      seaDaysByFuel.lsmgo.laden * ecaLsmgoLadenRate
    ) * rewardFactor;
    
    // Total LSMGO sea consumption = ECA only (no LSMGO outside ECA)
    const lsmgoSeaTotal = lsmgoEcaFromHsfoVlsfo;
    
    // --- Port Consumption (by operation type) ---
    // Port fuel is determined PER LEG by the portFuelType selection
    // Only the selected fuel type is consumed for that leg's port operations
    
    // Extra port days use default fuel (scrubber → HSFO, else VLSFO)
    const extraPortFuel = hasScrubber ? "hsfo" : "vlsfo";
    const extraIdleDays_hsfo = extraPortFuel === "hsfo" ? extraPortDays : 0;
    const extraIdleDays_vlsfo = extraPortFuel === "vlsfo" ? extraPortDays : 0;
    const extraIdleDays_lsmgo = 0;
    
    // Loading consumption — only the fuel type selected for that port
    const hsfoLoading = loadingDays_hsfo * (profile.hsfo.load || 0);
    const vlsfoLoading = loadingDays_vlsfo * (profile.vlsfo.load || 0);
    const lsmgoLoading = loadingDays_lsmgo * (profile.lsmgo.load || 0);
    
    // Discharging consumption
    const hsfoDischarging = dischargingDays_hsfo * (profile.hsfo.discharge || 0);
    const vlsfoDischarging = dischargingDays_vlsfo * (profile.vlsfo.discharge || 0);
    const lsmgoDischarging = dischargingDays_lsmgo * (profile.lsmgo.discharge || 0);
    
    // Idle/Waiting consumption (including bunkering + extra port days)
    const idleAndBunkeringDays = idleDays + bunkeringDays + extraPortDays;
    const hsfoIdle = (idleDays_hsfo + bunkeringDays_hsfo + extraIdleDays_hsfo) * (profile.hsfo.idle || 0);
    const vlsfoIdle = (idleDays_vlsfo + bunkeringDays_vlsfo + extraIdleDays_vlsfo) * (profile.vlsfo.idle || 0);
    const lsmgoIdle = (idleDays_lsmgo + bunkeringDays_lsmgo + extraIdleDays_lsmgo) * (profile.lsmgo.idle || 0);
    
    // Canal consumption — misc canal time uses the selected canal fuel;
    // passing (pssg) ports use their own P.Fuel at the canal rate.
    const totalCanalDays = canalDays + extraCanalDays;
    const canalFuel = extraTime?.canalFuel || (hasScrubber ? "hsfo" : "vlsfo");
    const miscHsfoCanal = canalFuel === "hsfo" && hasScrubber ? extraCanalDays * (profile.hsfo.canal || 0) : 0;
    const miscVlsfoCanal = canalFuel === "vlsfo" || (canalFuel === "hsfo" && !hasScrubber) ? extraCanalDays * (profile.vlsfo.canal || 0) : 0;
    const miscLsmgoCanal = canalFuel === "lsmgo" ? extraCanalDays * (profile.lsmgo.canal || 0) : 0;
    const hsfoCanal = miscHsfoCanal + (hasScrubber ? canalDays_hsfo * (profile.hsfo.canal || 0) : 0);
    const vlsfoCanal = miscVlsfoCanal + (canalDays_vlsfo + (hasScrubber ? 0 : canalDays_hsfo)) * (profile.vlsfo.canal || 0);
    const lsmgoCanal = miscLsmgoCanal + canalDays_lsmgo * (profile.lsmgo.canal || 0);
    
    // --- AE (Auxiliary Engine) Consumption ---
    // If scrubber fitted → use aeScrubber rates; otherwise → use ae rates
    // AE runs on LSMGO across ALL operations including canal transit
    const aeProfile = hasScrubber ? profile.aeScrubber : profile.ae;
    
    // Sea: ballast + laden (both ECA and non-ECA) + extra sea days
    const aeSeaConsumption = (
      (nonEcaSeaDaysBallast + ecaSeaDaysBallast) * (aeProfile.ballast || 0) +
      (nonEcaSeaDaysLaden + ecaSeaDaysLaden) * (aeProfile.laden || 0) +
      extraSeaDays * (aeProfile.laden || 0)
    ) * rewardFactor;
    
    // Port: AE runs during loading, discharging, and idle
    const aePortConsumption = 
      loadingDays * (aeProfile.load || 0) +
      dischargingDays * (aeProfile.discharge || 0) +
      idleAndBunkeringDays * (aeProfile.idle || 0);
    
    // Canal: AE also runs during canal transit at the canal AE rate
    const aeCanalConsumption = totalCanalDays * (aeProfile.canal || 0);
    
    // Total AE contribution to LSMGO = sea + port + canal
    const lsmgoAeTotal = aeSeaConsumption + aePortConsumption + aeCanalConsumption;
    
    // --- Total Fuel Consumption ---
    const hsfoConsumption = hsfoSeaTotal + hsfoLoading + hsfoDischarging + hsfoIdle + hsfoCanal;
    const vlsfoConsumption = vlsfoSeaTotal + vlsfoLoading + vlsfoDischarging + vlsfoIdle + vlsfoCanal;
    const lsmgoConsumption = lsmgoSeaTotal + lsmgoLoading + lsmgoDischarging + lsmgoIdle + lsmgoCanal + lsmgoAeTotal;

    vlog(`\n[Step 4] BUNKER CONSUMPTION (profile: ${vessel.speedProfile}, rewardFactor: ${rewardFactor}):
    --- Consumption Rates (TPD) ---
    HSFO: ballast=${profile.hsfo.ballast}, laden=${profile.hsfo.laden}, load=${profile.hsfo.load}, disch=${profile.hsfo.discharge}, idle=${profile.hsfo.idle}, canal=${profile.hsfo.canal}
    VLSFO: ballast=${profile.vlsfo.ballast}, laden=${profile.vlsfo.laden}, load=${profile.vlsfo.load}, disch=${profile.vlsfo.discharge}, idle=${profile.vlsfo.idle}, canal=${profile.vlsfo.canal}
    LSMGO: ballast=${profile.lsmgo.ballast}, laden=${profile.lsmgo.laden}, load=${profile.lsmgo.load}, disch=${profile.lsmgo.discharge}, idle=${profile.lsmgo.idle}, canal=${profile.lsmgo.canal}
    AE: ballast=${profile.ae.ballast}, laden=${profile.ae.laden}, load=${profile.ae.load}, disch=${profile.ae.discharge}, idle=${profile.ae.idle}
    
    --- Non-ECA Sea (days: ballast=${nonEcaSeaDaysBallast}, laden=${nonEcaSeaDaysLaden}) ---
    HSFO Sea: ballast=${hsfoSeaBallastNonEca} + laden=${hsfoSeaLadenNonEca} + extra=${hsfoSeaExtraNonEca} × RF${rewardFactor} = ${hsfoSeaTotal} mt
    VLSFO Sea: ballast=${vlsfoSeaBallastNonEca} + laden=${vlsfoSeaLadenNonEca} + extra=${vlsfoSeaExtraNonEca} × RF${rewardFactor} = ${vlsfoSeaTotal} mt
    
    --- ECA Sea (days: ballast=${ecaSeaDaysBallast}, laden=${ecaSeaDaysLaden}) ---
    LSMGO ECA: ballast(${ecaSeaDaysBallast}×${ecaLsmgoBallastRate}) + laden(${ecaSeaDaysLaden}×${ecaLsmgoLadenRate}) × RF${rewardFactor} = ${lsmgoEcaFromHsfoVlsfo} mt
    
    --- Port Consumption (loading=${loadingDays}d, disch=${dischargingDays}d, idle+bunk=${idleAndBunkeringDays}d) ---
    HSFO Port: load=${hsfoLoading} + disch=${hsfoDischarging} + idle=${hsfoIdle} = ${hsfoLoading+hsfoDischarging+hsfoIdle} mt
    VLSFO Port: load=${vlsfoLoading} + disch=${vlsfoDischarging} + idle=${vlsfoIdle} = ${vlsfoLoading+vlsfoDischarging+vlsfoIdle} mt
    LSMGO Port: load=${lsmgoLoading} + disch=${lsmgoDischarging} + idle=${lsmgoIdle} = ${lsmgoLoading+lsmgoDischarging+lsmgoIdle} mt
    
    --- Canal (days=${totalCanalDays}) ---
    HSFO Canal=${hsfoCanal}, VLSFO Canal=${vlsfoCanal}, LSMGO Canal=${lsmgoCanal}
    
    --- AE Consumption (always LSMGO) ---
    AE Sea: (ballast(${nonEcaSeaDaysBallast+ecaSeaDaysBallast}×${profile.ae.ballast}) + laden(${nonEcaSeaDaysLaden+ecaSeaDaysLaden}×${profile.ae.laden}) + extra(${extraSeaDays}×${profile.ae.laden})) × RF${rewardFactor} = ${aeSeaConsumption} mt
    AE Port: load(${loadingDays}×${profile.ae.load}) + disch(${dischargingDays}×${profile.ae.discharge}) + idle(${idleAndBunkeringDays}×${profile.ae.idle}) = ${aePortConsumption} mt
    AE Canal: ${totalCanalDays}×${aeProfile.canal} = ${aeCanalConsumption} mt
    AE Total = ${lsmgoAeTotal} mt
    
    --- TOTAL CONSUMPTION ---
    HSFO: sea(${hsfoSeaTotal}) + load(${hsfoLoading}) + disch(${hsfoDischarging}) + idle(${hsfoIdle}) + canal(${hsfoCanal}) = ${hsfoConsumption} mt
    VLSFO: sea(${vlsfoSeaTotal}) + load(${vlsfoLoading}) + disch(${vlsfoDischarging}) + idle(${vlsfoIdle}) + canal(${vlsfoCanal}) = ${vlsfoConsumption} mt
    LSMGO: sea(${lsmgoSeaTotal}) + load(${lsmgoLoading}) + disch(${lsmgoDischarging}) + idle(${lsmgoIdle}) + canal(${lsmgoCanal}) + AE(${lsmgoAeTotal}) = ${lsmgoConsumption} mt`);

    // --- ECA vs Non-ECA Fuel Breakdown ---
    const nonEcaFuel = {
      hsfo: hsfoSeaTotal,
      vlsfo: vlsfoSeaTotal,
      lsmgo: lsmgoSeaNonEcaTotal,
      total: hsfoSeaTotal + vlsfoSeaTotal + lsmgoSeaNonEcaTotal,
    };
    const ecaFuel = {
      hsfo: 0,
      vlsfo: 0,
      lsmgo: lsmgoEcaFromHsfoVlsfo,
      total: lsmgoEcaFromHsfoVlsfo,
    };
    // totalDistance = sum of V column (non-ECA), totalEcaDistance = sum of L column (ECA)
    // nonEcaDistance IS totalDistance since V column already represents non-ECA distances
    const nonEcaDistance = totalDistance;

    // ============================================
    // 5. BUNKER COST CALCULATION (Price × Consumption)
    // ============================================
    
    // Effective price depends on the fuel accounting mode:
    //  - average  : weighted average of BOB + all bunkering port prices
    //  - fifo     : BOB burnt first, then each bunkering port price in order
    //  - ignoreBOB: BOB excluded, only bunkering port prices used
    // FIFO uses consumption coverage: how much fuel is burnt before each
    // re-bunkering, so the effective $/t is weighted by price AND consumption.
    // Lots must be aligned to the order the bunkering calls occur in the voyage
    // (the UI list order can differ), otherwise FIFO coverage lands on the wrong
    // price lot and the effective $/mt collapses onto the BOB price.
    const orderedLots = orderBunkerLots(
      sequence,
      (bunker.portBunkering as Array<{ portUnloc?: string; portName?: string }> | undefined) || [],
    );
    const pricingBunker = { ...bunker, portBunkering: orderedLots } as typeof bunker;
    const fifoCoverage = computeFifoCoverage(sequence, vessel, orderedLots, rewardFactor);
    const hsfoPrice = effectivePrice(buildFuelPricing(pricingBunker, "hsfo", fifoCoverage.hsfo), hsfoConsumption);
    const vlsfoPrice = effectivePrice(buildFuelPricing(pricingBunker, "vlsfo", fifoCoverage.vlsfo), vlsfoConsumption);
    const lsmgoPrice = effectivePrice(buildFuelPricing(pricingBunker, "lsmgo", fifoCoverage.lsmgo), lsmgoConsumption);

    const hsfoCost = hsfoConsumption * hsfoPrice;
    const vlsfoCost = vlsfoConsumption * vlsfoPrice;
    const lsmgoCost = lsmgoConsumption * lsmgoPrice;
    const totalBunkerCost = hsfoCost + vlsfoCost + lsmgoCost;

    vlog(`\n[Step 5] BUNKER COSTS:
    HSFO: ${hsfoConsumption} mt × $${hsfoPrice} = $${hsfoCost}
    VLSFO: ${vlsfoConsumption} mt × $${vlsfoPrice} = $${vlsfoCost}
    LSMGO: ${lsmgoConsumption} mt × $${lsmgoPrice} = $${lsmgoCost}
    Total Bunker Cost = $${totalBunkerCost}`);

    // 6. Calculate freight and revenue
    // Each cargo is treated INDIVIDUALLY (no blended rate / averaged commission):
    //   gross_x = rate_x × qty_x  (+ demurrage_x − despatch_x)
    //   net_x   = gross_x × (1 − voyageCommission_x%)
    // Totals are the plain sums of the per-cargo values.
    const cargoEntriesForFreight = inputs.cargos || [];

    // Loaded quantity per cargo, resolved from the sequence load rows.
    const loadRowIdxs: number[] = [];
    sequence.forEach((leg, idx) => {
      if ((leg.operation || "").toLowerCase().startsWith("load")) loadRowIdxs.push(idx);
    });
    const explicitMapping = sequence.some((leg) => (leg.assignedCargoIds || []).length > 0);
    const qtyForCargo = (cargoId: number, ci: number): number => {
      if (cargoEntriesForFreight.length === 1)
        return loadRowIdxs.reduce((s, i) => s + (sequence[i]?.quantity || 0), 0);
      if (explicitMapping)
        return loadRowIdxs
          .filter((i) => (sequence[i].assignedCargoIds || []).includes(cargoId))
          .reduce((s, i) => s + (sequence[i]?.quantity || 0), 0);
      return ci < loadRowIdxs.length ? sequence[loadRowIdxs[ci]]?.quantity || 0 : 0;
    };

    // Demurrage is ADDED to the base freight BEFORE commission (commission
    // applies to base + demurrage). Despatch is deducted AFTER commission —
    // opposite treatment to demurrage.
    const perCargoFreight = cargoEntriesForFreight.map((c, ci) => {
      const qty = qtyForCargo(c.id, ci);
      const base = c.rateType === "lumpsum" ? c.rate || 0 : (c.rate || 0) * qty;
      const dem = c.demurrage || 0;
      const des = c.despatch || 0;
      const commissionable = base + dem;
      const commission = commissionable * ((c.voyageCommission || 0) / 100);
      const gross = commissionable - des;
      const net = commissionable - commission - des;
      return { id: c.id, qty, base, gross, commission, net };
    });

    let grossFreight: number;
    let voyageCommission: number;
    let netFreight: number;

    if (perCargoFreight.length > 0) {
      grossFreight = perCargoFreight.reduce((s, p) => s + p.gross, 0);
      voyageCommission = perCargoFreight.reduce((s, p) => s + p.commission, 0);
      netFreight = perCargoFreight.reduce((s, p) => s + p.net, 0);
    } else {
      const baseGrossFreight =
        cargo.rateType === "lumpsum" ? cargo.rate : cargo.rate * cargo.quantity;
      const dem = cargo.demurrage || 0;
      const des = cargo.despatch || 0;
      const commissionable = baseGrossFreight + dem;
      grossFreight = commissionable - des;
      voyageCommission = commissionable * (cargo.voyageCommission / 100);
      netFreight = commissionable - voyageCommission - des;
    }

    vlog(`\n[Step 6] FREIGHT & REVENUE (per-cargo, unmixed):
${perCargoFreight
  .map(
    (p, i) =>
      `    Cargo #${i + 1}: base $${p.base}, comm $${p.commission}, + dem/desp => gross $${p.gross}, net $${p.net}`,
  )
  .join("\n")}
    Total Gross Freight = $${grossFreight}
    Total Voyage Commission = $${voyageCommission}
    Total Net Freight = $${netFreight}`);


    // 7. Calculate misc costs
    const miscCosts = (misc?.miscCost || 0) + (misc?.extraFees || 0) + (misc?.extraInsurance || 0);
    const canalCosts = misc?.canalCost1 || 0;

    vlog(`\n[Step 7] MISC COSTS:
    Misc: miscCost=$${misc?.miscCost || 0} + extraFees=$${misc?.extraFees || 0} + extraInsurance=$${misc?.extraInsurance || 0} = $${miscCosts}
    Canal: canal1=$${misc?.canalCost1 || 0} + canal2=$${misc?.canalCost2 || 0} = $${canalCosts}`);

    // 8. Total voyage costs (Bunker + Port + Canal + Misc — NO commissions mixed in)
    const totalVoyageCosts = totalBunkerCost + portCosts + miscCosts + canalCosts;
    
    vlog(`\n[Step 8] TOTAL VOYAGE COSTS:
    Bunker($${totalBunkerCost}) + Port($${portCosts}) + Misc($${miscCosts}) + Canal($${canalCosts}) = $${totalVoyageCosts}`);

    // 9. Hire calculations — TC Commission reduces hire ONLY, never freight
    const grossHireRate = hireRate;
    const tcCommissionPct = cargo.tcCommission / 100;
    const netHireRate = grossHireRate * (1 - tcCommissionPct);
    const netBBValue = (inputs.netBB && inputs.netBB > 0) ? inputs.netBB : 0;
    const hireCost = grossHireRate * totalVoyageDays + netBBValue;
    const netHireCost = netHireRate * totalVoyageDays + netBBValue;
    const tcCommissionAmount = (grossHireRate * totalVoyageDays) * tcCommissionPct;
    const voyageCostInclHire = totalVoyageCosts + hireCost;
    const voyageCostExclHire = totalVoyageCosts;

    vlog(`\n[Step 9] HIRE CALCULATIONS:
    Gross Hire Rate: $${grossHireRate}/day
    Net BB: $${netBBValue}
    TC Commission: ${cargo.tcCommission}% → Net Hire Rate: $${grossHireRate} × (1 - ${tcCommissionPct}) = $${netHireRate}/day
    Hire Cost: $${grossHireRate} × ${totalVoyageDays} days + NetBB($${netBBValue}) = $${hireCost}
    Net Hire Cost: $${netHireRate} × ${totalVoyageDays} + NetBB($${netBBValue}) = $${netHireCost}
    TC Commission Amount: ($${grossHireRate} × ${totalVoyageDays}) × ${tcCommissionPct} = $${tcCommissionAmount}
    Voyage Cost incl Hire: $${totalVoyageCosts} + $${hireCost} = $${voyageCostInclHire}
    Voyage Cost excl Hire: $${voyageCostExclHire}`);

    // 10. Profitability calculations
    // Demurrage / Despatch are no longer applied here — already baked into
    // Gross Freight above (demurrage +, despatch -).
    const voyageResult = netFreight - totalVoyageCosts;
    const grossProfit = voyageResult;
    const netProfit = grossProfit;
    
    const pAndL = voyageResult - hireCost;

    const ntce = totalVoyageDays > 0 
      ? (netFreight - totalVoyageCosts) / totalVoyageDays 
      : 0;
    
    const gtce = tcCommissionPct < 1
      ? ntce / (1 - tcCommissionPct) 
      : 0;
    
    const tce = gtce;

    // Gross Rate = (Voyage Cost Incl Hire / Load Qty) grossed up by voyage commission
    const voyageCommissionPct = cargo.voyageCommission / 100;
    const baseRatePerMt = cargo.quantity > 0 ? voyageCostInclHire / cargo.quantity : 0;
    const grossRate = voyageCommissionPct < 1 ? baseRatePerMt / (1 - voyageCommissionPct) : 0;

    vlog(`\n[Step 10] PROFITABILITY:
    Voyage Result = NetFreight($${netFreight}) - VoyageCosts($${totalVoyageCosts}) - Demurrage($${cargo.demurrage}) + Despatch($${cargo.despatch}) = $${voyageResult}
    Gross Profit = $${grossProfit}
    P&L = VoyageResult($${voyageResult}) - HireCost($${hireCost}) = $${pAndL}
    NTCE = (NetFreight($${netFreight}) - VoyageCosts($${totalVoyageCosts})) / Days(${totalVoyageDays}) = $${ntce}/day
    GTCE = NTCE($${ntce}) / (1 - tcComm(${tcCommissionPct})) = $${gtce}/day
    TCE = GTCE = $${tce}/day`);

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
    // EEOI = CO2 × 10^6 / Σ(leg distance (non-ECA + ECA) × cargo on board)
    const efoi = transportWork > 0 ? (totalCo2 * 1000000) / transportWork : 0;

    const getLegPortKey = (leg: Pick<SequenceRow, "port" | "portUnloc">): string =>
      (leg.portUnloc || leg.port || "").trim();

    const getLegPortLabel = (leg: Pick<SequenceRow, "port" | "portUnloc">): string =>
      (leg.port || leg.portUnloc || "").trim();

    // Build voyage legs for ETS calculation using is_eu_eea port flag
    // Each port's isEuEea flag determines if it's an EU/EEA port
    const voyageLegs: Array<{ origin: string; destination: string; co2: number }> = [];
    const legCoverages: number[] = []; // Store per-leg EU coverage

    // EU ETS sea-leg coverage is determined independently by the adjacent ports
    // of call that bracket each sea segment. Intermediate stops are included.
    // A passage waypoint (for example Port Said entered as `pssg`) and a
    // bunkering-only call are NOT regulatory port calls. Neither may reset the
    // origin of an EU ETS sea leg — their sailing time/fuel remains part of the
    // voyage between the surrounding actual (load/discharge) port calls.
    const isEuRegulatoryPortCall = (leg: SequenceRow): boolean => {
      const op = (leg.operation || '').toLowerCase();
      return !!getLegPortKey(leg) && op !== 'pssg' && op !== 'bunkering';
    };
    // EU ETS coverage uses ONLY the port API's eu_zone flag (surfaced as leg.isEuEea).
    // Never infer from country name or ECA distance.
    //   Sea leg (from → to): both EU = 100%, one EU = 50%, none = 0%
    //   Port stay: 100% if port is EU, else 0%
    const bracketOriginIdx: number[] = sequence.map(() => -1);
    const bracketOriginIsEu: (boolean | null)[] = sequence.map(() => null);
    const bracketDestIsEu: (boolean | null)[] = sequence.map(() => null);
    {
      const nextRegulatoryPortIdx: number[] = sequence.map(() => -1);
      let nextIdx = -1;
      for (let i = sequence.length - 1; i >= 0; i--) {
        nextRegulatoryPortIdx[i] = nextIdx;
        if (isEuRegulatoryPortCall(sequence[i])) nextIdx = i;
      }

      let prevIdx = -1;
      for (let i = 0; i < sequence.length; i++) {
        const hasPort = !!getLegPortKey(sequence[i]);
        if (!hasPort) continue;

        const currentIsRegulatoryPort = isEuRegulatoryPortCall(sequence[i]);
        const destIdx = currentIsRegulatoryPort ? i : nextRegulatoryPortIdx[i];
        if (prevIdx >= 0 && destIdx >= 0) {
          bracketOriginIdx[i] = prevIdx;
          bracketOriginIsEu[i] = sequence[prevIdx].isEuEea === true;
          bracketDestIsEu[i] = sequence[destIdx].isEuEea === true;
        }
        if (currentIsRegulatoryPort) prevIdx = i;
      }
    }
    const computeSeaEuFactor = (legIdx: number): number => {
      const originEu = bracketOriginIsEu[legIdx];
      const destEu = bracketDestIsEu[legIdx];
      if (originEu === null || destEu === null) return 0;
      if (originEu && destEu) return 1.0;
      if (originEu || destEu) return 0.5;
      return 0;
    };

    // ── Commercial voyage window for EU ETS ──
    // EU ETS applies only between the first LOAD operation and the last
    // DISCHARGE operation. Ballast positioning before first load and
    // repositioning after last discharge are excluded entirely.
    let firstLoadIdx = -1;
    let lastDischargeIdx = -1;
    for (let i = 0; i < sequence.length; i++) {
      const op = (sequence[i].operation || '').toLowerCase();
      if (firstLoadIdx === -1 && (op === 'load' || op === 'loading')) firstLoadIdx = i;
      if (op === 'disch' || op === 'discharging') lastDischargeIdx = i;
    }
    const euWindowValid = firstLoadIdx !== -1 && lastDischargeIdx !== -1 && firstLoadIdx <= lastDischargeIdx;
    // Edge case: if the voyage's ballast start (open port) is inside the EU/EEA,
    // the ballast leg itself is EU-covered, so the window starts at the open port
    // instead of the first load port. Otherwise the window is unchanged.
    const ballastStartsInEu = sequence.length > 0 && sequence[0].isEuEea === true;
    const euStartIdx = euWindowValid && ballastStartsInEu && firstLoadIdx > 0 ? 0 : firstLoadIdx;
    // Sea leg at index `i` corresponds to sailing INTO port at `i`.
    // Include sea legs strictly AFTER first load (the sail into first load is excluded)
    // and UP TO AND INCLUDING the sail into last discharge.
    const inEuSeaWindow = (i: number) => euWindowValid && i > euStartIdx && i <= lastDischargeIdx;
    // Port stays include first load through last discharge (inclusive).
    // The initial load / opening port stay is NOT counted for EU ETS port coverage.
    const inEuPortWindow = (i: number) => euWindowValid && i >= euStartIdx && i <= lastDischargeIdx;

    // Build one informational sea leg per actual regulatory port call. Passage
    // rows between calls are grouped into the surrounding commercial leg.
    let previousRegulatoryIdx = -1;
    sequence.forEach((leg, index) => {
      if (!isEuRegulatoryPortCall(leg)) return;

      if (previousRegulatoryIdx >= 0 && inEuSeaWindow(index)) {
        const groupedSeaTime = sequence
          .slice(previousRegulatoryIdx + 1, index + 1)
          .reduce((sum, row) => sum + (row.seaTime || 0), 0);
        const legCo2 = totalSeaDays > 0 ? totalCo2 * (groupedSeaTime / totalSeaDays) : 0;
        voyageLegs.push({
          origin: getLegPortLabel(sequence[previousRegulatoryIdx]) || getLegPortKey(sequence[previousRegulatoryIdx]),
          destination: getLegPortLabel(leg) || getLegPortKey(leg),
          co2: legCo2,
        });
        legCoverages.push(computeSeaEuFactor(index));
      }

      previousRegulatoryIdx = index;
    });

    // Store leg-level EU coverage info for breakdown display
    const phaseInPercentage = getEtsPhaseInPercentage();
    const etsLegBreakdown: EtsResult['legBreakdown'] = [];
    
    voyageLegs.forEach((leg, i) => {
      const coverage = legCoverages[i] || 0;
      // Per-leg CO2 stored for informational breakdown only
      const chargeableCo2 = leg.co2 * coverage * phaseInPercentage;
      
      etsLegBreakdown.push({
        origin: leg.origin,
        destination: leg.destination,
        coverage,
        co2: leg.co2,
        chargeableCo2,
      });
    });

    const commercialSeaCo2 = etsLegBreakdown.reduce((sum, leg) => sum + leg.co2, 0);
    const etsVoyageCoverage = commercialSeaCo2 > 0
      ? etsLegBreakdown.reduce((sum, leg) => sum + (leg.co2 / commercialSeaCo2) * leg.coverage, 0)
      : 0;

    // NOTE: Chargeable CO2 EUA is computed AFTER EU fuel allocation below (bottom-up approach).
    // Placeholder ETS result — will be finalized after EU fuel calc.
    let totalChargeableCo2 = 0;
    let etsCost = 0;
    let etsResult: EtsResult = {
      totalCo2,
      etsVoyageCoverage,
      phaseInPercentage,
      chargeableCo2: 0,
      etsCost: 0,
      legBreakdown: etsLegBreakdown,
    };

    // Calculate CII rating using IMO methodology
    const ciiResult = calculateCiiRating({
      totalCo2,
      dwt: vessel.dwt,
      distanceTravelled: totalDistance + totalEcaDistance,
      shipType: vessel.type || 'bulk_carrier',
    });
    
    const afrCii = ciiResult.actualCii;
    const ciiRating = ciiResult.rating;

    vlog(`\n[Step 11] ENVIRONMENTAL METRICS:
    --- CO2 Emissions (mt) ---
    HSFO CO2: ${hsfoConsumption} mt × ${CO2_EMISSION_FACTORS.hsfo} = ${co2ByFuel.hsfo} mt CO2
    VLSFO CO2: ${vlsfoConsumption} mt × ${CO2_EMISSION_FACTORS.vlsfo} = ${co2ByFuel.vlsfo} mt CO2
    LSMGO CO2: ${lsmgoConsumption} mt × ${CO2_EMISSION_FACTORS.lsmgo} = ${co2ByFuel.lsmgo} mt CO2
    Total CO2 = ${totalCo2} mt
    Non-ECA CO2 = ${nonEcaCo2} mt, ECA CO2 = ${ecaCo2} mt
    CO2 Ballast = totalCO2(${totalCo2}) × ballastDays(${seaDaysBallast})/totalSeaDays(${totalSeaDays}) = ${co2Ballast} mt
    CO2 Laden = totalCO2(${totalCo2}) × ladenDays(${seaDaysLaden})/totalSeaDays(${totalSeaDays}) = ${co2Laden} mt
    
    --- EFOI ---
    EFOI = totalCO2(${totalCo2}) × 1000000 / transportWork(${transportWork} t·nm, ladenDist incl. ECA ${ladenDistanceInclEca}) = ${efoi} gCO2/tnm
    
    --- CII ---
    Actual CII = totalCO2(${totalCo2}) × 1000000 / (DWT(${vessel.dwt}) × totalDist(${totalDistance})) = ${afrCii} gCO2/dwt-nm
    CII Rating = ${ciiRating}
    
    --- EU ETS (preliminary - final chargeable CO2 computed after EU fuel allocation) ---
    ETS Coverage (informational) = ${etsVoyageCoverage * 100}%
    ETS Phase-in = ${phaseInPercentage * 100}%`);

    // ============================================
    // SEGMENT-WISE EU FUEL CALCULATION
    // Computes fuel per segment with separate handling of:
    //   1. Sea time (ballast/laden) → EU factor from origin/destination
    //   2. Port working time → EU factor from port location (1 if EU, 0 if non-EU)
    //   3. Turn time (maneuvering) → EU factor from port location
    //   4. Extra time (anchorage/waiting) → EU factor from port location
    // ============================================
    let euCoveredHsfo = 0;
    let euCoveredVlsfo = 0;
    let euCoveredLsmgo = 0;
    const etsLegDetails: EtsLegDetail[] = [];

    // ── UK ETS accumulators (independent from EU ETS) ──
    const ukPhaseIn = getUkEtsPhaseIn();
    let ukCoveredHsfo = 0;
    let ukCoveredVlsfo = 0;
    let ukCoveredLsmgo = 0;
    const ukEtsLegDetails: UkEtsLegDetail[] = [];
    let prevUkZone: UkZone = null;
    let ukLegIdx = 0;
    let ukTotalSeaTime = 0;
    let ukWeightedSeaFactor = 0;
    
    {
      let prevIsEuEea = false;
      let prevPortUnloc = '';
      let prevPortName = '';
      let segCargoOnBoard = 0;
      let legIdx = 0;
      
      // Track weighted EU coverage for extra sea days (from misc section)
      let totalSeaTimeInSegments = 0;
      let weightedEuSeaFactor = 0;
      let pendingSeaHsfo = 0;
      let pendingSeaVlsfo = 0;
      let pendingSeaLsmgo = 0;
      let pendingChargeHsfo = 0;
      let pendingChargeVlsfo = 0;
      let pendingChargeLsmgo = 0;
      
      vlog(`\n[EU ETS] Sequence isEuEea flags:`, sequence.map(s => ({ port: s.port, isEuEea: s.isEuEea })));
      
      sequence.forEach((leg, index) => {
        const legOperation = (leg.operation || '').toLowerCase();
        const legQty = Math.max(0, leg.quantity || 0);
        const legIsLaden = segCargoOnBoard > 0;
        const currentPortKey = getLegPortKey(leg);
        const currentPortName = getLegPortLabel(leg);
        
        // Per-leg fuel accumulators
        let legSeaHsfo = 0, legSeaVlsfo = 0, legSeaLsmgo = 0;
        let legPortHsfo = 0, legPortVlsfo = 0, legPortLsmgo = 0;
        let seaEuFactor = 0;
        let originPortName = prevPortName;
        let originUnloc = prevPortUnloc;
        let originIsEu = prevIsEuEea;
        
        // ── 1. SEA FUEL for this segment ──
        if (currentPortKey) {
          const currentIsEuEea = leg.isEuEea === true;
          // Sea EU factor uses the adjacent origin and destination ports for
          // this segment. Intermediate passing/bunkering stops are evaluated.
          // Also constrained to the commercial voyage window
          // (first load → last discharge).
          seaEuFactor = inEuSeaWindow(index) ? computeSeaEuFactor(index) : 0;
          if (!prevPortUnloc) {
            originPortName = currentPortName;
            originUnloc = currentPortKey;
            originIsEu = currentIsEuEea;
          }
          
          const legSeaTimeTotal = leg.seaTime || 0;
          if (inEuSeaWindow(index)) {
            totalSeaTimeInSegments += legSeaTimeTotal;
            weightedEuSeaFactor += legSeaTimeTotal * seaEuFactor;
          }
          
          // Calculate total sea fuel for this leg (regardless of EU factor)
          const legNonEcaTime = leg.nonEcaTime || ((leg.seaTime || 0) - (leg.ecaTime || 0));
          const legEcaTime = leg.ecaTime || 0;
          
          const rateFor = (f: "hsfo" | "vlsfo" | "lsmgo") =>
            legIsLaden ? (profile[f].laden || 0) : (profile[f].ballast || 0);
          const legNonEcaFuel = contextFuel(leg.distanceSpeedContext, hasScrubber ? "hsfo" : "vlsfo");
          const legEcaFuel = contextFuel(leg.ecaDistanceSpeedContext, "lsmgo");
          let segLsmgoEca = 0;
          const addSea = (fuel: "hsfo" | "vlsfo" | "lsmgo", days: number) => {
            const mt = days * rateFor(fuel) * rewardFactor;
            if (fuel === "hsfo") legSeaHsfo += mt;
            else if (fuel === "vlsfo") legSeaVlsfo += mt;
            else segLsmgoEca += mt;
          };
          addSea(legNonEcaFuel, legNonEcaTime);
          addSea(legEcaFuel, legEcaTime);
          
          const aeRates = hasScrubber ? profile.aeScrubber : profile.ae;
          const aeRate = legIsLaden ? (aeRates.laden || 0) : (aeRates.ballast || 0);
          const segLsmgoAeSea = legSeaTimeTotal * aeRate * rewardFactor;
          
          legSeaLsmgo = segLsmgoEca + segLsmgoAeSea;
          
          // EU-chargeable sea fuel
          euCoveredHsfo += legSeaHsfo * seaEuFactor;
          euCoveredVlsfo += legSeaVlsfo * seaEuFactor;
          euCoveredLsmgo += legSeaLsmgo * seaEuFactor;

          if (inEuSeaWindow(index)) {
            pendingSeaHsfo += legSeaHsfo;
            pendingSeaVlsfo += legSeaVlsfo;
            pendingSeaLsmgo += legSeaLsmgo;
            pendingChargeHsfo += legSeaHsfo * seaEuFactor;
            pendingChargeVlsfo += legSeaVlsfo * seaEuFactor;
            pendingChargeLsmgo += legSeaLsmgo * seaEuFactor;
          }
        }
        
        // ── 2/3/4. PORT FUEL: Working + Turn + Extra ──
        // Port coverage is PORT-ZONE based:
        //   - Port physically in the EU/EEA → 100% covered.
        //   - Any non-EU port → 0% (e.g. EU → Non-EU voyage: sea 50%,
        //     EU load port 100%, non-EU discharge port 0%).
        //   - Outside commercial voyage window → 0%
        const portIsEu = leg.isEuEea === true;
        // Passing / bunkering waypoints are not commercial calls — they inherit
        // the arriving sea leg's coverage (e.g. 50% on a Non-EU → EU voyage).
        const isPassageStop = legOperation === 'pssg' || legOperation === 'passage' || legOperation === 'bunkering';
        const portEuFactor = (!currentPortKey || !inEuPortWindow(index))
          ? 0
          : (portIsEu ? 1.0 : (isPassageStop ? seaEuFactor : 0));
        
        if (currentPortKey && leg.portDays > 0) {
          const legPortFuel = leg.portFuelType || (hasScrubber ? 'hsfo' : 'vlsfo');
          const aeRates = hasScrubber ? profile.aeScrubber : profile.ae;
          
          const turnTimeDays = (leg.turnTimeHours || 0) / 24;
          const extraTimeDays = (leg.extraTimeHours || 0) / 24;
          const termsFactorLeg = (leg.termsFactor || 0) > 1 ? (leg.termsFactor as number) : 1;
          const grossWorkingLeg = Math.max(0, (leg.portDays || 0) - turnTimeDays - extraTimeDays);
          const workingDaysLeg = grossWorkingLeg / termsFactorLeg;
          const idleDaysLeg = (grossWorkingLeg - workingDaysLeg) + turnTimeDays + extraTimeDays;
          
          let portHsfo = 0, portVlsfo = 0, portLsmgo = 0;
          
          const addFuel = (fuelType: string, amount: number) => {
            if (fuelType === 'hsfo') portHsfo += amount;
            else if (fuelType === 'vlsfo') portVlsfo += amount;
            else portLsmgo += amount;
          };
          
          if (legOperation === 'load' || legOperation === 'loading') {
            addFuel(legPortFuel, workingDaysLeg * (profile[legPortFuel]?.load || 0) + idleDaysLeg * (profile[legPortFuel]?.idle || 0));
            portLsmgo += workingDaysLeg * (aeRates.load || 0) + idleDaysLeg * (aeRates.idle || 0);
          } else if (legOperation === 'disch' || legOperation === 'discharging') {
            addFuel(legPortFuel, workingDaysLeg * (profile[legPortFuel]?.discharge || 0) + idleDaysLeg * (profile[legPortFuel]?.idle || 0));
            portLsmgo += workingDaysLeg * (aeRates.discharge || 0) + idleDaysLeg * (aeRates.idle || 0);
          } else if (legOperation === 'pssg' || legOperation === 'passage') {
            // Passing port: turn + extra time burn at the CANAL rate
            addFuel(legPortFuel, (leg.portDays || 0) * (profile[legPortFuel]?.canal || 0));
            portLsmgo += (leg.portDays || 0) * (aeRates.canal || 0);
          } else if (legOperation === 'bunkering') {
            addFuel(legPortFuel, (leg.portDays || 0) * (profile[legPortFuel]?.idle || 0));
            portLsmgo += (leg.portDays || 0) * (aeRates.idle || 0);
          } else {
            addFuel(legPortFuel, (leg.portDays || 0) * (profile[legPortFuel]?.idle || 0));
            portLsmgo += (leg.portDays || 0) * (aeRates.idle || 0);
          }
          
          // Store total port fuel for this leg
          legPortHsfo = portHsfo;
          legPortVlsfo = portVlsfo;
          legPortLsmgo = portLsmgo;
          
          // EU-chargeable port fuel (100% if EU port, 0% otherwise)
          euCoveredHsfo += portHsfo * portEuFactor;
          euCoveredVlsfo += portVlsfo * portEuFactor;
          euCoveredLsmgo += portLsmgo * portEuFactor;
        }
        
        // Build leg detail for UI (skip first port if no sea time — it's origin only).
        // Also skip entirely any leg outside the commercial voyage window
        // (ballast before first load, repositioning after last discharge) so the
        // EU ETS breakdown table starts at the first load port and ends at the
        // last discharge port.
        const hasSeaOrPort = (leg.seaTime || 0) > 0 || (leg.portDays || 0) > 0;
        const withinEuWindow = inEuSeaWindow(index) || inEuPortWindow(index);
        if (currentPortKey && hasSeaOrPort && withinEuWindow && (prevPortUnloc || (leg.seaTime || 0) > 0)) {
          const isPortOnly = index === euStartIdx;
          // Every sub-leg (including passage/bunkering waypoints) is shown as
          // its own row with its own sea fuel and coverage factor. Coverage is
          // computed using bracketed EU flags so a run of non-EU waypoints on
          // a voyage-to-EU inherits the 50% factor.
          const coveragePct = seaEuFactor * 100;
          // Coverage label reflects this adjacent port-to-port segment.
          const originEu = bracketOriginIsEu[index];
          const destEu = bracketDestIsEu[index];
          let coverageLabel = '';
          if (isPortOnly) {
            coverageLabel = euStartIdx === 0
              ? 'Voyage starts at EU open port (ballast leg covered)'
              : 'Commercial voyage starts at first load';
          } else if (seaEuFactor === 1.0) coverageLabel = 'EU → EU: 100%';
          else if (seaEuFactor === 0.5) {
            coverageLabel = originEu
              ? 'EU → Non-EU: 50%'
              : 'Non-EU → EU: 50%';
          } else if (originEu === null || destEu === null) {
            coverageLabel = 'Origin leg: 0%';
          } else {
            coverageLabel = 'Non-EU → Non-EU: 0%';
          }
          
          // Port coverage label — port stay inherits the voyage coverage factor
          const portLabel = leg.portDays > 0
            ? (inEuPortWindow(index)
                ? ` | Port: ${portEuFactor * 100}% (${isPassageStop && !portIsEu ? 'passing port — inherits leg factor' : 'port-zone based'})`
                : ' | Port: excluded (outside cargo voyage)')
            : '';
          
          const detailSeaHsfo = isPortOnly ? 0 : legSeaHsfo;
          const detailSeaVlsfo = isPortOnly ? 0 : legSeaVlsfo;
          const detailSeaLsmgo = isPortOnly ? 0 : legSeaLsmgo;
          const detailChargeHsfo = (detailSeaHsfo * seaEuFactor) + (legPortHsfo * portEuFactor);
          const detailChargeVlsfo = (detailSeaVlsfo * seaEuFactor) + (legPortVlsfo * portEuFactor);
          const detailChargeLsmgo = (detailSeaLsmgo * seaEuFactor) + (legPortLsmgo * portEuFactor);
          const chargeableCo2 =
            detailChargeHsfo * CO2_EMISSION_FACTORS.hsfo +
            detailChargeVlsfo * CO2_EMISSION_FACTORS.vlsfo +
            detailChargeLsmgo * CO2_EMISSION_FACTORS.lsmgo;

          const originIdx = bracketOriginIdx[index];
          const detailOrigin = originIdx >= 0 ? sequence[originIdx] : undefined;
          // Show the immediately preceding port as origin for every sub-leg,
          // so intermediate hops appear as real port→port sailings.
          const intermediateOrigin = !isPortOnly
            ? { name: prevPortName, unloc: prevPortUnloc, isEu: prevIsEuEea }
            : null;
          
          etsLegDetails.push({
            legIndex: legIdx++,
            isPortOnly,
            originPort: isPortOnly ? '' : (intermediateOrigin ? intermediateOrigin.name : (detailOrigin ? getLegPortLabel(detailOrigin) : originPortName)),
            originUnloc: isPortOnly ? '' : (intermediateOrigin ? intermediateOrigin.unloc : (detailOrigin ? getLegPortKey(detailOrigin) : originUnloc)),
            originIsEu: isPortOnly ? false : (intermediateOrigin ? intermediateOrigin.isEu : (detailOrigin ? detailOrigin.isEuEea === true : originIsEu)),
            destPort: currentPortName,
            destUnloc: currentPortKey,
            destIsEu: leg.isEuEea === true,
            coveragePct,
            portCoveragePct: portEuFactor * 100,
            coverageLabel: coverageLabel + portLabel,
            seaVlsfo: detailSeaVlsfo,
            seaLsmgo: detailSeaLsmgo,
            seaHsfo: detailSeaHsfo,
            portVlsfo: legPortVlsfo,
            portLsmgo: legPortLsmgo,
            portHsfo: legPortHsfo,
            chargeableVlsfo: detailChargeVlsfo,
            chargeableLsmgo: detailChargeLsmgo,
            chargeableHsfo: detailChargeHsfo,
            chargeableCo2,
          });
        }
        
        // Update cargo tracker
        if (legOperation === 'load' || legOperation === 'loading') {
          segCargoOnBoard += legQty;
        } else if (legOperation === 'disch' || legOperation === 'discharging') {
          segCargoOnBoard = Math.max(0, segCargoOnBoard - legQty);
        }
        
        // Update previous port tracking
        if (currentPortKey) {
          prevPortUnloc = currentPortKey;
          prevPortName = currentPortName;
          prevIsEuEea = leg.isEuEea === true;
        }

        // ── UK ETS per-leg (independent from EU ETS) ──
        if (currentPortKey) {
          const currentUkZone: UkZone = (leg.ukZone ?? null) as UkZone;
          const seaUkFactor = prevUkZone
            ? getUkEtsSeaCoverage(prevUkZone, currentUkZone)
            : 0;
          const portUkFactor = getUkEtsPortCoverage(leg.ukEts);

          const ukSeaHsfo = legSeaHsfo * seaUkFactor;
          const ukSeaVlsfo = legSeaVlsfo * seaUkFactor;
          const ukSeaLsmgo = legSeaLsmgo * seaUkFactor;
          const ukPortHsfo = legPortHsfo * portUkFactor;
          const ukPortVlsfo = legPortVlsfo * portUkFactor;
          const ukPortLsmgo = legPortLsmgo * portUkFactor;

          ukCoveredHsfo += ukSeaHsfo + ukPortHsfo;
          ukCoveredVlsfo += ukSeaVlsfo + ukPortVlsfo;
          ukCoveredLsmgo += ukSeaLsmgo + ukPortLsmgo;

          const legSeaTimeTotal = leg.seaTime || 0;
          ukTotalSeaTime += legSeaTimeTotal;
          ukWeightedSeaFactor += legSeaTimeTotal * seaUkFactor;

          const hasAny = (leg.seaTime || 0) > 0 || (leg.portDays || 0) > 0;
          if (hasAny && (prevUkZone !== null || (leg.seaTime || 0) > 0 || portUkFactor > 0)) {
            const legUkFuel = {
              hsfo: ukSeaHsfo + ukPortHsfo,
              vlsfo: ukSeaVlsfo + ukPortVlsfo,
              lsmgo: ukSeaLsmgo + ukPortLsmgo,
            };
            const legUkCo2 = ukCo2FromFuel(legUkFuel);
            ukEtsLegDetails.push({
              legIndex: ukLegIdx++,
              originPort: originPortName,
              originZone: prevUkZone,
              destPort: currentPortName,
              destZone: currentUkZone,
              seaCoveragePct: seaUkFactor * 100,
              portCoveragePct: portUkFactor * 100,
              ukCoveredFuel: legUkFuel,
              ukCoveredCo2: legUkCo2,
              chargeableCo2: legUkCo2 * ukPhaseIn,
            });
          }

          prevUkZone = currentUkZone;
        }
      });
      
      // ── Handle extra time from Misc section ──
      if (extraSeaDays > 0 && totalSeaTimeInSegments > 0) {
        const avgEuSeaFactor = weightedEuSeaFactor / totalSeaTimeInSegments;
        if (avgEuSeaFactor > 0) {
          if (hasScrubber) {
            euCoveredHsfo += extraSeaDays * (profile.hsfo.laden || 0) * rewardFactor * avgEuSeaFactor;
          } else {
            euCoveredVlsfo += extraSeaDays * (profile.vlsfo.laden || 0) * rewardFactor * avgEuSeaFactor;
          }
          const aeRates = hasScrubber ? profile.aeScrubber : profile.ae;
          euCoveredLsmgo += extraSeaDays * (aeRates.laden || 0) * rewardFactor * avgEuSeaFactor;
        }
      }
      
      if (extraPortDays > 0 && totalSeaTimeInSegments > 0) {
        // Extra port days inherit the same weighted sea-leg coverage as the
        // voyage (per leg-uniform ETS rule).
        const avgPortEuFactor = weightedEuSeaFactor / totalSeaTimeInSegments;
        if (avgPortEuFactor > 0) {
          const extraPortFuelType = hasScrubber ? 'hsfo' : 'vlsfo';
          const extraPortIdleRate = profile[extraPortFuelType]?.idle || 0;
          if (extraPortFuelType === 'hsfo') {
            euCoveredHsfo += extraPortDays * extraPortIdleRate * avgPortEuFactor;
          } else {
            euCoveredVlsfo += extraPortDays * extraPortIdleRate * avgPortEuFactor;
          }
          const aeRates = hasScrubber ? profile.aeScrubber : profile.ae;
          euCoveredLsmgo += extraPortDays * (aeRates.idle || 0) * avgPortEuFactor;
        }
      }
      
      if (extraCanalDays > 0 && totalSeaTimeInSegments > 0) {
        const avgEuSeaFactor = weightedEuSeaFactor / totalSeaTimeInSegments;
        if (avgEuSeaFactor > 0) {
          if (hasScrubber) {
            euCoveredHsfo += extraCanalDays * (profile.hsfo.canal || 0) * avgEuSeaFactor;
          } else {
            euCoveredVlsfo += extraCanalDays * (profile.vlsfo.canal || 0) * avgEuSeaFactor;
          }
        }
      }
    }

    // ── UK ETS: extra sea/canal misc fuel inherits weighted UK sea factor ──
    if (ukTotalSeaTime > 0) {
      const avgUkSeaFactor = ukWeightedSeaFactor / ukTotalSeaTime;
      if (avgUkSeaFactor > 0) {
        if (extraSeaDays > 0) {
          if (hasScrubber) {
            ukCoveredHsfo += extraSeaDays * (profile.hsfo.laden || 0) * rewardFactor * avgUkSeaFactor;
          } else {
            ukCoveredVlsfo += extraSeaDays * (profile.vlsfo.laden || 0) * rewardFactor * avgUkSeaFactor;
          }
          const aeRates = hasScrubber ? profile.aeScrubber : profile.ae;
          ukCoveredLsmgo += extraSeaDays * (aeRates.laden || 0) * rewardFactor * avgUkSeaFactor;
        }
        if (extraCanalDays > 0) {
          if (hasScrubber) {
            ukCoveredHsfo += extraCanalDays * (profile.hsfo.canal || 0) * avgUkSeaFactor;
          } else {
            ukCoveredVlsfo += extraCanalDays * (profile.vlsfo.canal || 0) * avgUkSeaFactor;
          }
        }
      }
    }

    const ukCoveredFuel = { hsfo: ukCoveredHsfo, vlsfo: ukCoveredVlsfo, lsmgo: ukCoveredLsmgo };
    const ukCo2 = ukCo2FromFuel(ukCoveredFuel);
    const ukChargeableCo2 = ukCo2 * ukPhaseIn;
    const ukEtsPriceEff = bunker.ukEtsPrice || 0;
    const ukEtsCost = ukChargeableCo2 * ukEtsPriceEff;
    const ukVoyageCoverage = ukTotalSeaTime > 0 ? ukWeightedSeaFactor / ukTotalSeaTime : 0;
    const ukEtsResult: UkEtsResult = {
      phaseIn: ukPhaseIn,
      ukCoveredFuel,
      ukCoveredCo2: ukCo2,
      chargeableCo2: ukChargeableCo2,
      ukEtsCost,
      ukVoyageCoverage,
      legBreakdown: ukEtsLegDetails,
    };

    vlog(`\n[Step 12b] UK ETS (bottom-up):
    UK Fuel: HSFO=${ukCoveredHsfo.toFixed(2)}t, VLSFO=${ukCoveredVlsfo.toFixed(2)}t, LSMGO=${ukCoveredLsmgo.toFixed(2)}t
    UK CO₂ from fuel = ${ukCo2.toFixed(2)} mt × ${ukPhaseIn} (phase-in) = ${ukChargeableCo2.toFixed(2)} mt
    UK ETS Cost = ${ukChargeableCo2.toFixed(2)} × $${ukEtsPriceEff} = $${ukEtsCost.toFixed(2)}`);
    
    const euCoveredFuel = { hsfo: euCoveredHsfo, vlsfo: euCoveredVlsfo, lsmgo: euCoveredLsmgo };
    
    // ============================================
    // CHARGEABLE CO₂ EUA — BOTTOM-UP CALCULATION
    // Per EU MRV/ETS regulations: CO₂ is calculated from actual EU-covered fuel,
    // NOT by prorating total CO₂ with an aggregated coverage %.
    // Formula: (HSFO_EU × 3.114 + VLSFO_EU × 3.151 + LSMGO_EU × 3.206) × PhaseIn
    // ============================================
    const euCo2FromFuel = 
      euCoveredHsfo * CO2_EMISSION_FACTORS.hsfo +
      euCoveredVlsfo * CO2_EMISSION_FACTORS.vlsfo +
      euCoveredLsmgo * CO2_EMISSION_FACTORS.lsmgo;
    
    totalChargeableCo2 = euCo2FromFuel * phaseInPercentage;
    const euEtsPriceEff = bunker.euEtsPrice || 0;
    etsCost = totalChargeableCo2 * euEtsPriceEff;
    
    // Finalize ETS result with bottom-up values
    etsResult = {
      totalCo2,
      etsVoyageCoverage,
      phaseInPercentage,
      chargeableCo2: totalChargeableCo2,
      etsCost,
      legBreakdown: etsLegBreakdown,
    };
    
    vlog(`\n[Step 12] CHARGEABLE CO₂ EUA (bottom-up):
    EU Fuel: HSFO=${euCoveredHsfo.toFixed(2)}t, VLSFO=${euCoveredVlsfo.toFixed(2)}t, LSMGO=${euCoveredLsmgo.toFixed(2)}t
    EU CO₂ from fuel = (${euCoveredHsfo.toFixed(2)}×${CO2_EMISSION_FACTORS.hsfo}) + (${euCoveredVlsfo.toFixed(2)}×${CO2_EMISSION_FACTORS.vlsfo}) + (${euCoveredLsmgo.toFixed(2)}×${CO2_EMISSION_FACTORS.lsmgo}) = ${euCo2FromFuel.toFixed(2)} mt
    Chargeable CO₂ EUA = ${euCo2FromFuel.toFixed(2)} × ${phaseInPercentage} (phase-in) = ${totalChargeableCo2.toFixed(2)} mt
    ETS Cost = ${totalChargeableCo2.toFixed(2)} × $${euEtsPriceEff} = $${etsCost.toFixed(2)}`);
    
    // Total CO2 cost (all CO2 × price)
    const totalCo2Cost = totalCo2 * (bunker.euEtsPrice || 0);
    
    // EUA CO2 cost = chargeable CO2 × price
    const euaCo2Cost = etsCost;
    
    // EUA Freight Impact = ETS cost / cargo quantity
    const euaFreightImpact = cargo.quantity > 0 ? euaCo2Cost / cargo.quantity : 0;
    
    // FuelEU Maritime penalties (applied to EU-covered fuel only)
    const fuelEuResult = calculateFuelEuPenalty(
      euCoveredFuel,
      bunker?.rewardFactor ?? 1.0
    );
    
    // Regulatory cost adjustments — add to voyage costs excl hire so P&L reflects them
    let regulatoryCost = 0;
    if (inputs.applyEuaImpact) regulatoryCost += euaCo2Cost;
    if (inputs.applyFuelEuImpact) regulatoryCost += fuelEuResult.totalPenalty;
    if (inputs.applyUkEtsImpact) regulatoryCost += ukEtsCost;

    const adjustedVoyageCostExclHire = voyageCostExclHire + regulatoryCost;
    const adjustedVoyageCostInclHire = voyageCostInclHire + regulatoryCost;

    // Recalculate financials with regulatory costs
    // Demurrage/Despatch already included in Gross Freight → omit here.
    const adjustedVoyageResult = netFreight - (totalVoyageCosts + regulatoryCost);
    const adjustedPAndL = adjustedVoyageResult - hireCost;
    const adjustedNtce = totalVoyageDays > 0
      ? (netFreight - (totalVoyageCosts + regulatoryCost)) / totalVoyageDays
      : 0;
    const adjustedGtce = tcCommissionPct < 1 ? adjustedNtce / (1 - tcCommissionPct) : 0;
    const adjustedTce = adjustedGtce;
    const voyageCommissionPct2 = cargo.voyageCommission / 100;
    // Gross Rate (spec): Net Rate / (1 − Voy Commission %) where Net Rate = freight rate × (1 − voy comm) − total voyage P&L / cargo qty
    const grossRateFreightRate =
      cargo.rateType === "lumpsum"
        ? (cargo.quantity > 0 ? (cargo.rate || 0) / cargo.quantity : 0)
        : (cargo.rate || 0);
    const netRateAfterPnl =
      grossRateFreightRate * (1 - voyageCommissionPct2) -
      adjustedPAndL / cargo.quantity;
    const adjustedGrossRate =
      cargo.quantity > 0 && voyageCommissionPct2 < 1
        ? Math.max(0, netRateAfterPnl / (1 - voyageCommissionPct2))
        : 0;


    vlog(`\n[Step 13] REGULATORY COSTS & FUEL EU:
    FuelEU Costs: HSFO=$${fuelEuResult.fuels.hsfo.cost.toFixed(2)}, VLSFO=$${fuelEuResult.fuels.vlsfo.cost.toFixed(2)}, LSMGO=$${fuelEuResult.fuels.lsmgo.cost.toFixed(2)}
    FuelEU Total: $${fuelEuResult.totalPenalty.toFixed(2)}`);
    
    // Validate emission inputs
    const validation = validateEmissionInputs(
      fuelConsumption,
      vessel.dwt,
      totalDistance + totalEcaDistance,
      cargo.quantity,
      Math.max(bunker.euEtsPrice || 0, bunker.ukEtsPrice || 0)
    );

    // ============================================
    // PER-CARGO BREAKDOWN (route-bounded allocation)
    // ============================================
    const cargosForBreakdown = inputs.cargos || [];
    const perCargoBreakdown: PerCargoBreakdown[] = [];
    let repositioningCost = 0;

    // Per-leg cost vector (bunker + port DA) used for route-bounded allocation.
    // Bunker per leg = total bunker cost prorated by leg's share of total active days
    // (sea time + port time). Repositioning legs are tracked separately.
    const legActiveDays: number[] = sequence.map(
      (leg) => (leg.seaTime || 0) + (leg.portDays || 0),
    );
    const totalActiveDays = legActiveDays.reduce((s, v) => s + v, 0) || 1;
    const legBunker: number[] = legActiveDays.map(
      (d) => (totalBunkerCost * d) / totalActiveDays,
    );
    const legPort: number[] = sequence.map((leg) => leg.expDa || 0);
    const isReposLeg = (leg: SequenceRow) =>
      (leg.type || "").toLowerCase() === "repos";

    // Sum cost for repos legs (excluded from any cargo allocation).
    sequence.forEach((leg, idx) => {
      if (isReposLeg(leg)) {
        repositioningCost += legBunker[idx] + legPort[idx];
      }
    });

    if (cargosForBreakdown.length > 0) {
      // ──────────────────────────────────────────────────────────────────
      // MULTI-CARGO GROSS RATE — TON-MILE SHARE ALLOCATION (spec)
      //   1. Direct port costs (load/discharge of a cargo) → 100% to that cargo.
      //   2. Shared port costs (bunker / passing / waiting / intermediate calls)
      //      → ton-mile share.
      //   3. Repositioning legs (no cargo on board) → allocated to the
      //      cargo(es) that "caused" them, split by loading qty.
      //   4. Bunker / Hire / Misc / Canal → ton-mile share.
      //   5. Net Rate  = Allocated Total / Qty
      //      Gross Rate = Net Rate / (1 − Voy Commission %)
      // ──────────────────────────────────────────────────────────────────
      const usesExplicitMapping = sequence.some(
        (leg) => (leg.assignedCargoIds || []).length > 0,
      );

      const loadIdxsAll: number[] = [];
      const dischIdxsAll: number[] = [];
      sequence.forEach((leg, idx) => {
        const op = (leg.operation || "").toLowerCase();
        if (op.startsWith("load")) loadIdxsAll.push(idx);
        else if (op.startsWith("disch")) dischIdxsAll.push(idx);
      });

      // Returns row indices assigned to a cargo for a given op-class (load/disch).
      const idxsForCargo = (
        cargoId: number,
        ci: number,
        op: "load" | "disch",
      ): number[] => {
        const pool = op === "load" ? loadIdxsAll : dischIdxsAll;
        // Single cargo: all load/discharge rows belong to it.
        if (cargosForBreakdown.length === 1) return pool;
        if (usesExplicitMapping) {
          return pool.filter((idx) =>
            (sequence[idx].assignedCargoIds || []).includes(cargoId),
          );
        }
        // Auto: 1-to-1 by order; cargo ci ↔ pool[ci]
        return ci < pool.length ? [pool[ci]] : [];
      };

      // Per-cargo load/disch indices and loaded qty.
      const cargoLoadIdxs: number[][] = cargosForBreakdown.map((c, ci) =>
        idxsForCargo(c.id, ci, "load"),
      );
      const cargoDischIdxs: number[][] = cargosForBreakdown.map((c, ci) =>
        idxsForCargo(c.id, ci, "disch"),
      );
      const loadedQtyPerCargo: number[] = cargoLoadIdxs.map((idxs) =>
        idxs.reduce((s, i) => s + (sequence[i]?.quantity || 0), 0),
      );
      const totalLoadedQty = loadedQtyPerCargo.reduce((s, v) => s + v, 0);

      // First load / last discharge index per cargo — defines on-board window
      // for sea legs.  Sail leg `i` carries cargo c if firstLoad(c) < i ≤ lastDisch(c).
      const firstLoad: number[] = cargoLoadIdxs.map((idxs) =>
        idxs.length ? Math.min(...idxs) : -1,
      );
      const lastDisch: number[] = cargoDischIdxs.map((idxs) =>
        idxs.length ? Math.max(...idxs) : -1,
      );

      // ── Cargo distance per cargo ──
      // Step A: for each sea leg, find the set of cargoes onboard.
      //         Each onboard cargo claims the full leg distance.
      // Step B: ballast legs (no cargo onboard) are allocated to "next loading
      //         cargo(es)" by load qty; trailing ballast (no future load) goes
      //         to "previous discharge cargo(es)".
      const cargoDistance: number[] = cargosForBreakdown.map(() => 0);
      const ballastQtyShareCache = new Map<number, Map<number, number>>(); // legIdx → cargoIdx → share

      const findNextLoadingCargoes = (afterIdx: number): number[] => {
        const next: number[] = [];
        for (let ci = 0; ci < cargosForBreakdown.length; ci++) {
          if (firstLoad[ci] > afterIdx) next.push(ci);
        }
        if (next.length === 0) return [];
        // Group by the EARLIEST upcoming load index — only cargoes loaded at
        // the very next loading event "caused" this repositioning.
        const minLoad = Math.min(...next.map((ci) => firstLoad[ci]));
        return next.filter((ci) => firstLoad[ci] === minLoad);
      };
      const findPrevDischargeCargoes = (beforeIdx: number): number[] => {
        const prev: number[] = [];
        for (let ci = 0; ci < cargosForBreakdown.length; ci++) {
          if (lastDisch[ci] !== -1 && lastDisch[ci] < beforeIdx) prev.push(ci);
        }
        if (prev.length === 0) return [];
        const maxD = Math.max(...prev.map((ci) => lastDisch[ci]));
        return prev.filter((ci) => lastDisch[ci] === maxD);
      };

      sequence.forEach((leg, idx) => {
        const dist = leg.distance || 0;
        if (dist <= 0) return;
        // Onboard cargoes on the sail leading to row `idx`.
        const onboard: number[] = [];
        cargosForBreakdown.forEach((_c, ci) => {
          if (
            firstLoad[ci] !== -1 &&
            lastDisch[ci] !== -1 &&
            firstLoad[ci] < idx &&
            idx <= lastDisch[ci]
          ) {
            onboard.push(ci);
          }
        });
        if (onboard.length > 0) {
          onboard.forEach((ci) => (cargoDistance[ci] += dist));
          return;
        }
        // Ballast / repositioning leg → allocate distance by load-qty share
        // to the next loading cargo(es); fall back to previous-discharge if at
        // tail of voyage.
        let targets = findNextLoadingCargoes(idx);
        if (targets.length === 0) targets = findPrevDischargeCargoes(idx);
        if (targets.length === 0) return;
        const sumQty = targets.reduce(
          (s, ci) => s + (loadedQtyPerCargo[ci] || 0),
          0,
        );
        const legShares = new Map<number, number>();
        targets.forEach((ci) => {
          const w =
            sumQty > 0
              ? (loadedQtyPerCargo[ci] || 0) / sumQty
              : 1 / targets.length;
          cargoDistance[ci] += dist * w;
          legShares.set(ci, w);
        });
        ballastQtyShareCache.set(idx, legShares);
      });

      // ── Ton miles ──
      const cargoTonMiles: number[] = cargosForBreakdown.map(
        (_c, ci) => (loadedQtyPerCargo[ci] || 0) * cargoDistance[ci],
      );
      const totalTonMiles = cargoTonMiles.reduce((s, v) => s + v, 0);
      const tmShare = (ci: number) =>
        totalTonMiles > 0
          ? cargoTonMiles[ci] / totalTonMiles
          : totalLoadedQty > 0
          ? (loadedQtyPerCargo[ci] || 0) / totalLoadedQty
          : 1 / cargosForBreakdown.length;

      // ── Direct vs shared port cost split ──
      // A port is "direct" if it is a load/discharge row mapped to a cargo;
      // every other row's port DA is "shared".
      const rowCargoId = new Map<number, number>(); // rowIdx → cargoIdx
      cargosForBreakdown.forEach((_c, ci) => {
        cargoLoadIdxs[ci].forEach((idx) => rowCargoId.set(idx, ci));
        cargoDischIdxs[ci].forEach((idx) => rowCargoId.set(idx, ci));
      });
      let totalSharedPortCost = 0;
      const directPortCostPerCargo: number[] = cargosForBreakdown.map(() => 0);
      sequence.forEach((leg, idx) => {
        const da = leg.expDa || 0;
        if (da <= 0) return;
        if (rowCargoId.has(idx)) {
          directPortCostPerCargo[rowCargoId.get(idx)!] += da;
        } else {
          totalSharedPortCost += da;
        }
      });

      // ── Repositioning bunker cost (ballast legs' bunker portion) ──
      // Pulled out of the shared bunker pool and re-allocated by load-qty share
      // to the same cargoes that "caused" the leg (mirrors distance logic).
      const reposBunkerPerCargo: number[] = cargosForBreakdown.map(() => 0);
      let reposBunkerTotal = 0;
      ballastQtyShareCache.forEach((shares, idx) => {
        const b = legBunker[idx] || 0;
        reposBunkerTotal += b;
        shares.forEach((w, ci) => {
          reposBunkerPerCargo[ci] += b * w;
        });
      });
      const sharedBunkerTotal = Math.max(0, totalBunkerCost - reposBunkerTotal);

      // Misc & canal totals (allocated entirely by ton-mile share).
      const totalMisc = miscCosts || 0;
      const totalCanal = canalCosts || 0;
      const totalHire = hireCost || 0;

      // Reset legacy repositioningCost (we now distribute it to cargoes).
      repositioningCost = reposBunkerTotal;

      cargosForBreakdown.forEach((c, ci) => {
        const label = `#${ci + 1}`;
        const loadedQty = loadedQtyPerCargo[ci] || 0;
        const share = tmShare(ci);

        const allocatedDirectPortCost = directPortCostPerCargo[ci];
        const allocatedSharedPortCost = totalSharedPortCost * share;
        const allocatedPortCosts =
          allocatedDirectPortCost + allocatedSharedPortCost;

        const allocatedSharedBunker = sharedBunkerTotal * share;
        const allocatedRepositioningCost = reposBunkerPerCargo[ci];
        const allocatedBunker =
          allocatedSharedBunker + allocatedRepositioningCost;

        const allocatedHire = totalHire * share;
        const allocatedMisc = totalMisc * share;
        const allocatedCanal = totalCanal * share;

        const allocatedTotalCost =
          allocatedPortCosts +
          allocatedBunker +
          allocatedHire +
          allocatedMisc +
          allocatedCanal;

        const voyCommPct = (c.voyageCommission || 0) / 100;
        // Individual cargo freight — demurrage adds, despatch deducts, then
        // this cargo's own voyage commission is applied to its own gross.
        const cargoBaseFreight =
          c.rateType === "lumpsum"
            ? c.rate || 0
            : (c.rate || 0) * loadedQty;
        // Demurrage is added BEFORE commission (commissionable = base + dem);
        // despatch is deducted AFTER commission.
        const cargoCommissionable = cargoBaseFreight + (c.demurrage || 0);
        const cargoGrossFreight = cargoCommissionable - (c.despatch || 0);
        const cargoVoyCommissionAmount = cargoCommissionable * voyCommPct;
        const cargoNetFreight =
          cargoCommissionable - cargoVoyCommissionAmount - (c.despatch || 0);

        const netRate = loadedQty > 0 ? allocatedTotalCost / loadedQty : 0;

        // Per-cargo laytime outcome (demurrage is income, despatch is a cost
        // to the owner). It is NOT folded into the gross-rate calc because the
        // voyage P&L below already includes demurrage/despatch via net freight —
        // adding it here too would double-count it.
        const cargoDemurrage = c.demurrage || 0;
        const cargoDespatch = c.despatch || 0;
        // Gross Rate (spec): Net Rate / (1 − Voy Commission %) where Net Rate = own freight rate × (1 − voy comm) − TOTAL voyage P&L / own qty
        const cargoFreightRate =
          c.rateType === "lumpsum"
            ? (loadedQty > 0 ? (c.rate || 0) / loadedQty : 0)
            : (c.rate || 0);
        const netRateAfterPnl =
          cargoFreightRate * (1 - voyCommPct) -
          adjustedPAndL / loadedQty;
        const grossRate =
          loadedQty > 0 && voyCommPct < 1
            ? Math.max(0, netRateAfterPnl / (1 - voyCommPct))
            : 0;


        perCargoBreakdown.push({
          cargoId: c.id,
          cargoLabel: label,
          loadedQty,
          grossFreight: cargoGrossFreight,
          voyageCommissionAmount: cargoVoyCommissionAmount,
          netFreight: cargoNetFreight,
          share,

          extraDays: c.extraDays || 0,
          demurrage: cargoDemurrage,
          despatch: cargoDespatch,
          allocatedBunker,
          allocatedPortCosts,
          allocatedVoyageCosts: allocatedBunker + allocatedPortCosts,
          allocatedHire,
          grossRate,
          routeStartIdx: firstLoad[ci],
          routeEndIdx: lastDisch[ci],
          cargoDistanceNm: cargoDistance[ci],
          cargoTonMiles: cargoTonMiles[ci],
          tonMileShare: share,
          allocatedDirectPortCost,
          allocatedSharedPortCost,
          allocatedMiscCost: allocatedMisc,
          allocatedCanalCost: allocatedCanal,
          allocatedRepositioningCost,
          allocatedTotalCost,
          netRate,
          voyageCommissionPct: c.voyageCommission || 0,
        });
      });
    }

    const result = {
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
      effectiveFuelPrices: { hsfo: hsfoPrice, vlsfo: vlsfoPrice, lsmgo: lsmgoPrice },
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
      totalVoyageCosts: totalVoyageCosts + regulatoryCost,
      hireCost,
      voyageCostInclHire: adjustedVoyageCostInclHire,
      voyageCostExclHire: adjustedVoyageCostExclHire,
      grossProfit: adjustedVoyageResult,
      netProfit: adjustedVoyageResult,
      tce: adjustedTce,
      ntce: adjustedNtce,
      gtce: adjustedGtce,
      pAndL: adjustedPAndL,
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
      transportWork,
      grossRate: adjustedGrossRate,
      // EU-covered fuel & FuelEU
      euCoveredFuel,
      totalCo2Cost,
      euaCo2Cost,
      euaFreightImpact,
      fuelEuResult,
      fuelEuTotalPenalty: fuelEuResult.totalPenalty,
      fuelEuFreightImpact: cargo.quantity > 0 ? fuelEuResult.totalPenalty / cargo.quantity : 0,
      etsLegDetails,
      perCargoBreakdown,
      repositioningCost,
      // UK ETS
      ukEtsResult,
      ukEtsCost,
      ukChargeableCo2,
      ukEtsVoyageCoverage: ukVoyageCoverage,
      ukEtsPhaseIn: ukPhaseIn,
      ukEtsFreightImpact: cargo.quantity > 0 ? ukEtsCost / cargo.quantity : 0,
    };

    // Final compact summary table — easy to scan in DevTools.
    vlogEnd({
      vessel: vessel.name,
      totalDistance,
      totalSeaDays,
      totalPortDays,
      totalVoyageDays,
      hsfo: hsfoConsumption,
      vlsfo: vlsfoConsumption,
      lsmgo: lsmgoConsumption,
      bunkerCost: totalBunkerCost,
      grossFreight,
      netFreight,
      hireCost,
      totalVoyageCosts: totalVoyageCosts + regulatoryCost,
      pAndL: adjustedPAndL,
      tce: adjustedTce,
      totalCo2,
      ciiRating,
      etsCost: etsResult.etsCost,
      fuelEuCost: fuelEuResult.totalPenalty,
    });

    // Inspector hook: in the browser console try `__voyage.result.tce` etc.
    exposeVoyageDebug({ inputs, result });

    return result;
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
