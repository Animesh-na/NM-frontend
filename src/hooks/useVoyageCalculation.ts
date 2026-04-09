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
  // Port fuel type selection
  portFuelType?: "hsfo" | "vlsfo" | "lsmgo";
  // EU/EEA flag from port API
  isEuEea?: boolean;
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
  netBB?: number; // Net Ballast Bonus (lumpsum added to hire)
  misc?: MiscCostsData;
  extraTime?: ExtraTimeData;
  applyEuaImpact?: boolean;
  applyFuelEuImpact?: boolean;
}

// Per-leg ETS detail for UI breakdown table
export interface EtsLegDetail {
  legIndex: number;
  originPort: string;
  originUnloc: string;
  originIsEu: boolean;
  destPort: string;
  destUnloc: string;
  destIsEu: boolean;
  coveragePct: number; // 0, 50, or 100
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
  
  // Validation
  emissionWarnings: string[];
  emissionErrors: string[];
  
  // Laden distance (for EFOI)
  ladenDistance: number;
  
  // Gross Rate (voyage cost incl hire / load qty, grossed up by voyage commission)
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
    const hasScrubber = vessel.hasScrubber === true;
    let cargoOnBoard = 0;

    console.log(`\n========== VOYAGE CALCULATION START ==========`);
    console.log(`[Input] Vessel: ${vessel.name}, DWT: ${vessel.dwt}, Speed Profile: ${vessel.speedProfile}`);
    console.log(`[Input] Hire Rate: $${hireRate}/day`);
    console.log(`[Input] Cargo: rate=${cargo.rate} ${cargo.rateType}, qty=${cargo.quantity}, voyComm=${cargo.voyageCommission}%, tcComm=${cargo.tcCommission}%`);
    console.log(`[Input] Bunker Prices: HSFO=$${bunker.hsfo.price}, VLSFO=$${bunker.vlsfo.price}, LSMGO=$${bunker.lsmgo.price}, CO2=$${bunker.co2Price}`);
    console.log(`[Input] Reward Factor: ${bunker?.rewardFactor ?? 1.0}`);

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
      
      console.log(`\n[Step 1] Leg ${leg.id} - "${leg.operation}" at ${leg.port}:
    distance=${leg.distance} nm, ecaDistance=${leg.ecaDistance} nm
    portDays=${leg.portDays} d, expDa=$${leg.expDa}
    seaTime=${legSeaTime} d (total with margin)
    ecaTime=${legEcaTime} d, nonEcaTime=${legNonEcaTime} d
    cargoOnBoardBefore=${cargoOnBoard} mt, portQty=${legQuantity} mt → assigned as ${legIsLaden ? 'LADEN' : 'BALLAST'} leg`);
      if (legIsLaden) {
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

      // Port time breakdown
      const turnExtraDays = ((leg.turnTimeHours || 0) + (leg.extraTimeHours || 0)) / 24;
      const workingDays = Math.max(0, (leg.portDays || 0) - turnExtraDays);
      
      console.log(`    Port breakdown: turnTimeHrs=${leg.turnTimeHours || 0}, extraTimeHrs=${leg.extraTimeHours || 0} → turnExtraDays=${turnExtraDays}, workingDays=${workingDays}`);
      
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
        idleDays += turnExtraDays;
        addPortDays(workingDays, turnExtraDays);
        console.log(`    → LOADING (${legPortFuel}): workingDays=${workingDays} added to loadingDays, turnExtra=${turnExtraDays} added to idleDays`);
      } else if (operation === "disch" || operation === "discharging") {
        dischargingDays += workingDays;
        idleDays += turnExtraDays;
        addDischDays(workingDays, turnExtraDays);
        console.log(`    → DISCHARGING (${legPortFuel}): workingDays=${workingDays} added to dischargingDays, turnExtra=${turnExtraDays} added to idleDays`);
      } else if (operation === "waiting" || operation === "idle") {
        idleDays += leg.portDays || 0;
        addIdleDays(leg.portDays || 0);
        console.log(`    → IDLE/WAITING (${legPortFuel}): ${leg.portDays} days added to idleDays`);
      } else if (operation === "bunkering") {
        bunkeringDays += leg.portDays || 0;
        addBunkeringDays(leg.portDays || 0);
        console.log(`    → BUNKERING (${legPortFuel}): ${leg.portDays} days added to bunkeringDays`);
      } else if (leg.portDays > 0) {
        idleDays += leg.portDays || 0;
        addIdleDays(leg.portDays || 0);
        console.log(`    → OTHER (${legPortFuel}) with port time: ${leg.portDays} days added to idleDays`);
      }

