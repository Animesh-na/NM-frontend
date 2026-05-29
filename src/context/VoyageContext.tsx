import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo, useRef } from "react";
import { useVoyageCalculation, type VoyageInputs, type VoyageResults } from "@/hooks/useVoyageCalculation";
import { defaultVessel, type VesselData } from "@/data/vessels";
import { getSeaRouteDistance, searchPorts as searchMarinePorts } from "@/services/marineApi";
import { type Port } from "@/components/voyage/PortSelect";
import { calculateSeaRouteDistance } from "@/utils/seaRouteDistance";
import { isPortEuEea } from "@/utils/euCountries";
import { validateCargoAssignments, type CargoValidationResult } from "@/utils/cargoValidation";

// Season options for Open Port
export type Season = "summer" | "winter" | "tropical" | "eca";

// Operation types for port sequences
export type PortOperation = "loading" | "discharging" | "pssg" | "bunkering";

// Speed context types for voyage legs
// EV = Eco Voyage (Outside ECA), EL = Eco Local (Inside ECA)
// FV = Full Voyage (Outside ECA), FL = Full Local (Inside ECA)
export type SpeedContext = "EV" | "EL" | "FV" | "FL";

// Wdays unit types
export type WdaysUnit = "VL" | "%";

// Sequence row for UI state
export interface SequenceRowUI {
  id: number;
  type: "open" | "port" | "repos";
  operation?: PortOperation; // only for port type
  port: string;
  portUnloc: string;
  portId?: number; // Port ID from API
  coordinates?: [number, number]; // [longitude, latitude] for distance calculation
  season?: Season; // only for open type
  
  // Distance (V = Outside ECA) with speed context selector
  distance: number;
  distanceSpeedContext: SpeedContext; // EV or FV for non-ECA distance
  
  // ECA Distance (L = Inside ECA) with speed context selector
  ecaDistance: number;
  ecaDistanceSpeedContext: SpeedContext; // EL or FL for ECA distance
  
  // Calculated sea times (can be overridden)
  baseSeaTime: number; // Base sea time before sea margin (Distance / Speed)
  seaMarginTime: number; // Sea margin time added (baseSeaTime × seaMargin%)
  ecaTime: number; // days sailing in ECA (after margin)
  seaTime: number; // days sailing in open sea (after margin)
  totalLegTime: number; // ecaTime + seaTime (total sailing with margin)
  
  // Time override (if user wants to manually set time)
  timeOverride?: number;
  
  // Cargo quantity & productivity (for loading/discharging)
  quantity: number; // MT
  productivity: number; // MT/day
  
  // Terms and time calculations
  terms: "shinc" | "sshex" | "fhex" | "satpn" | "custom" | "";
  customTermsName: string; // user-defined name when terms === "custom"
  turnTime: number; // hours (stored as hours, displayed as days)
  extraTime: number; // hours
  
  // Calculated port days (read-only, derived from quantity/productivity/terms/extra time)
  calculatedPortDays: number;
  
  // Editable port days override (if user wants to manually set)
  wdaysPortOverride?: number;
  
  // Wdays unit (VL = Voyage Laytime Days, % = Percentage)
  wdaysUnit: WdaysUnit;
  
  // Draft in meters (manual input)
  draft: number;
  
  // Number of cranes (from vessel default, editable per leg)
  cranes: number;
  
  // Sea Margin percentage (increases sailing time for weather/routing buffer)
  seaMargin: number;
  
  // Bunkering data (for bunkering operation)
  bunkeringHsfo: number;
  bunkeringVlsfo: number;
  bunkeringLsmgo: number;
  
  // Expected DA
  expDa: number;
  
  // Port draft restriction
  portMaxDraft: number; // Port maximum allowed draft (m)
  ukcPercent: number;   // Under Keel Clearance percentage (default 0)
  stowageFactor: number; // Stowage factor override (m³/mt), 0 = use global default
  
  // Port fuel type (for port consumption calculation)
  portFuelType: "hsfo" | "vlsfo" | "lsmgo";
  
  // Coefficient factor for terms (editable, default based on terms selection)
  coefficientFactor: number;
  
  // EU/EEA flag from port API for EU ETS coverage
  isEuEea?: boolean;
  // Country name for EU/EEA fallback detection
  portCountry?: string;
  
  // Weather delay from API (hours) - used when auto distance is ON
  weatherDelayHours?: number;
  // ETA from distance API
  eta?: string;
  // Cascading leg departure/arrival UTC (computed from cumulative time)
  legDepartureUtc?: string;
  legArrivalUtc?: string;

  // Cargo → route mapping: which cargo IDs are loaded/discharged at this port.
  // Empty/undefined = legacy behaviour (qty split equally across cargos).
  assignedCargoIds?: number[];
}

// Multi-cargo entry structure
export interface CargoEntry {
  id: number;
  rate: number;
  rateType: "mt" | "lumpsum";
  quantity: number;
  voyageCommission: number;
  tcCommission: number;
  demurrageRate: number; // $/day
  despatchRate: number; // $/day
  demurrageAmount: number; // Total $ (can be calculated or manual)
  despatchAmount: number; // Total $ (can be calculated or manual)
  averageMode: "average" | "per_port" | "per_voyage";
  ntcBase: number; // Benchmark NTC $/day
  gtcTarget: number; // Target GTC $/day
  netBBOverride?: number; // Manual override for Net BB
  stowageFactor: number; // Global stowage factor (m³/mt)
}

interface VoyageContextValue {
  // Regulatory freight impact toggles
  applyEuaImpact: boolean;
  setApplyEuaImpact: (v: boolean) => void;
  applyFuelEuImpact: boolean;
  setApplyFuelEuImpact: (v: boolean) => void;
  vessel: VesselData;
  setVessel: (vessel: VesselData) => void;
  
  // Sequence state
  sequence: SequenceRowUI[];
  setSequence: React.Dispatch<React.SetStateAction<SequenceRowUI[]>>;
  updateSequenceRow: (id: number, field: keyof SequenceRowUI, value: string | number) => void;
  addPort: (operation: PortOperation) => void;
  addRepositioning: () => void;
  removeSequence: (id: number) => void;
  recalculateDistances: () => void;
  autoDistanceEnabled: boolean;
  setAutoDistanceEnabled: (enabled: boolean) => void;
  distanceLoading: boolean;
   suppressDistanceRecalc: () => void;
   setDistanceSuppressed: (suppressed: boolean) => void;
   
   // Departure UTC for weather routing
   departureUtc: string;
   setDepartureUtc: (value: string) => void;
   
   // Multi-cargo state
  cargos: CargoEntry[];
  setCargos: React.Dispatch<React.SetStateAction<CargoEntry[]>>;
  addCargo: () => void;
  removeCargo: (id: number) => void;
  updateCargoEntry: (id: number, field: string, value: number | string) => void;
  
  // Vessel cost (global)
  vesselCost: number;
  setVesselCost: (cost: number) => void;
  
  // Bunker state
  bunker: BunkerState;
  setBunker: React.Dispatch<React.SetStateAction<BunkerState>>;
  updateBunker: (fuelType: string, field: string, value: number) => void;
  updateBunkerField: (field: keyof BunkerState, value: number | boolean | string) => void;
  addPortBunkering: (portUnloc: string, portName: string) => void;
  removePortBunkering: (id: number) => void;
  updatePortBunkering: (id: number, fuelType: string, field: string, value: number) => void;
  
  // Miscellaneous costs and extra time
  misc: MiscState;
  setMisc: React.Dispatch<React.SetStateAction<MiscState>>;
  updateMisc: (field: keyof MiscState, value: number | string) => void;
  updateExtraTime: (field: keyof ExtraTimeState, subField: string, value: number | string) => void;
  
   // Hire rate
   hireRate: number;
   setHireRate: (rate: number) => void;
   
   // Net Ballast Bonus
   netBB: number;
   setNetBB: (value: number) => void;
   
   // Reset all state to defaults
   resetState: () => void;
   
   // Calculated results
   results: VoyageResults;

   // Cargo assignment validation (route mapping)
   cargoValidation: CargoValidationResult;
}

// Fuel accounting mode type
export type FuelAccountingMode = "average" | "fifo";

// Port bunkering entry
export interface PortBunkeringEntry {
  id: number;
  portUnloc: string;
  portName: string;
  hsfo: { quantity: number; price: number };
  vlsfo: { quantity: number; price: number };
  lsmgo: { quantity: number; price: number };
}

// Extra time entry structure
export interface ExtraTimeEntry {
  mode: string; // VL, EV, FV
  value: number;
  unit: "days" | "hours";
}

// Extra time state
export interface ExtraTimeState {
  canal1: ExtraTimeEntry;
  canal2: ExtraTimeEntry;
  idlePort: ExtraTimeEntry;
  atSea: ExtraTimeEntry;
}

// Miscellaneous state
export interface MiscState {
  // Costs
  miscCost: number;
  extraFees: number;
  extraInsurance: number;
  canalCost1: number;
  canalCost2: number;
  tradeType: string;
  
  // Extra time
  extraTime: ExtraTimeState;
}

interface BunkerState {
  // BOB (Bunker On Board) at voyage start
  hsfo: { price: number; robStart: number };
  vlsfo: { price: number; robStart: number };
  lsmgo: { price: number; robStart: number };
  
  // CO2 price for emission compliance
  co2Price: number;
  
  // Fuel accounting mode
  fuelMode: FuelAccountingMode;
  
  // Ignore BOB in calculations
  ignoreBOB: boolean;
  
  // Reward factor for wind-assisted propulsion (default 1.0)
  rewardFactor: number;
  
  // Port bunkering events during voyage
  portBunkering: PortBunkeringEntry[];
  
  // EU ETS tracking (derived from ECA zones)
  euEtsHsfo: number;
  euEtsVlsfo: number;
  euEtsLsmgo: number;
}

// Helper to calculate port days
function calculatePortDays(row: SequenceRowUI): number {
  if (row.type === "open" || row.type === "repos") {
    return 0;
  }
  
  if (row.operation === "pssg" || row.operation === "bunkering") {
    // For pssg/bunkering, use turn time + extra time only
    return (row.turnTime + row.extraTime) / 24;
  }
  
  if (row.operation === "loading" || row.operation === "discharging") {
    if (row.productivity <= 0 || row.quantity <= 0) {
      return (row.turnTime + row.extraTime) / 24;
    }
    
    // Base port days = quantity / productivity
    const basePortDays = row.quantity / row.productivity;
    
    // Terms multiplier - use editable coefficientFactor
    const termsMultiplier = row.coefficientFactor || (row.terms === "sshex" ? 1.5555 : row.terms === "fhex" ? 1.25 : row.terms === "satpn" ? 1.33 : 1.0);
    
    // Final port days with terms multiplier
    const portDaysWithTerms = basePortDays * termsMultiplier;
    
    // Add turn time and extra time
    const totalPortDays = portDaysWithTerms + (row.turnTime + row.extraTime) / 24;
    
    return totalPortDays;
  }
  
  return 0;
}

// Helper to get speed based on speed context and vessel matrix
function getSpeedForContext(
  speedContext: SpeedContext, 
  isLaden: boolean, 
  vessel: VesselData
): { ecaSpeed: number; seaSpeed: number } {
  // Select the appropriate consumption matrix based on eco/full indicator in context
  const isEcoContext = speedContext === "EV" || speedContext === "EL";
  const matrix = isEcoContext ? vessel.ecoConsumption : vessel.fullConsumption;
  
  // Get speed based on laden/ballast state
  const speed = isLaden ? matrix.speed.laden : matrix.speed.ballast;
  
  // ECA speeds are typically the same as sea speeds (context determines fuel, not speed)
  // But we provide both for future flexibility
  return {
    ecaSpeed: speed || 12, // Default 12 knots if not set
    seaSpeed: speed || 12,
  };
}

// Helper to calculate sea time for a leg using dual speed contexts
// Sea Margin is applied to sailing time only (not port time)
function calculateSeaTime(
  row: SequenceRowUI, 
  isLaden: boolean, 
  vessel: VesselData,
  useWeatherDelay?: boolean
): { baseSeaTime: number; seaMarginTime: number; ecaTime: number; seaTime: number; totalLegTime: number } {
  if (row.type === "open") {
    return { baseSeaTime: 0, seaMarginTime: 0, ecaTime: 0, seaTime: 0, totalLegTime: 0 };
  }
  
  // If user has overridden time, use that
  if (row.timeOverride !== undefined && row.timeOverride > 0) {
    return { baseSeaTime: 0, seaMarginTime: 0, ecaTime: 0, seaTime: 0, totalLegTime: row.timeOverride };
  }
  
  // Get speeds for non-ECA distance (V context: EV or FV)
  const { seaSpeed: nonEcaSpeed } = getSpeedForContext(row.distanceSpeedContext, isLaden, vessel);
  
  // Get speeds for ECA distance (L context: EL or FL)
  const { seaSpeed: ecaSpeed } = getSpeedForContext(row.ecaDistanceSpeedContext, isLaden, vessel);
  
  // Calculate base times: Time = Distance / (Speed * 24 hours/day)
  const baseNonEcaTime = nonEcaSpeed > 0 ? row.distance / (nonEcaSpeed * 24) : 0;
  const baseEcaTime = ecaSpeed > 0 ? row.ecaDistance / (ecaSpeed * 24) : 0;
  
  // Total base sea time (before margin)
  const baseSeaTime = baseNonEcaTime + baseEcaTime;
  
    // When auto-distance with weather delay: use delayHours from API instead of sea margin %
    // API returns negative delayHours when weather helps (faster). We convert to positive and add as weather delay.
    if (useWeatherDelay && row.weatherDelayHours !== undefined) {
      const weatherDelayHours = Math.abs(row.weatherDelayHours);
      const weatherDelayDays = weatherDelayHours / 24;
      const seaMarginTime = weatherDelayDays;
      const ecaFraction = baseSeaTime > 0 ? baseEcaTime / baseSeaTime : 0;
      const nonEcaFraction = baseSeaTime > 0 ? baseNonEcaTime / baseSeaTime : 0;
      const seaTime = baseNonEcaTime + weatherDelayDays * nonEcaFraction;
      const ecaTime = baseEcaTime + weatherDelayDays * ecaFraction;
      const totalLegTime = baseSeaTime + weatherDelayDays;
      return { baseSeaTime, seaMarginTime, ecaTime, seaTime, totalLegTime };
    }

    // Manual mode: use sea margin percentage
  const seaMarginPercent = row.seaMargin || 0;
  const seaMarginTime = baseSeaTime * (seaMarginPercent / 100);
  
  // Apply Sea Margin to individual components for downstream use
  const seaMarginMultiplier = 1 + seaMarginPercent / 100;
  const seaTime = baseNonEcaTime * seaMarginMultiplier;
  const ecaTime = baseEcaTime * seaMarginMultiplier;
  
  // Total leg time = Base Sea Time + Sea Margin Time
  const totalLegTime = baseSeaTime + seaMarginTime;
  
  console.log(`[VoyageContext] calculateSeaTime for row (isLaden=${isLaden}):
    Non-ECA: dist=${row.distance} nm, speed=${nonEcaSpeed} kn → baseNonEcaTime=${baseNonEcaTime} days
    ECA: dist=${row.ecaDistance} nm, speed=${ecaSpeed} kn → baseEcaTime=${baseEcaTime} days
    baseSeaTime (nonEca+eca) = ${baseSeaTime} days
    Sea Margin: ${seaMarginPercent}% → seaMarginTime = ${seaMarginTime} days
    seaTime (nonEca with margin) = baseNonEcaTime × ${seaMarginMultiplier} = ${seaTime} days
    ecaTime (eca with margin) = baseEcaTime × ${seaMarginMultiplier} = ${ecaTime} days
    totalLegTime = baseSeaTime + seaMarginTime = ${totalLegTime} days`);

  return { baseSeaTime, seaMarginTime, ecaTime, seaTime, totalLegTime };
}

function normalizeOperation(operation?: string): string {
  return (operation || "").toLowerCase();
}