      if (operation === "load" || operation === "loading") {
        cargoOnBoard += legQuantity;
      } else if (operation === "disch" || operation === "discharging") {
        cargoOnBoard = Math.max(0, cargoOnBoard - legQuantity);
      }

      console.log(`    cargoOnBoardAfter=${cargoOnBoard} mt`);
    });

    console.log(`\n[Step 1 Summary] After sequence loop:
    totalDistance=${totalDistance} nm, totalEcaDistance=${totalEcaDistance} nm
    seaDaysBallast=${seaDaysBallast.toFixed(4)} d, seaDaysLaden=${seaDaysLaden.toFixed(4)} d
    ecaSeaDaysBallast=${ecaSeaDaysBallast.toFixed(4)}, ecaSeaDaysLaden=${ecaSeaDaysLaden.toFixed(4)}
    nonEcaSeaDaysBallast=${nonEcaSeaDaysBallast.toFixed(4)}, nonEcaSeaDaysLaden=${nonEcaSeaDaysLaden.toFixed(4)}
    totalPortDays=${totalPortDays.toFixed(4)} d, portCosts=$${portCosts}
    loadingDays=${loadingDays.toFixed(4)}, dischargingDays=${dischargingDays.toFixed(4)}, idleDays=${idleDays.toFixed(4)}, bunkeringDays=${bunkeringDays.toFixed(4)}
    ballastDistance=${ballastDistance} nm, ladenDistance=${ladenDistance} nm
    totalBaseSeaTime=${totalBaseSeaTime.toFixed(4)}, totalSeaMarginTime=${totalSeaMarginTime.toFixed(4)}`);

    // 2. Calculate extra time (from misc section) - convert to days
    const extraSeaDays = extraTime?.atSeaDays || 0;
    const extraPortDays = extraTime?.idlePortDays || 0;
    const extraCanalDays = (extraTime?.canal1Days || 0) + (extraTime?.canal2Days || 0);

    // 3. Total sea days = sum of all leg sea times (already includes sea margin) + extra sea days
    const totalSeaDays = seaDaysBallast + seaDaysLaden + extraSeaDays;
    
    // Total voyage days includes all extra time
    const totalVoyageDays = totalSeaDays + totalPortDays + extraPortDays + extraCanalDays;

    console.log(`\n[Step 2-3] Extra & Total Time:
    extraSeaDays=${extraSeaDays}, extraPortDays=${extraPortDays}, extraCanalDays=${extraCanalDays}
    totalSeaDays = seaDaysBallast(${seaDaysBallast.toFixed(4)}) + seaDaysLaden(${seaDaysLaden.toFixed(4)}) + extraSea(${extraSeaDays}) = ${totalSeaDays.toFixed(4)}
    totalVoyageDays = totalSea(${totalSeaDays.toFixed(4)}) + totalPort(${totalPortDays.toFixed(4)}) + extraPort(${extraPortDays}) + extraCanal(${extraCanalDays}) = ${totalVoyageDays.toFixed(4)}`);

    // ============================================
    // 4. BUNKER CONSUMPTION CALCULATION (AXS Marine Model)
    // Consumption = Daily Rate × Time × Reward Factor
    // ============================================
    
    // Get the appropriate consumption profile based on vessel speed profile
    const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
    
    // Reward factor adjusts consumption (wind-assisted propulsion, etc.)
    const rewardFactor = bunker?.rewardFactor ?? 1.0;
    
    // --- Sea Consumption (Ballast + Laden) split by ECA / Non-ECA ---
    // SCRUBBER LOGIC:
    // - No scrubber → VLSFO only (HSFO = 0) outside ECA, LSMGO in ECA
    // - Scrubber fitted → HSFO only (VLSFO = 0) outside ECA, LSMGO in ECA
    
    const totalEcaSeaDays = ecaSeaDaysBallast + ecaSeaDaysLaden;
    const totalNonEcaSeaDays = nonEcaSeaDaysBallast + nonEcaSeaDaysLaden;
    // hasScrubber moved above sequence loop
    
    // --- Non-ECA Sea Consumption ---
    // If scrubber: use HSFO rates, VLSFO = 0
    // If no scrubber: use VLSFO rates, HSFO = 0
    const hsfoSeaBallastNonEca = hasScrubber ? nonEcaSeaDaysBallast * (profile.hsfo.ballast || vessel.consumption.hsfo.ecoBallast || 0) : 0;
    const hsfoSeaLadenNonEca = hasScrubber ? nonEcaSeaDaysLaden * (profile.hsfo.laden || vessel.consumption.hsfo.ecoLaden || 0) : 0;
    const hsfoSeaExtraNonEca = hasScrubber ? extraSeaDays * (profile.hsfo.laden || vessel.consumption.hsfo.ecoLaden || 0) : 0;
    const hsfoSeaTotal = (hsfoSeaBallastNonEca + hsfoSeaLadenNonEca + hsfoSeaExtraNonEca) * rewardFactor;
    
    const vlsfoSeaBallastNonEca = !hasScrubber ? nonEcaSeaDaysBallast * (profile.vlsfo.ballast || vessel.consumption.vlsfo.ecoBallast || 0) : 0;
    const vlsfoSeaLadenNonEca = !hasScrubber ? nonEcaSeaDaysLaden * (profile.vlsfo.laden || vessel.consumption.vlsfo.ecoLaden || 0) : 0;
    const vlsfoSeaExtraNonEca = !hasScrubber ? extraSeaDays * (profile.vlsfo.laden || vessel.consumption.vlsfo.ecoLaden || 0) : 0;
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
    
    // Canal consumption — uses scrubber default fuel, no per-leg override
    const totalCanalDays = canalDays + extraCanalDays;
    const hsfoCanal = hasScrubber ? totalCanalDays * (profile.hsfo.canal || 0) : 0;
    const vlsfoCanal = !hasScrubber ? totalCanalDays * (profile.vlsfo.canal || 0) : 0;
    const lsmgoCanal = 0; // LSMGO canal only via AE, not ME
    
    // --- AE (Auxiliary Engine) Consumption ---
    // If scrubber fitted → use aeScrubber rates; otherwise → use ae rates
    // AE always runs on LSMGO across ALL operations EXCEPT canal
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
    
    // Canal: AE is NOT used during canal transit
    const aeCanalConsumption = 0;
    
    // Total AE contribution to LSMGO = sea + port (no canal)
    const lsmgoAeTotal = aeSeaConsumption + aePortConsumption;
    
    // --- Total Fuel Consumption ---
    const hsfoConsumption = hsfoSeaTotal + hsfoLoading + hsfoDischarging + hsfoIdle + hsfoCanal;
    const vlsfoConsumption = vlsfoSeaTotal + vlsfoLoading + vlsfoDischarging + vlsfoIdle + vlsfoCanal;
    const lsmgoConsumption = lsmgoSeaTotal + lsmgoLoading + lsmgoDischarging + lsmgoIdle + lsmgoCanal + lsmgoAeTotal;

    console.log(`\n[Step 4] BUNKER CONSUMPTION (profile: ${vessel.speedProfile}, rewardFactor: ${rewardFactor}):
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
    
    const hsfoPrice = bunker.hsfo.price || 0;
    const vlsfoPrice = bunker.vlsfo.price || 0;
    const lsmgoPrice = bunker.lsmgo.price || 0;
    
    const hsfoCost = hsfoConsumption * hsfoPrice;
    const vlsfoCost = vlsfoConsumption * vlsfoPrice;
    const lsmgoCost = lsmgoConsumption * lsmgoPrice;
    const totalBunkerCost = hsfoCost + vlsfoCost + lsmgoCost;

    console.log(`\n[Step 5] BUNKER COSTS:
    HSFO: ${hsfoConsumption} mt × $${hsfoPrice} = $${hsfoCost}
    VLSFO: ${vlsfoConsumption} mt × $${vlsfoPrice} = $${vlsfoCost}
    LSMGO: ${lsmgoConsumption} mt × $${lsmgoPrice} = $${lsmgoCost}
    Total Bunker Cost = $${totalBunkerCost}`);

    // 6. Calculate freight and revenue
    let grossFreight = 0;
    if (cargo.rateType === "lumpsum") {
      grossFreight = cargo.rate;
    } else {
      grossFreight = cargo.rate * cargo.quantity;
    }

    const voyageCommission = grossFreight * (cargo.voyageCommission / 100);
    const netFreight = grossFreight - voyageCommission;

    console.log(`\n[Step 6] FREIGHT & REVENUE:
    Gross Freight: ${cargo.rateType === 'lumpsum' ? `lumpsum $${cargo.rate}` : `$${cargo.rate}/mt × ${cargo.quantity} mt`} = $${grossFreight}
    Voyage Commission: $${grossFreight} × ${cargo.voyageCommission}% = $${voyageCommission}
    Net Freight: $${grossFreight} - $${voyageCommission} = $${netFreight}`);

    // 7. Calculate misc costs
    const miscCosts = (misc?.miscCost || 0) + (misc?.extraFees || 0) + (misc?.extraInsurance || 0);
    const canalCosts = (misc?.canalCost1 || 0) + (misc?.canalCost2 || 0);

    console.log(`\n[Step 7] MISC COSTS:
    Misc: miscCost=$${misc?.miscCost || 0} + extraFees=$${misc?.extraFees || 0} + extraInsurance=$${misc?.extraInsurance || 0} = $${miscCosts}
    Canal: canal1=$${misc?.canalCost1 || 0} + canal2=$${misc?.canalCost2 || 0} = $${canalCosts}`);

    // 8. Total voyage costs (Bunker + Port + Canal + Misc — NO commissions mixed in)
    const totalVoyageCosts = totalBunkerCost + portCosts + miscCosts + canalCosts;
    
    console.log(`\n[Step 8] TOTAL VOYAGE COSTS:
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

    console.log(`\n[Step 9] HIRE CALCULATIONS:
    Gross Hire Rate: $${grossHireRate}/day
    Net BB: $${netBBValue}
    TC Commission: ${cargo.tcCommission}% → Net Hire Rate: $${grossHireRate} × (1 - ${tcCommissionPct}) = $${netHireRate}/day
    Hire Cost: $${grossHireRate} × ${totalVoyageDays} days + NetBB($${netBBValue}) = $${hireCost}
    Net Hire Cost: $${netHireRate} × ${totalVoyageDays} + NetBB($${netBBValue}) = $${netHireCost}
    TC Commission Amount: ($${grossHireRate} × ${totalVoyageDays}) × ${tcCommissionPct} = $${tcCommissionAmount}
    Voyage Cost incl Hire: $${totalVoyageCosts} + $${hireCost} = $${voyageCostInclHire}
    Voyage Cost excl Hire: $${voyageCostExclHire}`);

    // 10. Profitability calculations
    const voyageResult = netFreight - totalVoyageCosts + cargo.demurrage - cargo.despatch;
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

    console.log(`\n[Step 10] PROFITABILITY:
    Voyage Result = NetFreight($${netFreight}) - VoyageCosts($${totalVoyageCosts}) + Demurrage($${cargo.demurrage}) - Despatch($${cargo.despatch}) = $${voyageResult}
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
    const efoiResult = calculateEfoi(totalCo2, cargo.quantity, ladenDistance);
    const efoi = efoiResult.efoi;

    // Build voyage legs for ETS calculation using is_eu_eea port flag
    // Each port's isEuEea flag determines if it's an EU/EEA port
    const voyageLegs: Array<{ originUnloc: string; destinationUnloc: string; co2: number }> = [];
    const legCoverages: number[] = []; // Store per-leg EU coverage
    let previousPort = '';
    let previousIsEuEea = false; // EU/EEA flag of the origin port
    
    sequence.forEach((leg) => {
      if (leg.portUnloc) {
        const currentIsEuEea = leg.isEuEea === true;
        
        if (previousPort) {
          // Normal segment: previousPort → currentPort
          const legSeaTime = leg.seaTime || 0;
          const legCo2 = totalSeaDays > 0 ? totalCo2 * (legSeaTime / totalSeaDays) : 0;
          
          let coverage = 0;
          if (previousIsEuEea && currentIsEuEea) {
            coverage = 1.0;
          } else if (previousIsEuEea || currentIsEuEea) {
            coverage = 0.5;
          }
          
          voyageLegs.push({
            originUnloc: previousPort,
            destinationUnloc: leg.portUnloc,
            co2: legCo2,
          });
          legCoverages.push(coverage);
        } else {
          // First segment: use current port + next port to determine both endpoints
          const nextLeg = sequence.find((s, si) => si > sequence.indexOf(leg) && s.portUnloc);
          const nextIsEuEea = nextLeg?.isEuEea === true;
          const legSeaTime = leg.seaTime || 0;
          const legCo2 = totalSeaDays > 0 ? totalCo2 * (legSeaTime / totalSeaDays) : 0;
          
          let coverage = 0;
          if (currentIsEuEea && nextIsEuEea) {
            coverage = 1.0;
          } else if (currentIsEuEea || nextIsEuEea) {
            coverage = 0.5;
          }
          
          if (legSeaTime > 0) {
            voyageLegs.push({
              originUnloc: leg.portUnloc,
              destinationUnloc: nextLeg?.portUnloc || leg.portUnloc,
              co2: legCo2,
            });
            legCoverages.push(coverage);
          }
        }
        
        previousPort = leg.portUnloc;
        previousIsEuEea = currentIsEuEea;
      }
    });

    // Store leg-level EU coverage info for breakdown display
    const phaseInPercentage = getEtsPhaseInPercentage();
    const etsLegBreakdown: EtsResult['legBreakdown'] = [];
    
    voyageLegs.forEach((leg, i) => {
      const coverage = legCoverages[i] || 0;
      // Per-leg CO2 stored for informational breakdown only
      const chargeableCo2 = leg.co2 * coverage * phaseInPercentage;
      
      etsLegBreakdown.push({
        origin: leg.originUnloc,
        destination: leg.destinationUnloc,
        coverage,
        co2: leg.co2,
        chargeableCo2,
      });
    });

    const etsVoyageCoverage = totalCo2 > 0 && etsLegBreakdown.length > 0
      ? etsLegBreakdown.reduce((sum, leg) => sum + (leg.co2 / totalCo2) * leg.coverage, 0)
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

    console.log(`\n[Step 11] ENVIRONMENTAL METRICS:
    --- CO2 Emissions (mt) ---
    HSFO CO2: ${hsfoConsumption} mt × ${CO2_EMISSION_FACTORS.hsfo} = ${co2ByFuel.hsfo} mt CO2
    VLSFO CO2: ${vlsfoConsumption} mt × ${CO2_EMISSION_FACTORS.vlsfo} = ${co2ByFuel.vlsfo} mt CO2
    LSMGO CO2: ${lsmgoConsumption} mt × ${CO2_EMISSION_FACTORS.lsmgo} = ${co2ByFuel.lsmgo} mt CO2
    Total CO2 = ${totalCo2} mt
    Non-ECA CO2 = ${nonEcaCo2} mt, ECA CO2 = ${ecaCo2} mt
    CO2 Ballast = totalCO2(${totalCo2}) × ballastDays(${seaDaysBallast})/totalSeaDays(${totalSeaDays}) = ${co2Ballast} mt
    CO2 Laden = totalCO2(${totalCo2}) × ladenDays(${seaDaysLaden})/totalSeaDays(${totalSeaDays}) = ${co2Laden} mt
    
    --- EFOI ---
    EFOI = totalCO2(${totalCo2}) × 1000000 / (cargo(${cargo.quantity}) × ladenDist(${ladenDistance})) = ${efoi} gCO2/tnm
    
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
    
    {
      let prevIsEuEea = false;
      let prevPortUnloc = '';
      let prevPortName = '';
      let segCargoOnBoard = 0;
      let legIdx = 0;
      
      // Track weighted EU coverage for extra sea days (from misc section)
      let totalSeaTimeInSegments = 0;
      let weightedEuSeaFactor = 0;
      
      console.log(`\n[EU ETS] Sequence isEuEea flags:`, sequence.map(s => ({ port: s.port, isEuEea: s.isEuEea })));
      
      sequence.forEach((leg) => {
        const legOperation = (leg.operation || '').toLowerCase();
        const legQty = Math.max(0, leg.quantity || 0);
        const legIsLaden = segCargoOnBoard > 0;
        
        // Per-leg fuel accumulators
        let legSeaHsfo = 0, legSeaVlsfo = 0, legSeaLsmgo = 0;
        let legPortHsfo = 0, legPortVlsfo = 0, legPortLsmgo = 0;
        let legChargeHsfo = 0, legChargeVlsfo = 0, legChargeLsmgo = 0;
        let seaEuFactor = 0;
        let originPortName = prevPortName;
        let originUnloc = prevPortUnloc;
        let originIsEu = prevIsEuEea;
        
        // ── 1. SEA FUEL for this segment ──
        if (leg.portUnloc) {
          const currentIsEuEea = leg.isEuEea === true;
          if (!prevPortUnloc) {
            const nextLeg = sequence.find((s, si) => si > sequence.indexOf(leg) && s.portUnloc);
            const nextIsEuEea = nextLeg?.isEuEea === true;
            if (currentIsEuEea && nextIsEuEea) {
              seaEuFactor = 1.0;
            } else if (currentIsEuEea || nextIsEuEea) {
              seaEuFactor = 0.5;
            }
            originPortName = leg.port;
            originUnloc = leg.portUnloc;
            originIsEu = currentIsEuEea;
          } else if (prevIsEuEea && currentIsEuEea) {
            seaEuFactor = 1.0;
          } else if (prevIsEuEea || currentIsEuEea) {
            seaEuFactor = 0.5;
          }
          
          const legSeaTimeTotal = leg.seaTime || 0;
          totalSeaTimeInSegments += legSeaTimeTotal;
          weightedEuSeaFactor += legSeaTimeTotal * seaEuFactor;
          
          // Calculate total sea fuel for this leg (regardless of EU factor)
          const legNonEcaTime = leg.nonEcaTime || ((leg.seaTime || 0) - (leg.ecaTime || 0));
          const legEcaTime = leg.ecaTime || 0;
          
          if (hasScrubber) {
            const rate = legIsLaden ? (profile.hsfo.laden || 0) : (profile.hsfo.ballast || 0);
            legSeaHsfo = legNonEcaTime * rate * rewardFactor;
          } else {
            const rate = legIsLaden ? (profile.vlsfo.laden || 0) : (profile.vlsfo.ballast || 0);
            legSeaVlsfo = legNonEcaTime * rate * rewardFactor;
          }
          
          const ecaRate = legIsLaden ? (profile.lsmgo.laden || 0) : (profile.lsmgo.ballast || 0);
          const segLsmgoEca = legEcaTime * ecaRate * rewardFactor;
          
          const aeRates = hasScrubber ? profile.aeScrubber : profile.ae;
          const aeRate = legIsLaden ? (aeRates.laden || 0) : (aeRates.ballast || 0);
          const segLsmgoAeSea = legSeaTimeTotal * aeRate * rewardFactor;
          
          legSeaLsmgo = segLsmgoEca + segLsmgoAeSea;
          
          // EU-chargeable sea fuel
          legChargeHsfo += legSeaHsfo * seaEuFactor;
          legChargeVlsfo += legSeaVlsfo * seaEuFactor;
          legChargeLsmgo += legSeaLsmgo * seaEuFactor;
          
          euCoveredHsfo += legSeaHsfo * seaEuFactor;
          euCoveredVlsfo += legSeaVlsfo * seaEuFactor;
          euCoveredLsmgo += legSeaLsmgo * seaEuFactor;
        }
        
        // ── 2/3/4. PORT FUEL: Working + Turn + Extra ──
        const portEuFactor = (leg.isEuEea === true) ? 1.0 : 0.0;
        
        if (leg.portUnloc && leg.portDays > 0) {
          const legPortFuel = leg.portFuelType || (hasScrubber ? 'hsfo' : 'vlsfo');
          const aeRates = hasScrubber ? profile.aeScrubber : profile.ae;
          
          const turnTimeDays = (leg.turnTimeHours || 0) / 24;
          const extraTimeDays = (leg.extraTimeHours || 0) / 24;
          const workingDaysLeg = Math.max(0, (leg.portDays || 0) - turnTimeDays - extraTimeDays);
          
          let portHsfo = 0, portVlsfo = 0, portLsmgo = 0;
          
          const addFuel = (fuelType: string, amount: number) => {
            if (fuelType === 'hsfo') portHsfo += amount;
            else if (fuelType === 'vlsfo') portVlsfo += amount;
            else portLsmgo += amount;
          };
          
          if (legOperation === 'load' || legOperation === 'loading') {
            addFuel(legPortFuel, workingDaysLeg * (profile[legPortFuel]?.load || 0));
            addFuel(legPortFuel, turnTimeDays * (profile[legPortFuel]?.idle || 0));
            addFuel(legPortFuel, extraTimeDays * (profile[legPortFuel]?.idle || 0));
            portLsmgo += workingDaysLeg * (aeRates.load || 0);
            portLsmgo += turnTimeDays * (aeRates.idle || 0);
            portLsmgo += extraTimeDays * (aeRates.idle || 0);
          } else if (legOperation === 'disch' || legOperation === 'discharging') {
            addFuel(legPortFuel, workingDaysLeg * (profile[legPortFuel]?.discharge || 0));
            addFuel(legPortFuel, turnTimeDays * (profile[legPortFuel]?.idle || 0));
            addFuel(legPortFuel, extraTimeDays * (profile[legPortFuel]?.idle || 0));
            portLsmgo += workingDaysLeg * (aeRates.discharge || 0);
            portLsmgo += turnTimeDays * (aeRates.idle || 0);
            portLsmgo += extraTimeDays * (aeRates.idle || 0);
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
          legChargeHsfo += portHsfo * portEuFactor;
          legChargeVlsfo += portVlsfo * portEuFactor;
          legChargeLsmgo += portLsmgo * portEuFactor;
          
          euCoveredHsfo += portHsfo * portEuFactor;
          euCoveredVlsfo += portVlsfo * portEuFactor;
          euCoveredLsmgo += portLsmgo * portEuFactor;
        }
        
        // Build leg detail for UI (skip first port if no sea time — it's origin only)
        const hasSeaOrPort = (leg.seaTime || 0) > 0 || (leg.portDays || 0) > 0;
        if (leg.portUnloc && hasSeaOrPort && (prevPortUnloc || (leg.seaTime || 0) > 0)) {
          const coveragePct = seaEuFactor * 100;
          let coverageLabel = '';
          if (seaEuFactor === 1.0) coverageLabel = 'EU → EU: 100%';
          else if (seaEuFactor === 0.5) {
            coverageLabel = originIsEu ? 'EU → Non-EU: 50%' : 'Non-EU → EU: 50%';
          } else coverageLabel = 'Non-EU → Non-EU: 0%';
          
          // Port coverage label
          const portLabel = (leg.isEuEea === true) ? ' | Port: EU 100%' : (leg.portDays > 0 ? ' | Port: Non-EU 0%' : '');
          
          const chargeableCo2 = 
            legChargeHsfo * CO2_EMISSION_FACTORS.hsfo +
            legChargeVlsfo * CO2_EMISSION_FACTORS.vlsfo +
            legChargeLsmgo * CO2_EMISSION_FACTORS.lsmgo;
          
          etsLegDetails.push({
            legIndex: legIdx++,
            originPort: originPortName,
            originUnloc,
            originIsEu,
            destPort: leg.port,
            destUnloc: leg.portUnloc,
            destIsEu: leg.isEuEea === true,
            coveragePct,
            coverageLabel: coverageLabel + portLabel,
            seaVlsfo: legSeaVlsfo,
            seaLsmgo: legSeaLsmgo,
            seaHsfo: legSeaHsfo,
            portVlsfo: legPortVlsfo,
            portLsmgo: legPortLsmgo,
            portHsfo: legPortHsfo,
            chargeableVlsfo: legChargeVlsfo,
            chargeableLsmgo: legChargeLsmgo,
            chargeableHsfo: legChargeHsfo,
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
        if (leg.portUnloc) {
          prevPortUnloc = leg.portUnloc;
          prevPortName = leg.port;
          prevIsEuEea = leg.isEuEea === true;
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
      
      if (extraPortDays > 0) {
        const euPortCount = sequence.filter(r => r.portUnloc && r.isEuEea === true && r.portDays > 0).length;
        const totalPortCount = sequence.filter(r => r.portUnloc && r.portDays > 0).length;
        const avgPortEuFactor = totalPortCount > 0 ? euPortCount / totalPortCount : 0;
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
    etsCost = totalChargeableCo2 * (bunker.co2Price || 0);
    
    // Finalize ETS result with bottom-up values
    etsResult = {
      totalCo2,
      etsVoyageCoverage,
      phaseInPercentage,
      chargeableCo2: totalChargeableCo2,
      etsCost,
      legBreakdown: etsLegBreakdown,
    };
    
    console.log(`\n[Step 12] CHARGEABLE CO₂ EUA (bottom-up):
    EU Fuel: HSFO=${euCoveredHsfo.toFixed(2)}t, VLSFO=${euCoveredVlsfo.toFixed(2)}t, LSMGO=${euCoveredLsmgo.toFixed(2)}t
    EU CO₂ from fuel = (${euCoveredHsfo.toFixed(2)}×${CO2_EMISSION_FACTORS.hsfo}) + (${euCoveredVlsfo.toFixed(2)}×${CO2_EMISSION_FACTORS.vlsfo}) + (${euCoveredLsmgo.toFixed(2)}×${CO2_EMISSION_FACTORS.lsmgo}) = ${euCo2FromFuel.toFixed(2)} mt
    Chargeable CO₂ EUA = ${euCo2FromFuel.toFixed(2)} × ${phaseInPercentage} (phase-in) = ${totalChargeableCo2.toFixed(2)} mt
    ETS Cost = ${totalChargeableCo2.toFixed(2)} × $${bunker.co2Price} = $${etsCost.toFixed(2)}`);
    
    // Total CO2 cost (all CO2 × price)
    const totalCo2Cost = totalCo2 * (bunker.co2Price || 0);
    
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

    const adjustedVoyageCostExclHire = voyageCostExclHire + regulatoryCost;
    const adjustedVoyageCostInclHire = voyageCostInclHire + regulatoryCost;

    // Recalculate financials with regulatory costs
    const adjustedVoyageResult = netFreight - (totalVoyageCosts + regulatoryCost) + cargo.demurrage - cargo.despatch;
    const adjustedPAndL = adjustedVoyageResult - hireCost;
    const adjustedNtce = totalVoyageDays > 0
      ? (netFreight - (totalVoyageCosts + regulatoryCost)) / totalVoyageDays
      : 0;
    const adjustedGtce = tcCommissionPct < 1 ? adjustedNtce / (1 - tcCommissionPct) : 0;
    const adjustedTce = adjustedGtce;
    const adjustedBaseRatePerMt = cargo.quantity > 0 ? adjustedVoyageCostInclHire / cargo.quantity : 0;
    const voyageCommissionPct2 = cargo.voyageCommission / 100;
    const adjustedGrossRate = voyageCommissionPct2 < 1 ? adjustedBaseRatePerMt / (1 - voyageCommissionPct2) : 0;

    console.log(`\n[Step 13] REGULATORY COSTS & FUEL EU:
    FuelEU Costs: HSFO=$${fuelEuResult.fuels.hsfo.cost.toFixed(2)}, VLSFO=$${fuelEuResult.fuels.vlsfo.cost.toFixed(2)}, LSMGO=$${fuelEuResult.fuels.lsmgo.cost.toFixed(2)}
    FuelEU Total: $${fuelEuResult.totalPenalty.toFixed(2)}`);
    
    console.log(`\n========== VOYAGE CALCULATION END ==========\n`);

    // Validate emission inputs
    const validation = validateEmissionInputs(
      fuelConsumption,
      vessel.dwt,
      totalDistance + totalEcaDistance,
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