function updateCargoOnBoard(cargoOnBoard: number, row: Pick<SequenceRowUI, "operation" | "quantity">): number {
  const quantity = Math.max(0, Number(row.quantity) || 0);
  const operation = normalizeOperation(row.operation);

  if (operation === "loading" || operation === "load") {
    return cargoOnBoard + quantity;
  }

  if (operation === "discharging" || operation === "disch") {
    return Math.max(0, cargoOnBoard - quantity);
  }

  return cargoOnBoard;
}

function recalculateDerivedSequenceRows(rows: SequenceRowUI[], vessel: VesselData, useWeatherDelay?: boolean, globalDepartureUtc?: string): SequenceRowUI[] {
  let cargoOnBoard = 0;
  let currentDepartureMs: number | null = (() => {
    if (!globalDepartureUtc) return null;
    // datetime-local inputs come as "YYYY-MM-DDTHH:mm" with no zone.
    // The field represents UTC, so parse it explicitly as UTC (append Z if missing).
    const raw = globalDepartureUtc.trim();
    let iso = raw;
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      // Add seconds if missing, then mark as UTC
      iso = /T\d{2}:\d{2}:\d{2}/.test(raw) ? `${raw}Z` : `${raw}:00Z`;
    }
    const parsed = new Date(iso);
    return isNaN(parsed.getTime()) ? null : parsed.getTime();
  })();

  return rows.map((row) => {
    const seaTimeData = calculateSeaTime(row, cargoOnBoard > 0, vessel, useWeatherDelay);
    const portDays = calculatePortDays(row);

    let legDepartureUtc: string | undefined;
    let legArrivalUtc: string | undefined;

    if (currentDepartureMs !== null) {
      if (row.type === "open") {
        legDepartureUtc = fmtDTLocal(currentDepartureMs);
        currentDepartureMs += portDays * 86400000;
      } else {
        legDepartureUtc = fmtDTLocal(currentDepartureMs);
        const seaMs = (seaTimeData.totalLegTime || 0) * 86400000;
        const arrMs = currentDepartureMs + seaMs;
        legArrivalUtc = fmtDTLocal(arrMs);
        currentDepartureMs = arrMs + portDays * 86400000;
      }
    }

    const recalculatedRow = {
      ...row,
      calculatedPortDays: portDays,
      ...seaTimeData,
      legDepartureUtc,
      legArrivalUtc,
    };

    cargoOnBoard = updateCargoOnBoard(cargoOnBoard, row);
    return recalculatedRow;
  });
}

function fmtDTLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

const createNewRow = (type: "open" | "port" | "repos", nextId: number, operation?: PortOperation, speedProfile: "eco" | "full" = "eco", defaultCranes: number = 4, hasScrubber: boolean = false): SequenceRowUI => ({
  id: nextId,
  type,
  operation,
  port: "",
  portUnloc: "",
  season: type === "open" ? "summer" : undefined,
  distance: 0,
  distanceSpeedContext: speedProfile === "eco" ? "EV" : "FV", // Non-ECA speed context
  ecaDistance: 0,
  ecaDistanceSpeedContext: speedProfile === "eco" ? "EL" : "FL", // ECA speed context
  baseSeaTime: 0,
  seaMarginTime: 0,
  ecaTime: 0,
  seaTime: 0,
  totalLegTime: 0,
  timeOverride: undefined,
  quantity: 0,
  productivity: type === "port" && (operation === "loading" || operation === "discharging") ? 8000 : 0,
  terms: type === "port" && (operation === "loading" || operation === "discharging") ? "shinc" : "",
  turnTime: type === "port" ? 18 : 0,
  extraTime: 0,
  calculatedPortDays: 0,
  wdaysPortOverride: undefined,
  wdaysUnit: "VL",
  draft: 0,
  cranes: type === "port" && (operation === "loading" || operation === "discharging") ? defaultCranes : 0,
  seaMargin: 0, // Default 0% sea margin
  bunkeringHsfo: 0,
  bunkeringVlsfo: 0,
  bunkeringLsmgo: 0,
  expDa: 0,
  portMaxDraft: 0,
  ukcPercent: 0,
  stowageFactor: 0,
  portFuelType: hasScrubber ? "hsfo" : "vlsfo",
  coefficientFactor: type === "port" && (operation === "loading" || operation === "discharging") ? 1.0 : 0,
  customTermsName: "",
});

const initialSequence: SequenceRowUI[] = [
  {
    id: 1,
    type: "open",
    port: "Paradip",
    portUnloc: "INPAV",
    portId: 987,
    coordinates: [86.68333333333334, 20.266666666666666], // [lon, lat]
    season: "summer",
    distance: 0,
    distanceSpeedContext: "EV",
    ecaDistance: 0,
    ecaDistanceSpeedContext: "EL",
    baseSeaTime: 0,
    seaMarginTime: 0,
    ecaTime: 0,
    seaTime: 0,
    totalLegTime: 0,
    quantity: 0,
    productivity: 0,
    terms: "",
    turnTime: 0,
    extraTime: 0,
    calculatedPortDays: 0,
    wdaysUnit: "VL",
    draft: 0,
    cranes: 0,
    seaMargin: 0,
    bunkeringHsfo: 0,
    bunkeringVlsfo: 0,
    bunkeringLsmgo: 0,
    expDa: 0,
    portMaxDraft: 0,
    ukcPercent: 0,
    stowageFactor: 0,
    portFuelType: "vlsfo",
    coefficientFactor: 0,
    customTermsName: "",
  },
  {
    id: 2,
    type: "port",
    operation: "loading",
    port: "Port Adelaide",
    portUnloc: "AUADL",
    portId: 677,
    coordinates: [138.5, -34.85], // [lon, lat]
    distance: 0,
    distanceSpeedContext: "EV",
    ecaDistance: 0,
    ecaDistanceSpeedContext: "EL",
    baseSeaTime: 0,
    seaMarginTime: 0,
    ecaTime: 0,
    seaTime: 0,
    totalLegTime: 0,
    quantity: 56550,
    productivity: 8000,
    terms: "shinc",
    turnTime: 18,
    extraTime: 0,
    calculatedPortDays: 0,
    wdaysUnit: "VL",
    draft: 12.5,
    cranes: 4,
    seaMargin: 5,
    bunkeringHsfo: 0,
    bunkeringVlsfo: 0,
    bunkeringLsmgo: 0,
    expDa: 13000,
    portMaxDraft: 0,
    ukcPercent: 0,
    stowageFactor: 0,
    portFuelType: "vlsfo",
    coefficientFactor: 1.0,
    customTermsName: "",
  },
  {
    id: 3,
    type: "port",
    operation: "bunkering",
    port: "Keppel - (East Singapore)",
    portUnloc: "SGSIN",
    portId: 3176,
    coordinates: [103.85, 1.2833333333333332], // [lon, lat]
    distance: 0,
    distanceSpeedContext: "EV",
    ecaDistance: 0,
    ecaDistanceSpeedContext: "EL",
    baseSeaTime: 0,
    seaMarginTime: 0,
    ecaTime: 0,
    seaTime: 0,
    totalLegTime: 0,
    quantity: 0,
    productivity: 0,
    terms: "",
    turnTime: 12,
    extraTime: 0,
    calculatedPortDays: 0,
    wdaysUnit: "VL",
    draft: 0,
    cranes: 0,
    seaMargin: 5,
    bunkeringHsfo: 0,
    bunkeringVlsfo: 1234,
    bunkeringLsmgo: 1234,
    expDa: 2500,
    portMaxDraft: 0,
    ukcPercent: 0,
    stowageFactor: 0,
    portFuelType: "vlsfo",
    coefficientFactor: 0,
    customTermsName: "",
  },
  {
    id: 4,
    type: "port",
    operation: "discharging",
    port: "Thanh Ho Chi Minh",
    portUnloc: "VNSGN",
    portId: 358,
    coordinates: [106.71666666666667, 10.766666666666667], // [lon, lat]
    distance: 0,
    distanceSpeedContext: "EV",
    ecaDistance: 0,
    ecaDistanceSpeedContext: "EL",
    baseSeaTime: 0,
    seaMarginTime: 0,
    ecaTime: 0,
    seaTime: 0,
    totalLegTime: 0,
    quantity: 56550,
    productivity: 5000,
    terms: "shinc",
    turnTime: 18,
    extraTime: 0,
    calculatedPortDays: 0,
    wdaysUnit: "VL",
    draft: 10.2,
    cranes: 4,
    seaMargin: 5,
    bunkeringHsfo: 0,
    bunkeringVlsfo: 0,
    bunkeringLsmgo: 0,
    expDa: 25000,
    portMaxDraft: 0,
    ukcPercent: 0,
    stowageFactor: 0,
    portFuelType: "vlsfo",
    coefficientFactor: 1.0,
    customTermsName: "",
  },
];

const initialCargos: CargoEntry[] = [
  {
    id: 1,
    rate: 13.7,
    rateType: "mt",
    quantity: 56550,
    voyageCommission: 1.25,
    tcCommission: 3.75,
    demurrageRate: 25000,
    despatchRate: 12500,
    demurrageAmount: 0,
    despatchAmount: 0,
    averageMode: "average",
    ntcBase: 8000,
    gtcTarget: 12000,
    stowageFactor: 1.4,
  },
];

const initialBunker: BunkerState = {
  hsfo: { price: 0, robStart: 0 },
  vlsfo: { price: 450, robStart: 1234 },
  lsmgo: { price: 750, robStart: 0 },
  co2Price: 0,
  fuelMode: "average",
  ignoreBOB: false,
  rewardFactor: 1.0,
  portBunkering: [],
  euEtsHsfo: 0,
  euEtsVlsfo: 0,
  euEtsLsmgo: 0,
};

const initialMisc: MiscState = {
  miscCost: 12000,
  extraFees: 0,
  extraInsurance: 0,
  canalCost1: 0,
  canalCost2: 0,
  tradeType: "",
  extraTime: {
    canal1: { mode: "VL", value: 0, unit: "days" },
    canal2: { mode: "VL", value: 0, unit: "days" },
    idlePort: { mode: "VL", value: 0, unit: "hours" },
    atSea: { mode: "EV", value: 0, unit: "hours" },
  },
};

const VoyageContext = createContext<VoyageContextValue | null>(null);

export interface VoyageProviderProps {
  children: ReactNode;
  initialData?: Record<string, unknown> | null;
}

export function VoyageProvider({ children, initialData }: VoyageProviderProps) {
  const [vessel, setVessel] = useState<VesselData>(() => (initialData?.vessel as VesselData) || ({
    ...defaultVessel,
    name: "",
    type: "",
    dwt: 0,
    gt: 0,
    cubic: 0,
    cubicUnit: "cbm",
    draft: 0,
    tpcTpi: 0,
    hsfoCapability: false,
    hasScrubber: false,
    scrubberCount: 0,
  }));

  const [sequence, setSequence] = useState<SequenceRowUI[]>(() =>
    (initialData?.sequence as SequenceRowUI[]) || initialSequence
  );
  const [cargos, setCargos] = useState<CargoEntry[]>(() =>
    (initialData?.cargos as CargoEntry[]) || initialCargos
  );
  const [bunker, setBunker] = useState<BunkerState>(() =>
    initialData?.bunker ? { ...initialBunker, ...(initialData.bunker as Partial<BunkerState>) } : initialBunker
  );
  const [misc, setMisc] = useState<MiscState>(() =>
    initialData?.misc ? { ...initialMisc, ...(initialData.misc as Partial<MiscState>) } : initialMisc
  );
  const [hireRate, setHireRate] = useState(() =>
    initialData?.hireRate != null ? Number(initialData.hireRate) : 8542
  );
  const [netBB, setNetBB] = useState(() =>
    initialData?.netBB != null ? Number(initialData.netBB) : 0
  );
  const [vesselCost, setVesselCost] = useState(() =>
    initialData?.vesselCost != null ? Number(initialData.vesselCost) : 6500
  );
  const [autoDistanceEnabled, setAutoDistanceEnabled] = useState(true);
  const [applyEuaImpact, setApplyEuaImpact] = useState(() =>
    initialData?.applyEuaImpact === true
  );
  const [applyFuelEuImpact, setApplyFuelEuImpact] = useState(() =>
    initialData?.applyFuelEuImpact === true
  );
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [departureUtc, setDepartureUtc] = useState(() =>
    (initialData?.departureUtc as string) || ""
  );

  // Recalculate derived port days and sea times whenever vessel changes
  useEffect(() => {
    setSequence((prev) => recalculateDerivedSequenceRows(prev, vessel, autoDistanceEnabled, departureUtc));
  }, [vessel, autoDistanceEnabled, departureUtc]);

  const updateSequenceRow = useCallback((id: number, field: keyof SequenceRowUI, value: string | number) => {
    setSequence((prev) => {
      const updated = prev.map((row) => (row.id === id ? { ...row, [field]: value } : row));
      let syncedRows = updated;

      // Auto-sync: when a loading port quantity changes, distribute remaining to discharge ports
      if (field === "quantity") {
        const changedRow = updated.find((r) => r.id === id);
        if (changedRow && changedRow.operation === "loading") {
          const totalLoadQty = updated
            .filter((r) => r.operation === "loading")
            .reduce((sum, r) => sum + (r.quantity || 0), 0);
          const dischPorts = updated.filter((r) => r.operation === "discharging");

          if (dischPorts.length > 0) {
            // Preserve manually entered quantities, only assign remaining to ports with 0 qty
            const manuallySetQty = dischPorts
              .filter((r) => r.quantity > 0)
              .reduce((sum, r) => sum + r.quantity, 0);
            const emptyPorts = dischPorts.filter((r) => !r.quantity || r.quantity === 0);
            const remaining = Math.max(0, totalLoadQty - manuallySetQty);

            if (emptyPorts.length > 0) {
              const qtyPerEmpty = Math.round(remaining / emptyPorts.length);
              const emptyIds = new Set(emptyPorts.map((r) => r.id));
              console.log(
                `[QtySync] Load qty changed → total: ${totalLoadQty}, already assigned: ${manuallySetQty}, remaining: ${remaining}, empty ports: ${emptyPorts.length}`,
              );
              syncedRows = updated.map((row) =>
                row.operation === "discharging" && emptyIds.has(row.id) ? { ...row, quantity: qtyPerEmpty } : row,
              );
            } else if (dischPorts.length === 1) {
              // Single discharge port always gets full load qty
              syncedRows = updated.map((row) =>
                row.operation === "discharging" ? { ...row, quantity: totalLoadQty } : row,
              );
            }
          }
        }
      }

      // Also sync when operation changes — assign remaining load qty to new discharge port
      if (field === "operation") {
        const totalLoadQty = syncedRows
          .filter((r) => r.operation === "loading")
          .reduce((sum, r) => sum + (r.quantity || 0), 0);
        const dischPorts = syncedRows.filter((r) => r.operation === "discharging");

        if (totalLoadQty > 0 && dischPorts.length > 0) {
          // Find the row that just became a discharge port (the one being changed)
          const changedRow = syncedRows.find((r) => r.id === id);
          const otherDischPorts = dischPorts.filter((r) => r.id !== id);
          const alreadyAssigned = otherDischPorts.reduce((sum, r) => sum + (r.quantity || 0), 0);
          const remaining = Math.max(0, totalLoadQty - alreadyAssigned);

          if (changedRow && String(value) === "discharging") {
            // New discharge port gets remaining quantity
            console.log(`[QtySync] Operation changed to discharging → assigning remaining ${remaining} to new port`);
            syncedRows = syncedRows.map((row) =>
              row.id === id ? { ...row, quantity: remaining } : row,
            );
          } else {
            // Operation changed away from discharging — redistribute remaining among remaining discharge ports
            const remainingDisch = syncedRows.filter((r) => r.operation === "discharging");
            if (remainingDisch.length === 1) {
              syncedRows = syncedRows.map((row) =>
                row.operation === "discharging" ? { ...row, quantity: totalLoadQty } : row,
              );
            }
          }
        }
      }

      return recalculateDerivedSequenceRows(syncedRows, vessel, autoDistanceEnabled, departureUtc);
    });
  }, [vessel, autoDistanceEnabled, departureUtc]);

  const addPort = useCallback((operation: PortOperation) => {
    setSequence(prev => {
      const nextId = Math.max(...prev.map(s => s.id), 0) + 1;
      const newRow = createNewRow("port", nextId, operation, vessel.speedProfile, 4, vessel.hasScrubber);
      
      // Insert before repos (if any exist at the end)
      const reposRows = prev.filter(r => r.type === "repos");
      const nonReposRows = prev.filter(r => r.type !== "repos");
      return [...nonReposRows, newRow, ...reposRows];
    });
  }, [vessel.speedProfile]);

  const addRepositioning = useCallback(() => {
    setSequence(prev => {
      const nextId = Math.max(...prev.map(s => s.id), 0) + 1;
      const newRow = createNewRow("repos", nextId, undefined, vessel.speedProfile, 4, vessel.hasScrubber);
      return [...prev, newRow];
    });
  }, [vessel.speedProfile]);

  const removeSequence = useCallback((id: number) => {
    setSequence(prev => {
      const row = prev.find(s => s.id === id);
      if (row?.type === "open") return prev; // Can't remove open port
      return prev.filter(s => s.id !== id);
    });
  }, []);

   // Recalculate distances using fleetgo/distbl API, then update sea times
   // Only calls API for legs whose ports have changed since last calculation
  // Uses a ref to current vessel to avoid stale closures
  const vesselRef = useRef(vessel);
  vesselRef.current = vessel;

   // Track the last computed port key per leg to avoid redundant API calls
   const lastComputedLegsRef = useRef<Map<number, string>>(new Map());
    const recalcRunIdRef = useRef(0);

  const recalculateDistances = useCallback(async () => {
    setDistanceLoading(true);
    // Take a snapshot of current sequence for API calls
    let snapshot: SequenceRowUI[] = [];
    setSequence(prev => { snapshot = [...prev]; return prev; });
    // Allow state to flush
    await new Promise(r => setTimeout(r, 0));

    if (snapshot.length === 0) { setDistanceLoading(false); return; }

    // Check: Open port must be selected
    const openRow = snapshot.find(r => r.type === "open");
    if (!openRow || !openRow.port || !openRow.portUnloc) {
      // No open port — zero out all distances
      setSequence((prev) => {
        const currentVessel = vesselRef.current;
        const zeroedRows = prev.map((row) => ({ ...row, distance: 0, ecaDistance: 0 }));
        return recalculateDerivedSequenceRows(zeroedRows, currentVessel, false, departureUtc);
      });
       lastComputedLegsRef.current.clear();
      setDistanceLoading(false);
      return;
    }

    // Claim a run ID to detect if a newer recalculation supersedes this one
    const runId = ++recalcRunIdRef.current;

    // Collect distance results for legs that have valid coordinates
    const distanceResults: Map<number, { distance: number; ecaDistance: number; weatherDelayHours?: number; eta?: string }> = new Map();
     const newComputedLegs = new Map<number, string>();

    for (let i = 1; i < snapshot.length; i++) {
      const prevRow = snapshot[i - 1];
      const currRow = snapshot[i];

       // Build a key that uniquely identifies this leg's port pair
       const legKey = `${prevRow.portUnloc || ''}:${prevRow.coordinates?.[0]},${prevRow.coordinates?.[1]}_${currRow.portUnloc || ''}:${currRow.coordinates?.[0]},${currRow.coordinates?.[1]}`;
       newComputedLegs.set(currRow.id, legKey);

      // Rule: Skip if current port is not selected
      if (!currRow.port || !currRow.portUnloc) {
        distanceResults.set(currRow.id, { distance: 0, ecaDistance: 0 });
        continue;
      }

      // Rule: Skip if previous port is not selected
      if (!prevRow.port || !prevRow.portUnloc) {
        distanceResults.set(currRow.id, { distance: 0, ecaDistance: 0 });
        continue;
      }

       // Skip if this leg hasn't changed since last calculation
       const previousLegKey = lastComputedLegsRef.current.get(currRow.id);
       if (previousLegKey === legKey) {
         // Keep existing distance — don't add to distanceResults so it stays unchanged
        console.log(`[Distance] Leg ${i} (${prevRow.port} → ${currRow.port}): CACHED, skipping API call`);
        continue;
      }

      // Rule: Skip if either port has no valid coordinates
      const prevHasCoords = prevRow.coordinates &&
        (prevRow.coordinates[0] !== 0 || prevRow.coordinates[1] !== 0);
      const currHasCoords = currRow.coordinates &&
        (currRow.coordinates[0] !== 0 || currRow.coordinates[1] !== 0);

      if (!prevHasCoords || !currHasCoords) {
        distanceResults.set(currRow.id, { distance: 0, ecaDistance: 0 });
        if (!currHasCoords && currRow.port) {
          console.warn(`Port coordinates not available for leg ${i}. Distance set to 0.`);
        }
        continue;
      }

      // All checks passed — call the API
      try {
        console.log(`[Distance] Leg ${i} (${prevRow.port} → ${currRow.port}): calling API`);
        const [prevLon, prevLat] = prevRow.coordinates!;
        const [currLon, currLat] = currRow.coordinates!;

        // Determine speed for this leg based on laden/ballast state
        let cargoOnBoardForLeg = 0;
        for (let j = 0; j < i; j++) {
          cargoOnBoardForLeg = updateCargoOnBoard(cargoOnBoardForLeg, snapshot[j]);
        }
        const isLadenForLeg = cargoOnBoardForLeg > 0;
        const { seaSpeed: legSpeed } = getSpeedForContext(currRow.distanceSpeedContext, isLadenForLeg, vesselRef.current);

        // Use cascading leg departure from sequence row
        const legDepartureUtc = currRow.legDepartureUtc
          ? currRow.legDepartureUtc.replace("T", " ")
          : (i === 1 ? departureUtc.replace("T", " ") : "");

        const result = await getSeaRouteDistance(
          prevLat, prevLon, currLat, currLon,
          prevRow.portUnloc || undefined,
          currRow.portUnloc || undefined,
          legSpeed > 0 ? legSpeed : undefined,
          legDepartureUtc || undefined
        );
        const totalDist = result.total_distance_nm ?? 0;
        const ecaDist = result.eca_distance_nm ?? 0;
        const nonEcaDist = result.non_eca_distance_nm != null
          ? result.non_eca_distance_nm
          : Math.max(0, totalDist - ecaDist);
        distanceResults.set(currRow.id, {
          distance: Math.round(nonEcaDist),
          ecaDistance: Math.round(ecaDist),
          weatherDelayHours: result.delayHours,
          eta: result.eta,
        });
      } catch (error) {
         console.error(`Distance API error for leg ${i}:`, error);
         // Fallback: use client-side searoute-js library (no ECA breakdown)
        try {
          const prevPort: Port = { id: 0, unloc: '', name: prevRow.port || '', city: '', country: '', coordinates: prevRow.coordinates };
          const currPort: Port = { id: 0, unloc: '', name: currRow.port || '', city: '', country: '', coordinates: currRow.coordinates };
          const fallback = calculateSeaRouteDistance(prevPort, currPort);
          if (fallback.success && fallback.distance > 0) {
             console.log(`Fallback for leg ${i}: ${fallback.distance} nm (no ECA breakdown)`);
            distanceResults.set(currRow.id, { distance: fallback.distance, ecaDistance: 0 });
          } else {
            distanceResults.set(currRow.id, { distance: 0, ecaDistance: 0 });
          }
        } catch (fallbackErr) {
          console.error(`Fallback searoute-js also failed for leg ${i}:`, fallbackErr);
          distanceResults.set(currRow.id, { distance: 0, ecaDistance: 0 });
        }
      }
    }

     // Update the tracked leg keys
    // If a newer run started while we were fetching, abort
    if (runId !== recalcRunIdRef.current) {
      setDistanceLoading(false);
      return;
    }

    // Merge computed leg keys into the persistent cache (don't replace entirely)
    newComputedLegs.forEach((key, rowId) => {
      lastComputedLegsRef.current.set(rowId, key);
    });
    // Remove entries for row IDs no longer in the sequence
    const currentRowIds = new Set(snapshot.map(r => r.id));
    Array.from(lastComputedLegsRef.current.keys()).forEach(k => {
      if (!currentRowIds.has(k)) {
        lastComputedLegsRef.current.delete(k);
      }
    });

    // Apply results using functional update so we never overwrite concurrent changes
    setSequence((prev) => {
      const currentVessel = vesselRef.current;
      const updatedRows = prev.map((row) => {
        const dist = distanceResults.get(row.id);
        return dist ? { ...row, distance: dist.distance, ecaDistance: dist.ecaDistance, weatherDelayHours: dist.weatherDelayHours, eta: dist.eta } : row;
      });

      return recalculateDerivedSequenceRows(updatedRows, currentVessel, true, departureUtc);
    });
    setDistanceLoading(false);
  }, [departureUtc]);

  // Track port identity + coordinates to only trigger API on actual port changes
  const portCoordsKey = useMemo(() => 
    sequence.map(s => `${s.portUnloc}:${s.coordinates?.[0] || 0},${s.coordinates?.[1] || 0}`).join('|'), 
    [sequence]
  );

  // Use a ref for recalculateDistances to avoid re-triggering on every sequence field change
  const recalcRef = useRef(recalculateDistances);
  recalcRef.current = recalculateDistances;

  // Persistent flag to suppress distance recalculation (used when loading sheet data)
  // Using a ref so setting it doesn't re-trigger the distance effect
  const distanceSuppressedRef = useRef(!!initialData?.sequence);
  
  const setDistanceSuppressed = useCallback((suppressed: boolean) => {
    distanceSuppressedRef.current = suppressed;
  }, []);

  const suppressDistanceRecalc = useCallback(() => {
    distanceSuppressedRef.current = true;
  }, []);

  // Reset all voyage state to blank defaults
  const resetState = useCallback(() => {
    distanceSuppressedRef.current = true;
    setVessel({
      ...defaultVessel,
      name: "",
      type: "",
      dwt: 0,
      gt: 0,
      cubic: 0,
      cubicUnit: "cbm",
      draft: 0,
      tpcTpi: 0,
      hsfoCapability: false,
      hasScrubber: false,
      scrubberCount: 0,
    });
    const blankOpen: SequenceRowUI = {
      id: 1,
      type: "open",
      port: "",
      portUnloc: "",
      season: "summer",
      distance: 0,
      distanceSpeedContext: "EV",
      ecaDistance: 0,
      ecaDistanceSpeedContext: "EL",
      baseSeaTime: 0,
      seaMarginTime: 0,
      ecaTime: 0,
      seaTime: 0,
      totalLegTime: 0,
      quantity: 0,
      productivity: 0,
      terms: "",
      turnTime: 0,
      extraTime: 0,
      calculatedPortDays: 0,
      wdaysUnit: "VL",
      draft: 0,
      cranes: 0,
      seaMargin: 0,
      bunkeringHsfo: 0,
      bunkeringVlsfo: 0,
      bunkeringLsmgo: 0,
      expDa: 0,
      portMaxDraft: 0,
      ukcPercent: 0,
      stowageFactor: 0,
      portFuelType: "vlsfo",
      coefficientFactor: 0,
      customTermsName: "",
    };
    setSequence([blankOpen]);
    setCargos([{
      id: 1,
      rate: 0,
      rateType: "mt",
      quantity: 0,
      voyageCommission: 1.25,
      tcCommission: 3.75,
      demurrageRate: 25000,
      despatchRate: 12500,
      demurrageAmount: 0,
      despatchAmount: 0,
      averageMode: "average",
      ntcBase: 8000,
      gtcTarget: 12000,
      stowageFactor: 1.4,
    }]);
    setBunker({
      hsfo: { price: 0, robStart: 0 },
      vlsfo: { price: 0, robStart: 0 },
      lsmgo: { price: 0, robStart: 0 },
      co2Price: 0,
      fuelMode: "average",
      ignoreBOB: false,
      rewardFactor: 1.0,
      portBunkering: [],
      euEtsHsfo: 0,
      euEtsVlsfo: 0,
      euEtsLsmgo: 0,
    });
    setMisc({
      miscCost: 0,
      extraFees: 0,
      extraInsurance: 0,
      canalCost1: 0,
      canalCost2: 0,
      tradeType: "",
      extraTime: {
        canal1: { mode: "VL", value: 0, unit: "days" },
        canal2: { mode: "VL", value: 0, unit: "days" },
        idlePort: { mode: "VL", value: 0, unit: "hours" },
        atSea: { mode: "EV", value: 0, unit: "hours" },
      },
    });
    setHireRate(0);
    setVesselCost(0);
  }, []);

  // Track the previous portCoordsKey to detect actual changes vs initial hydration
  const prevPortCoordsKeyRef = useRef(portCoordsKey);

  // Auto-recalculate distances ONLY when ports or coordinates change
  useEffect(() => {
    // Skip initial render
    if (prevPortCoordsKeyRef.current === portCoordsKey) return;
    prevPortCoordsKeyRef.current = portCoordsKey;

    if (autoDistanceEnabled && portCoordsKey) {
      if (distanceSuppressedRef.current) {
        // Reset the flag but don't trigger API call
        distanceSuppressedRef.current = false;
        return;
      }
      const timer = setTimeout(() => {
        recalcRef.current();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [portCoordsKey, autoDistanceEnabled]);

  // Auto-populate missing port metadata so ETS logic still works for
  // JSON-imported rows and API results that do not include a port code.
  useEffect(() => {
    const portsNeedingLookup = sequence.filter(
      (row) => row.port && (
        row.isEuEea === undefined ||
        !row.portUnloc ||
        !row.portCountry ||
        !row.coordinates ||
        row.portId === undefined
      )
    );
    if (portsNeedingLookup.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates: Record<number, Partial<Pick<SequenceRowUI, "portId" | "portUnloc" | "coordinates" | "isEuEea" | "portCountry">>> = {};
      for (const row of portsNeedingLookup) {
        if (cancelled) return;
        try {
          const results = await searchMarinePorts(row.port || row.portUnloc, 5);
          const match = results.find(
            (p) =>
              (row.portId !== undefined && p.id === row.portId) ||
              p.port_name === row.port ||
              (!!row.portUnloc && !!p.port_code && p.port_code === row.portUnloc)
          );
          if (match) {
            const rawCode = match.port_code?.trim();
            const validCode = rawCode && rawCode !== "NaN" && rawCode !== "0"
              ? rawCode
              : undefined;
            updates[row.id] = {
              portId: row.portId ?? match.id,
              portUnloc: row.portUnloc && !row.portUnloc.startsWith("PORT-") && !row.portUnloc.startsWith("COORD-")
                ? row.portUnloc
                : validCode || `COORD-${match.latitude?.toFixed(4)},${match.longitude?.toFixed(4)}`,
              coordinates:
                row.coordinates ||
                (match.longitude != null && match.latitude != null
                  ? [match.longitude, match.latitude]
                  : undefined),
              isEuEea: isPortEuEea({ isEuEea: match.is_eu_eea, ecaZone: match.eca_zone, country: match.country }),
              portCountry: match.country,
            };
          } else {
            // No API match — keep what we have and fall back to country detection.
            updates[row.id] = {
              isEuEea: isPortEuEea({ country: row.portCountry }),
              portCountry: row.portCountry,
            };
          }
        } catch {
          updates[row.id] = {
            isEuEea: isPortEuEea({ country: row.portCountry }),
            portCountry: row.portCountry,
          };
        }
      }
      if (!cancelled) {
        setSequence(prev => prev.map(row =>
          updates[row.id] !== undefined
            ? {
                ...row,
                ...updates[row.id],
                portCountry: updates[row.id].portCountry || row.portCountry,
                portUnloc: updates[row.id].portUnloc || row.portUnloc,
                coordinates: updates[row.id].coordinates || row.coordinates,
                portId: updates[row.id].portId ?? row.portId,
              }
            : row
        ));
      }
    })();
    return () => { cancelled = true; };
  }, [sequence.map(r => `${r.id}:${r.port}:${r.portUnloc}:${r.portId ?? ""}:${r.isEuEea}:${r.portCountry ?? ""}:${r.coordinates?.[0] ?? ""}:${r.coordinates?.[1] ?? ""}`).join(',')]);

  // Multi-cargo management functions
  const addCargo = useCallback(() => {
    setCargos(prev => {
      const nextId = Math.max(...prev.map(c => c.id), 0) + 1;
      return [...prev, {
        id: nextId,
        rate: 0,
        rateType: "mt" as const,
        quantity: 0,
        voyageCommission: 1.25,
        tcCommission: 3.75,
        demurrageRate: 25000,
        despatchRate: 12500,
        demurrageAmount: 0,
        despatchAmount: 0,
        averageMode: "average" as const,
        ntcBase: 8000,
        gtcTarget: 12000,
        stowageFactor: 1.4,
      }];
    });
  }, []);

  const removeCargo = useCallback((id: number) => {
    setCargos(prev => prev.filter(c => c.id !== id));
  }, []);

  const updateCargoEntry = useCallback((id: number, field: string, value: number | string) => {
    setCargos(prev => prev.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  }, []);

  const updateBunker = useCallback((fuelType: string, field: string, value: number) => {
    setBunker(prev => ({
      ...prev,
      [fuelType]: { ...prev[fuelType as keyof BunkerState] as object, [field]: value },
    }));
  }, []);

  const updateBunkerField = useCallback((field: keyof BunkerState, value: number | boolean | string) => {
    setBunker(prev => ({ ...prev, [field]: value }));
  }, []);

  const addPortBunkering = useCallback((portUnloc: string, portName: string) => {
    setBunker(prev => {
      const nextId = prev.portBunkering.length > 0 
        ? Math.max(...prev.portBunkering.map(p => p.id)) + 1 
        : 1;
      return {
        ...prev,
        portBunkering: [
          ...prev.portBunkering,
          {
            id: nextId,
            portUnloc,
            portName,
            hsfo: { quantity: 0, price: 0 },
            vlsfo: { quantity: 0, price: 0 },
            lsmgo: { quantity: 0, price: 0 },
          },
        ],
      };
    });
  }, []);

  const removePortBunkering = useCallback((id: number) => {
    setBunker(prev => ({
      ...prev,
      portBunkering: prev.portBunkering.filter(p => p.id !== id),
    }));
  }, []);

  const updatePortBunkering = useCallback((id: number, fuelType: string, field: string, value: number) => {
    setBunker(prev => ({
      ...prev,
      portBunkering: prev.portBunkering.map(p => 
        p.id === id 
          ? { ...p, [fuelType]: { ...(p[fuelType as keyof typeof p] as { quantity: number; price: number }), [field]: value } }
          : p
      ),
    }));
  }, []);

  // Miscellaneous update functions
  const updateMisc = useCallback((field: keyof MiscState, value: number | string) => {
    setMisc(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateExtraTime = useCallback((field: keyof ExtraTimeState, subField: string, value: number | string) => {
    setMisc(prev => ({
      ...prev,
      extraTime: {
        ...prev.extraTime,
        [field]: {
          ...prev.extraTime[field],
          [subField]: value,
        },
      },
    }));
  }, []);

  // Calculate cargo quantity from sequence load/discharge operations
  const sequenceCargoQuantity = useMemo(() => {
    // Sum all loading quantities from sequence (discharge should match load)
    const loadingQuantity = sequence
      .filter(row => row.operation === "loading")
      .reduce((sum, row) => sum + (row.quantity || 0), 0);
    
    // Alternative: use discharge quantity if that's preferred
    const dischargingQuantity = sequence
      .filter(row => row.operation === "discharging")
      .reduce((sum, row) => sum + (row.quantity || 0), 0);
    
    // Use the higher of loading or discharging (in case of partial loads/discharges)
    return Math.max(loadingQuantity, dischargingQuantity);
  }, [sequence]);

  // Aggregate cargo data for calculation hook
  const aggregatedCargo = useMemo(() => {
    // Use sequence-derived total quantity for downstream rate/MT calculations.
    const totalQuantity = sequenceCargoQuantity;

    // Per-cargo loaded qty: explicit chip mapping wins, otherwise auto-map
    // loading rows to cargos 1-to-1 by order. NEVER equal-split.
    const loadingRows = sequence.filter((r) => r.operation === "loading");
    const usesExplicitMapping = sequence.some(
      (r) => (r.assignedCargoIds || []).length > 0,
    );
    const loadedQtyForCargo = (cargoId: number, ci: number): number => {
      if (usesExplicitMapping) {
        return loadingRows
          .filter((r) => (r.assignedCargoIds || []).includes(cargoId))
          .reduce((sum, r) => sum + (r.quantity || 0), 0);
      }
      return loadingRows[ci]?.quantity || 0;
    };

    // Gross freight = Σ (rate × per-cargo loaded qty), lumpsum added as-is.
    const totalGrossFreight = cargos.reduce((sum, c, ci) => {
      if (c.rateType === "lumpsum") return sum + (c.rate || 0);
      return sum + (c.rate || 0) * loadedQtyForCargo(c.id, ci);
    }, 0);
    
    const avgVoyComm = cargos.length > 0 
      ? cargos.reduce((sum, c) => sum + c.voyageCommission, 0) / cargos.length 
      : 0;
    const avgTcComm = cargos.length > 0 
      ? cargos.reduce((sum, c) => sum + c.tcCommission, 0) / cargos.length 
      : 0;
    const totalDemurrage = cargos.reduce((sum, c) => sum + c.demurrageAmount, 0);
    const totalDespatch = cargos.reduce((sum, c) => sum + c.despatchAmount, 0);

    return {
      rate: totalQuantity > 0 ? totalGrossFreight / totalQuantity : 0,
      rateType: "mt" as const,
      quantity: totalQuantity,
      voyageCommission: avgVoyComm,
      tcCommission: avgTcComm,
      demurrage: totalDemurrage,
      despatch: totalDespatch,
    };
  }, [cargos, sequenceCargoQuantity]);

  // Transform UI state to calculation inputs
  const voyageInputs: VoyageInputs = {
    vessel,
    sequence: sequence.map(row => ({
      id: row.id,
      operation: row.operation || "",
      port: row.port,
      portUnloc: row.portUnloc,
      cgo: "",
      distance: row.distance,
      ecaDistance: row.ecaDistance,
      portDays: row.calculatedPortDays,
      quantity: row.quantity,
      expDa: row.expDa,
      // Pass sea margin adjusted times for accurate downstream calculations
      seaTime: row.totalLegTime, // Total sea time WITH sea margin applied
      ecaTime: row.ecaTime, // ECA sea time WITH margin
      nonEcaTime: row.seaTime, // Non-ECA sea time WITH margin (named seaTime in UI)
      baseSeaTime: row.baseSeaTime, // Base time without margin (for reference)
      seaMarginTime: row.seaMarginTime, // Extra time from sea margin
      seaMargin: row.seaMargin, // Sea margin percentage
      // Port time breakdown for fuel consumption split
      turnTimeHours: row.turnTime || 0, // Turn time in hours
      extraTimeHours: row.extraTime || 0, // Extra time in hours
      portFuelType: row.portFuelType, // Port fuel type per leg
      isEuEea: row.isEuEea, // EU/EEA flag from port API
      // Pass through for per-cargo route-bounded allocation
      type: row.type,
      assignedCargoIds: row.assignedCargoIds,
    })),
    cargo: aggregatedCargo,
    cargos: cargos.map(c => ({
      id: c.id,
      rate: c.rate,
      rateType: c.rateType,
      voyageCommission: c.voyageCommission,
      tcCommission: c.tcCommission,
    })),
    bunker: {
      hsfo: { price: bunker.hsfo.price, robStart: bunker.hsfo.robStart },
      vlsfo: { price: bunker.vlsfo.price, robStart: bunker.vlsfo.robStart },
      lsmgo: { price: bunker.lsmgo.price, robStart: bunker.lsmgo.robStart },
      co2Price: bunker.co2Price,
      rewardFactor: bunker.rewardFactor,
    },
    hireRate,
    netBB,
    misc: {
      miscCost: misc.miscCost,
      extraFees: misc.extraFees,
      extraInsurance: misc.extraInsurance,
      canalCost1: misc.canalCost1,
      canalCost2: misc.canalCost2,
    },
    extraTime: {
      canal1Days: misc.extraTime.canal1.unit === "days" 
        ? misc.extraTime.canal1.value 
        : misc.extraTime.canal1.value / 24,
      canal2Days: misc.extraTime.canal2.unit === "days" 
        ? misc.extraTime.canal2.value 
        : misc.extraTime.canal2.value / 24,
      idlePortDays: misc.extraTime.idlePort.unit === "days" 
        ? misc.extraTime.idlePort.value 
        : misc.extraTime.idlePort.value / 24,
      atSeaDays: misc.extraTime.atSea.unit === "days" 
        ? misc.extraTime.atSea.value 
        : misc.extraTime.atSea.value / 24,
      atSeaSpeedContext: misc.extraTime.atSea.mode,
    },
    applyEuaImpact,
    applyFuelEuImpact,
  };

  const results = useVoyageCalculation(voyageInputs);

  const cargoValidation = useMemo(
    () => validateCargoAssignments(cargos, sequence),
    [cargos, sequence],
  );

  return (
    <VoyageContext.Provider
      value={{
        applyEuaImpact,
        setApplyEuaImpact,
        applyFuelEuImpact,
        setApplyFuelEuImpact,
        vessel,
        setVessel,
        sequence,
        setSequence,
        updateSequenceRow,
        addPort,
        addRepositioning,
        removeSequence,
        recalculateDistances,
        autoDistanceEnabled,
        setAutoDistanceEnabled,
        distanceLoading,
        cargos,
        setCargos,
        addCargo,
        removeCargo,
        updateCargoEntry,
        vesselCost,
        setVesselCost,
        bunker,
        setBunker,
        updateBunker,
        updateBunkerField,
        addPortBunkering,
        removePortBunkering,
        updatePortBunkering,
        misc,
        setMisc,
        updateMisc,
        updateExtraTime,
        hireRate,
        setHireRate,
        netBB,
        setNetBB,
        resetState,
        results,
        cargoValidation,
        suppressDistanceRecalc,
        setDistanceSuppressed,
        departureUtc,
        setDepartureUtc,
      }}
    >
      {children}
    </VoyageContext.Provider>
  );
}

export function useVoyageContext() {
  const context = useContext(VoyageContext);
  if (!context) {
    // During HMR or initial load, context might briefly be null
    // Return a safe default to prevent crashes
    console.warn("VoyageContext not available - using defaults. This may occur during hot reload.");
    return {
      applyEuaImpact: false,
      setApplyEuaImpact: () => {},
      applyFuelEuImpact: false,
      setApplyFuelEuImpact: () => {},
      vessel: defaultVessel,
      setVessel: () => {},
      sequence: [],
      setSequence: () => {},
      updateSequenceRow: () => {},
      addPort: () => {},
      addRepositioning: () => {},
      removeSequence: () => {},
      recalculateDistances: () => {},
      autoDistanceEnabled: true,
      setAutoDistanceEnabled: () => {},
      distanceLoading: false,
      suppressDistanceRecalc: () => {},
      setDistanceSuppressed: () => {},
      departureUtc: "",
      setDepartureUtc: () => {},
      cargos: [],
      setCargos: () => {},
      addCargo: () => {},
      removeCargo: () => {},
      updateCargoEntry: () => {},
      vesselCost: 0,
      setVesselCost: () => {},
      bunker: { 
        hsfo: { price: 0, robStart: 0 }, 
        vlsfo: { price: 0, robStart: 0 }, 
        lsmgo: { price: 0, robStart: 0 }, 
        co2Price: 0,
        fuelMode: "average" as const,
        ignoreBOB: false,
        rewardFactor: 1.0,
        portBunkering: [],
        euEtsHsfo: 0,
        euEtsVlsfo: 0,
        euEtsLsmgo: 0,
      },
      setBunker: () => {},
      updateBunker: () => {},
      updateBunkerField: () => {},
      addPortBunkering: () => {},
      removePortBunkering: () => {},
      updatePortBunkering: () => {},
      misc: {
        miscCost: 0,
        extraFees: 0,
        extraInsurance: 0,
        canalCost1: 0,
        canalCost2: 0,
        tradeType: "",
        extraTime: {
          canal1: { mode: "VL", value: 0, unit: "days" as const },
          canal2: { mode: "VL", value: 0, unit: "days" as const },
          idlePort: { mode: "VL", value: 0, unit: "hours" as const },
          atSea: { mode: "EV", value: 0, unit: "hours" as const },
        },
      },
      setMisc: () => {},
      updateMisc: () => {},
      updateExtraTime: () => {},
      hireRate: 0,
      setHireRate: () => {},
      netBB: 0,
      setNetBB: () => {},
      resetState: () => {},
      results: {
        totalDistance: 0, totalEcaDistance: 0, seaDaysBallast: 0, seaDaysLaden: 0,
        totalSeaDays: 0, totalPortDays: 0, extraSeaDays: 0, extraPortDays: 0, extraCanalDays: 0,
        totalVoyageDays: 0, baseSeaTime: 0, seaMarginTime: 0,
        hsfoConsumption: 0, vlsfoConsumption: 0, lsmgoConsumption: 0, 
        totalBunkerCost: 0, grossFreight: 0, voyageCommission: 0, netFreight: 0, 
        portCosts: 0, miscCosts: 0, canalCosts: 0, totalVoyageCosts: 0,
        hireCost: 0, voyageCostInclHire: 0, voyageCostExclHire: 0, grossProfit: 0,
        netProfit: 0, tce: 0, ntce: 0, gtce: 0, pAndL: 0, totalCo2: 0,
        co2Laden: 0, co2Ballast: 0, efoi: 0, afrCii: 0, ciiRating: "A",
        // Enhanced emission fields
        co2ByFuel: { hsfo: 0, vlsfo: 0, lsmgo: 0, total: 0 },
        ciiResult: {
          actualCii: 0, requiredCii: 0, ciiRatio: 0, rating: 'A' as const,
          ratingDescription: '', boundaries: { A: 0, B: 0, C: 0, D: 0 }
        },
        etsResult: {
          totalCo2: 0, etsVoyageCoverage: 0, phaseInPercentage: 0,
          chargeableCo2: 0, etsCost: 0, legBreakdown: []
        },
        etsCost: 0, chargeableCo2: 0, etsVoyageCoverage: 0, etsPhaseIn: 0,
        emissionWarnings: [], emissionErrors: [], ladenDistance: 0,
        nonEcaFuel: { hsfo: 0, vlsfo: 0, lsmgo: 0, total: 0 },
        ecaFuel: { hsfo: 0, vlsfo: 0, lsmgo: 0, total: 0 },
        nonEcaCo2: 0, ecaCo2: 0, nonEcaDistance: 0, grossRate: 0,
        euCoveredFuel: { hsfo: 0, vlsfo: 0, lsmgo: 0 },
        totalCo2Cost: 0, euaCo2Cost: 0, euaFreightImpact: 0,
        fuelEuResult: {
          rewardFactor: 1.0,
          fuels: {
            hsfo: { costPerTon: 71.64, euQuantity: 0, cost: 0 },
            vlsfo: { costPerTon: 61.94, euQuantity: 0, cost: 0 },
            lsmgo: { costPerTon: 45.37, euQuantity: 0, cost: 0 },
          },
          totalPenalty: 0,
          costPerTon: { hsfo: 71.64, vlsfo: 61.94, lsmgo: 45.37 },
        },
        fuelEuTotalPenalty: 0,
        fuelEuFreightImpact: 0,
        etsLegDetails: [],
        perCargoBreakdown: [],
        repositioningCost: 0,
      },
      cargoValidation: { errors: [], hasErrors: false, usesExplicitMapping: false },
    } as VoyageContextValue;
  }
  return context;
}
