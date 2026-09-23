import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo, useRef } from "react";
import { useVoyageCalculation, type VoyageInputs, type VoyageResults } from "@/hooks/useVoyageCalculation";
import { defaultVessel, type VesselData } from "@/data/vessels";
import { getSeaRouteDistance, searchPorts as searchMarinePorts } from "@/services/marineApi";
import { type Port } from "@/components/voyage/PortSelect";
import { calculateSeaRouteDistance } from "@/utils/seaRouteDistance";
import { isPortEuEea } from "@/utils/euCountries";
import { validateCargoAssignments, type CargoValidationResult } from "@/utils/cargoValidation";
import { getCargoRowMap } from "@/utils/cargoRowMapping";
import { calculateDemurrageDespatchTotals, calculateCargoDemurrageDespatch } from "@/utils/demurrageDespatch";
import { getApiMode, API_MODE_CHANGED_EVENT } from "@/services/apiMode";
import {
  validateVessel,
  validateSequence,
  validateCargos,
  validateCargoHeader,
  MAX_CARGOS,
  type ValidationIssue,
} from "@/utils/validation";
import { toast } from "sonner";

// Default voyage departure used for the distance/weather-routing API when the
// user has not picked one: current UTC time, rounded down to the hour.
// Format matches the datetime-local input ("YYYY-MM-DDTHH:mm").
function defaultDepartureUtc(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:00`;
}


// Season options for Open Port
export type Season = "summer" | "winter" | "tropical" | "eca";

// Operation types for port sequences
export type PortOperation = "loading" | "discharging" | "pssg" | "bunkering";

// Speed context types for voyage legs
// EV = Eco Voyage (Outside ECA), EL = Eco Local (Inside ECA)
// FV = Full Voyage (Outside ECA), FL = Full Local (Inside ECA)
// V = VLSFO (no scrubber), H = HSFO (scrubber), L = LSMGO (inside ECA)
export type SpeedContext = "EV" | "EL" | "FV" | "FL" | "EH" | "FH";

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

  // Tanker mode: agreed laytime in hours (replaces quantity/productivity model)
  layTime?: number; // hours
  
  // Terms and time calculations
  terms: "shinc" | "sshex" | "shex" | "satpm" | "custom" | "";
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
  // DA split (tanker mode): owner's account is used in calculations;
  // charterer's account is reference-only. expDa always equals daOwnerAcct.
  daOwnerAcct?: number;
  daChartererAcct?: number;
  
  
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
  // UK ETS flags from port API (independent from EU ETS)
  ukEts?: boolean;
  ukZone?: "gb" | "ni" | null;
  
  // Weather delay from API (hours) - used when auto distance is ON
  weatherDelayHours?: number;
  // True when the distance API failed for this leg (searoute-js fallback used)
  // — makes the sea-margin input editable even while auto-distance is on.
  weatherDelayFailed?: boolean;
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
  /**
   * Tanker only — Worldscale percentage applied to the flat rate.
   * Effective $/mt = rate × (worldscale / 100). Can exceed 100.
   */
  worldscale?: number;
  voyageCommission: number;
  tcCommission: number;
  demurrageRate: number; // $/day
  despatchRate: number; // $/day
  demurrageAmount: number; // Total $ (can be calculated or manual)
  despatchAmount: number; // Total $ (can be calculated or manual)
  averageMode: "average" | "per_port" | "per_voyage";
  /**
   * Laytime settlement mode:
   *  - average         → ports offset each other, one net demurrage OR despatch
   *  - non_reversible  → every port settles on its own (no offsetting)
   *  - cancelled       → all demurrage/despatch cancelled for this cargo
   */
  laytimeMode?: "average" | "non_reversible" | "cancelled";
  ntcBase: number; // Benchmark NTC $/day
  gtcTarget: number; // Target GTC $/day
  netBBOverride?: number; // Manual override for Net BB
  stowageFactor: number; // Global stowage factor (m³/mt)
  /**
   * Cargo-level Charter Party overrides for assigned sequence rows.
   * Keyed by sequence row id. When present, the override REPLACES the
   * value coming from the sequence for calculation purposes — without
   * mutating the sequence row itself.
   */
  cpOverrides?: Record<number, {
    quantity?: number;
    productivity?: number;
    demurrage?: number;
    despatch?: number;
    turnTime?: number;
    extraTime?: number;
    terms?: string;
    coefficientFactor?: number;
    layTime?: number;
  }>;
  /**
   * Cargo-level OPERATIONAL overrides for assigned sequence rows.
   * Keyed by sequence row id. These are the actual/operational values
   * shown in the Cargo section's per-row inputs. They are INDEPENDENT
   * from the sequence row values (which act as the Charter Party
   * baseline) so editing one side does not mutate the other.
   */
  opOverrides?: Record<number, {
    quantity?: number;
    productivity?: number;
    turnTime?: number;
    extraTime?: number;
    terms?: string;
    coefficientFactor?: number;
    cranes?: number;
    expDa?: number;
    layTime?: number;
  }>;
}

interface VoyageContextValue {
  // Regulatory freight impact toggles
  applyEuaImpact: boolean;
  setApplyEuaImpact: (v: boolean) => void;
  applyFuelEuImpact: boolean;
  setApplyFuelEuImpact: (v: boolean) => void;
  applyUkEtsImpact: boolean;
  setApplyUkEtsImpact: (v: boolean) => void;
  vessel: VesselData;
  setVessel: (vessel: VesselData) => void;
  syncSequenceSpeedContexts: (speedProfile: "eco" | "full", hasScrubber: boolean) => void;
  
  // Sequence state
  sequence: SequenceRowUI[];
  setSequence: React.Dispatch<React.SetStateAction<SequenceRowUI[]>>;
  updateSequenceRow: (id: number, field: keyof SequenceRowUI, value: string | number) => void;
  addPort: (operation: PortOperation) => void;
  addRepositioning: () => void;
  removeSequence: (id: number) => void;
  recalculateDistances: (force?: boolean) => void;
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
  updateCargoCpOverride: (
    cargoId: number,
    rowId: number,
    field: "quantity" | "productivity" | "demurrage" | "despatch",
    value: number,
  ) => void;
  updateCargoOpOverride: (
    cargoId: number,
    rowId: number,
    field: "quantity" | "productivity" | "turnTime" | "extraTime" | "terms" | "coefficientFactor" | "cranes" | "expDa" | "layTime",
    value: number | string,
  ) => void;
  
  // Vessel cost (global)
  vesselCost: number;
  setVesselCost: (cost: number) => void;

  // Linked charterer (company name from companies API)
  charterer: string;
  setCharterer: (name: string) => void;
  
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
  notes: string;
  setNotes: (value: string) => void;
   
   // Calculated results
   results: VoyageResults;

   // Cargo assignment validation (route mapping)
   cargoValidation: CargoValidationResult;

   // Field-level validation
   validationIssues: ValidationIssue[];
   hasErrors: boolean;
   getFieldError: (
     section: "vessel" | "sequence" | "cargo",
     field: string,
     rowId?: number | string,
   ) => string | undefined;
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
  /** Fuel burned by the main engine during canal transit. */
  canalFuel?: "hsfo" | "vlsfo" | "lsmgo";
  
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
  // Separate carbon prices per scheme (fallback to co2Price when 0/undefined)
  euEtsPrice: number;
  ukEtsPrice: number;
  
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
export function calculatePortDays(row: SequenceRowUI): number {
  if (row.type === "open" || row.type === "repos") {
    return 0;
  }
  
  if (row.operation === "pssg" || row.operation === "bunkering") {
    // For pssg/bunkering, use turn time + extra time only
    return (row.turnTime + row.extraTime) / 24;
  }
  
  if (row.operation === "loading" || row.operation === "discharging") {
    // Tanker sheets have no mt/day productivity — port time is driven by the
    // agreed laytime (hours) plus turn/extra time.
    if (getApiMode() === "tanker") {
      return ((row.layTime || 0) + row.turnTime + row.extraTime) / 24;
    }

    if (row.productivity <= 0 || row.quantity <= 0) {
      return (row.turnTime + row.extraTime) / 24;
    }
    
    // Base port days = quantity / productivity
    const basePortDays = row.quantity / row.productivity;
    
    // Terms multiplier - use editable coefficientFactor
    const termsMultiplier = row.coefficientFactor || (row.terms === "sshex" ? 1.5555 : row.terms === "shex" ? 1.2727 : row.terms === "satpm" ? 1.3333 : 1.0);
    
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
  const isEcoContext = speedContext.startsWith("E");
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
    if (useWeatherDelay && row.weatherDelayHours !== undefined && !row.weatherDelayFailed) {
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
  distanceSpeedContext: (speedProfile === "eco" ? "E" : "F") + (hasScrubber ? "H" : "V") as SpeedContext, // Non-ECA speed context
  ecaDistance: 0,
  // Scrubber-fitted vessels may burn HSFO inside ECA zones too → default EH/FH
  ecaDistanceSpeedContext: (speedProfile === "eco" ? "E" : "F") + (hasScrubber ? "H" : "L") as SpeedContext,
  baseSeaTime: 0,
  seaMarginTime: 0,
  ecaTime: 0,
  seaTime: 0,
  totalLegTime: 0,
  timeOverride: undefined,
  quantity: 0,
  productivity: type === "port" && (operation === "loading" || operation === "discharging") ? 8000 : 0,
  layTime: type === "port" && (operation === "loading" || operation === "discharging") ? 24 : 0,
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
    worldscale: 100,
    quantity: 56550,
    voyageCommission: 1.25,
    tcCommission: 3.75,
    demurrageRate: 0,
    despatchRate: 0,
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
  vlsfo: { price: 450, robStart: 0 },
  lsmgo: { price: 750, robStart: 0 },
  co2Price: 0,
  euEtsPrice: 0,
  ukEtsPrice: 0,
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
  canalFuel: "vlsfo",
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
  const [cargos, setCargosRaw] = useState<CargoEntry[]>(() => {
    const fromData = initialData?.cargos as CargoEntry[] | undefined;
    return Array.isArray(fromData) && fromData.length > 0 ? fromData : initialCargos;
  });
  // A sheet must always carry at least one cargo — saved sheets with an empty
  // cargo list (possible on tanker sheets) fall back to the default cargo.
  const setCargos = useCallback<React.Dispatch<React.SetStateAction<CargoEntry[]>>>((value) => {
    setCargosRaw((prev) => {
      const next = typeof value === "function" ? (value as (p: CargoEntry[]) => CargoEntry[])(prev) : value;
      return Array.isArray(next) && next.length > 0 ? next : initialCargos;
    });
  }, []);
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
  const [charterer, setCharterer] = useState<string>(() =>
    typeof initialData?.charterer === "string" ? initialData.charterer : ""
  );
  const [autoDistanceEnabled, setAutoDistanceEnabled] = useState(() =>
    initialData?.autoDistanceEnabled === true
  );
  const [applyEuaImpact, setApplyEuaImpact] = useState(() =>
    initialData?.applyEuaImpact === true
  );
  const [applyFuelEuImpact, setApplyFuelEuImpact] = useState(() =>
    initialData?.applyFuelEuImpact === true
  );
  const [applyUkEtsImpact, setApplyUkEtsImpact] = useState(() =>
    initialData?.applyUkEtsImpact === true
  );
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [departureUtc, setDepartureUtc] = useState(() =>
    (initialData?.departureUtc as string) || defaultDepartureUtc()
  );

  const [notes, setNotes] = useState<string>(() =>
    typeof initialData?.notes === "string" ? (initialData.notes as string) : ""
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
      const currentPortCount = prev.filter(r => r.type !== "open").length;
      if (currentPortCount >= 30) {
        toast.error("Maximum 30 ports/legs allowed per voyage");
        return prev;
      }
      const nextId = Math.max(...prev.map(s => s.id), 0) + 1;
      const newRow = createNewRow("port", nextId, operation, vessel.speedProfile, 4, vessel.hasScrubber);
      
      // Insert before repos (if any exist at the end)
      const reposRows = prev.filter(r => r.type === "repos");
      const nonReposRows = prev.filter(r => r.type !== "repos");
      return [...nonReposRows, newRow, ...reposRows];
    });
  }, [vessel.speedProfile, vessel.hasScrubber]);

  const addRepositioning = useCallback(() => {
    setSequence(prev => {
      const currentPortCount = prev.filter(r => r.type !== "open").length;
      if (currentPortCount >= 30) {
        toast.error("Maximum 30 ports/legs allowed per voyage");
        return prev;
      }
      const nextId = Math.max(...prev.map(s => s.id), 0) + 1;
      const newRow = createNewRow("repos", nextId, undefined, vessel.speedProfile, 4, vessel.hasScrubber);
      return [...prev, newRow];
    });
  }, [vessel.speedProfile, vessel.hasScrubber]);

  // Called only by the explicit Speed Profile and Scrubber controls. Keeping this
  // separate from setVessel prevents sheet hydration and API updates from rewriting rows.
  const syncSequenceSpeedContexts = useCallback((speedProfile: "eco" | "full", hasScrubber: boolean) => {
    const prefix = speedProfile === "eco" ? "E" : "F";
    // Scrubber-fitted vessels default to HSFO everywhere (non-ECA and ECA).
    // Without a scrubber, HSFO is downgraded to VLSFO / LSMGO.
    const remap = (ctx: string, fallbackFuel: "H" | "V" | "L"): SpeedContext => {
      let fuel = (ctx || "").toUpperCase().slice(1, 2) || fallbackFuel;
      if (fuel !== "H" && fuel !== "V" && fuel !== "L") fuel = fallbackFuel;
      if (hasScrubber) fuel = "H";
      else if (fuel === "H") fuel = fallbackFuel === "L" ? "L" : "V";
      return `${prefix}${fuel}` as SpeedContext;
    };
    setSequence(rows => rows.map(row => {
      const nonEca = remap(row.distanceSpeedContext, "V");
      const eca = remap(row.ecaDistanceSpeedContext, "L");
      const portFuelType: "hsfo" | "vlsfo" | "lsmgo" = hasScrubber
        ? "hsfo"
        : row.portFuelType === "hsfo" ? "vlsfo" : row.portFuelType;
      return row.distanceSpeedContext === nonEca && row.ecaDistanceSpeedContext === eca && row.portFuelType === portFuelType
        ? row
        : { ...row, distanceSpeedContext: nonEca, ecaDistanceSpeedContext: eca, portFuelType };
    }));
  }, []);

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
  const sequenceRef = useRef(sequence);
  sequenceRef.current = sequence;

   // Track the last computed port key per leg to avoid redundant API calls
   const lastComputedLegsRef = useRef<Map<number, string>>(new Map());
    const recalcRunIdRef = useRef(0);

  const recalculateDistances = useCallback(async (force = false) => {
    setDistanceLoading(true);
    // Take a snapshot of current sequence for API calls
    let snapshot: SequenceRowUI[] = [];
    setSequence(prev => { snapshot = [...prev]; return prev; });
    // Allow state to flush
    await new Promise(r => setTimeout(r, 0));

    if (snapshot.length === 0) { setDistanceLoading(false); return; }

    // Need at least one complete leg: two consecutive rows with a selected port.
    const hasCompleteLeg = snapshot.some((row, idx) => {
      if (idx === 0) return false;
      const prev = snapshot[idx - 1];
      return !!(prev.port && prev.portUnloc && row.port && row.portUnloc);
    });
    if (!hasCompleteLeg) {
      // Nothing fetchable yet — zero out all distances
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
    const distanceResults: Map<number, { distance: number; ecaDistance: number; weatherDelayHours?: number; weatherDelayFailed?: boolean; eta?: string }> = new Map();
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

      // Rule: Back-to-back same ports → zero distance, no API call, no fallback.
      const sameUnloc = !!prevRow.portUnloc && prevRow.portUnloc === currRow.portUnloc;
      const sameCoords =
        prevRow.coordinates && currRow.coordinates &&
        prevRow.coordinates[0] === currRow.coordinates[0] &&
        prevRow.coordinates[1] === currRow.coordinates[1];
      if (sameUnloc || sameCoords) {
        console.log(`[Distance] Leg ${i} (${prevRow.port} → ${currRow.port}): same port, distance = 0`);
        distanceResults.set(currRow.id, {
          distance: 0,
          ecaDistance: 0,
          weatherDelayHours: 0,
          weatherDelayFailed: false,
        });
        continue;
      }

       // Skip if this leg hasn't changed since last calculation (unless forced)
       const previousLegKey = lastComputedLegsRef.current.get(currRow.id);
       const hasExistingDistance = (currRow.distance || 0) > 0 || (currRow.ecaDistance || 0) > 0;
       if (!force && previousLegKey === legKey && hasExistingDistance) {
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

        // Use cascading leg departure from sequence row; fall back to the
        // voyage departure (or "now") so vessel_speed + departure_utc are
        // always sent together, as the distance API requires.
        const baseDeparture = (departureUtc || defaultDepartureUtc()).replace("T", " ");
        const legDepartureUtc = currRow.legDepartureUtc
          ? currRow.legDepartureUtc.replace("T", " ")
          : baseDeparture;


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
        // If API returned no usable distance, throw to trigger searoute-js fallback
        if (totalDist <= 0 && nonEcaDist <= 0 && ecaDist <= 0) {
          throw new Error("Distance API returned zero distance");
        }
        distanceResults.set(currRow.id, {
          distance: Math.round(nonEcaDist),
          ecaDistance: Math.round(ecaDist),
          weatherDelayHours: result.delayHours,
          weatherDelayFailed: result.delayHours === undefined,
          eta: result.eta,
        });
      } catch (error) {
        console.warn(`[Distance] API failed for leg ${i} (${prevRow.port} → ${currRow.port}), falling back to searoute-js:`, error);
        // Fallback: use client-side searoute-js library with lat/lon from port API
        // (coordinates are [lon, lat] as returned by /ports/search)
        try {
          const prevPort: Port = {
            id: 0,
            unloc: prevRow.portUnloc || '',
            name: prevRow.port || '',
            city: '',
            country: prevRow.portCountry || '',
            coordinates: prevRow.coordinates,
          };
          const currPort: Port = {
            id: 0,
            unloc: currRow.portUnloc || '',
            name: currRow.port || '',
            city: '',
            country: currRow.portCountry || '',
            coordinates: currRow.coordinates,
          };
          const fallback = calculateSeaRouteDistance(prevPort, currPort);
          if (fallback.success && fallback.distance > 0) {
            console.log(`[Distance] searoute-js fallback for leg ${i}: ${fallback.distance} nm (no ECA breakdown)`);
            distanceResults.set(currRow.id, {
              distance: fallback.distance,
              ecaDistance: 0,
              weatherDelayHours: undefined,
              weatherDelayFailed: true,
            });
          } else {
            console.error(`[Distance] searoute-js returned no route for leg ${i}:`, fallback.error);
            distanceResults.set(currRow.id, {
              distance: 0,
              ecaDistance: 0,
              weatherDelayHours: undefined,
              weatherDelayFailed: true,
            });
          }
        } catch (fallbackErr) {
          console.error(`[Distance] searoute-js threw for leg ${i}:`, fallbackErr);
          distanceResults.set(currRow.id, {
            distance: 0,
            ecaDistance: 0,
            weatherDelayHours: undefined,
            weatherDelayFailed: true,
          });
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
        return dist ? {
          ...row,
          distance: dist.distance,
          ecaDistance: dist.ecaDistance,
          weatherDelayHours: dist.weatherDelayHours,
          weatherDelayFailed: dist.weatherDelayFailed,
          eta: dist.eta,
        } : row;
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
      worldscale: 100,
      quantity: 0,
      voyageCommission: 1.25,
      tcCommission: 3.75,
      demurrageRate: 0,
      despatchRate: 0,
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
      euEtsPrice: 0,
      ukEtsPrice: 0,
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
      canalFuel: "vlsfo",
      extraTime: {
        canal1: { mode: "VL", value: 0, unit: "days" },
        canal2: { mode: "VL", value: 0, unit: "days" },
        idlePort: { mode: "VL", value: 0, unit: "hours" },
        atSea: { mode: "EV", value: 0, unit: "hours" },
      },
    });
    setHireRate(0);
    setVesselCost(0);
    setNotes("");
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

  // Trigger a recalculation immediately when the user toggles auto-distance ON
  // (even if ports have not changed since last edit).
  const prevAutoDistRef = useRef(autoDistanceEnabled);
  useEffect(() => {
    const wasOff = prevAutoDistRef.current === false;
    prevAutoDistRef.current = autoDistanceEnabled;
    if (wasOff && autoDistanceEnabled && portCoordsKey) {
      const timer = setTimeout(() => {
        // Force a fresh fetch so enabling the checkbox always calls the API,
        // even when the port pairs have not changed since the last run.
        recalcRef.current(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoDistanceEnabled, portCoordsKey]);

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
      const updates: Record<number, Partial<Pick<SequenceRowUI, "portId" | "portUnloc" | "coordinates" | "isEuEea" | "portCountry" | "ukEts" | "ukZone">>> = {};
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
              // EU ETS: use API's eu_zone field. Never infer from country name.
              isEuEea: match.eu_zone === true || (match.eu_zone === undefined && match.is_eu_eea === true),
              portCountry: match.country,
              ukEts: match.uk_ets === true,
              ukZone: match.uk_zone ?? null,
            };
          } else {
            // No API match — leave EU flag unchanged; do NOT infer from country.
            updates[row.id] = { portCountry: row.portCountry };
          }
        } catch {
          updates[row.id] = { portCountry: row.portCountry };
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
      if (prev.length >= MAX_CARGOS) {
        toast.error("Maximum 5 cargoes are allowed per voyage");
        return prev;
      }
      const nextId = Math.max(...prev.map(c => c.id), 0) + 1;
      return [...prev, {
        id: nextId,
        rate: 0,
        rateType: "mt" as const,
        worldscale: 100,
        quantity: 0,
        voyageCommission: 1.25,
        tcCommission: 3.75,
        demurrageRate: 0,
        despatchRate: 0,
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

  const updateCargoCpOverride = useCallback(
    (
      cargoId: number,
      rowId: number,
      field: "quantity" | "productivity" | "demurrage" | "despatch",
      value: number,
    ) => {
      setCargos((prev) =>
        prev.map((c) =>
          c.id !== cargoId
            ? c
            : {
                ...c,
                cpOverrides: {
                  ...(c.cpOverrides || {}),
                  [rowId]: {
                    ...(c.cpOverrides?.[rowId] || {}),
                    [field]: value,
                  },
                },
              },
        ),
      );
    },
    [],
  );

  const updateCargoOpOverride = useCallback(
    (
      cargoId: number,
      rowId: number,
      field: "quantity" | "productivity" | "turnTime" | "extraTime" | "terms" | "coefficientFactor" | "cranes" | "expDa" | "layTime",
      value: number | string,
    ) => {
      // CP baseline always comes live from the Sequence row, so sequence edits keep
      // flowing into CP days / delta days. Only the operational values are stored here.
      setCargos((prev) =>
        prev.map((c) => {
          if (c.id !== cargoId) return c;
          return {
            ...c,
            opOverrides: {
              ...(c.opOverrides || {}),
              [rowId]: {
                ...(c.opOverrides?.[rowId] || {}),
                [field]: value,
              },
            },
          };
        }),
      );

    },
    [],
  );

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

  // Active sector mode — Worldscale pricing applies to tanker sheets only.
  const [sectorMode, setSectorMode] = useState(getApiMode());
  useEffect(() => {
    const onModeChange = () => setSectorMode(getApiMode());
    window.addEventListener(API_MODE_CHANGED_EVENT, onModeChange);
    return () => window.removeEventListener(API_MODE_CHANGED_EVENT, onModeChange);
  }, []);

  // Port-day model differs per sector (tanker = laytime hours), so recompute
  // derived rows whenever the active sector changes.
  useEffect(() => {
    setSequence((prev) => recalculateDerivedSequenceRows(prev, vessel, autoDistanceEnabled, departureUtc));
     
  }, [sectorMode]);

  /** Effective $/mt rate: tanker applies Worldscale % to the flat rate. */
  const effectiveCargoRate = useCallback(
    (c: { rate: number; rateType: "mt" | "lumpsum"; worldscale?: number }) => {
      const rate = c.rate || 0;
      if (c.rateType === "lumpsum" || sectorMode !== "tanker") return rate;
      const ws = c.worldscale ?? 100;
      return rate * (ws / 100);
    },
    [sectorMode],
  );

  // Calculate cargo quantity from sequence load/discharge operations
  const sequenceCargoQuantity = useMemo(() => {
    // CP override qty/productivity are reference-only for demurrage/despatch
    // comparison — they MUST NOT modify operational values. Always use the
    // original sequence row values.
    const effectiveQty = (row: SequenceRowUI): number => row.quantity || 0;
    const loadingQuantity = sequence
      .filter((row) => row.operation === "loading")
      .reduce((sum, row) => sum + effectiveQty(row), 0);
    const dischargingQuantity = sequence
      .filter((row) => row.operation === "discharging")
      .reduce((sum, row) => sum + effectiveQty(row), 0);
    return Math.max(loadingQuantity, dischargingQuantity);
  }, [sequence, cargos]);

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
      // CP overrides are reference-only and never replace operational qty.
      const ovQty = (row: SequenceRowUI) => row.quantity || 0;
      // Single cargo: all loading rows belong to it.
      if (cargos.length === 1) {
        return loadingRows.reduce((sum, r) => sum + ovQty(r), 0);
      }
      if (usesExplicitMapping) {
        return loadingRows
          .filter((r) => (r.assignedCargoIds || []).includes(cargoId))
          .reduce((sum, r) => sum + ovQty(r), 0);
      }
      return loadingRows[ci] ? ovQty(loadingRows[ci]) : 0;
    };

    // Gross freight = Σ (rate × per-cargo loaded qty), lumpsum added as-is.
    const totalGrossFreight = cargos.reduce((sum, c, ci) => {
      if (c.rateType === "lumpsum") return sum + (c.rate || 0);
      return sum + effectiveCargoRate(c) * loadedQtyForCargo(c.id, ci);
    }, 0);
    
    const avgVoyComm = cargos.length > 0 
      ? cargos.reduce((sum, c) => sum + c.voyageCommission, 0) / cargos.length 
      : 0;
    const avgTcComm = cargos.length > 0 
      ? cargos.reduce((sum, c) => sum + c.tcCommission, 0) / cargos.length 
      : 0;
    const demurrageDespatch = calculateDemurrageDespatchTotals(cargos, sequence);
    const totalDemurrage = demurrageDespatch.demurrageAmount;
    const totalDespatch = demurrageDespatch.despatchAmount;

    return {
      rate: totalQuantity > 0 ? totalGrossFreight / totalQuantity : 0,
      rateType: "mt" as const,
      quantity: totalQuantity,
      voyageCommission: avgVoyComm,
      tcCommission: avgTcComm,
      demurrage: totalDemurrage,
      despatch: totalDespatch,
    };
  }, [cargos, sequence, sequenceCargoQuantity, effectiveCargoRate]);

  // Transform UI state to calculation inputs
  const cargoRowMapForInputs = getCargoRowMap(cargos, sequence);
  const voyageInputs: VoyageInputs = {
    vessel,
    sequence: sequence.map(row => {
      // Operational overrides (entered in CargoSection) affect actual expenses,
      // fuel, and port days only while demurrage/despatch is active. Sequence rows
      // stay untouched and remain the CP baseline. If rates are reset to 0, ignore
      // opOverrides and calculate from Sequence again.
      let opOv: NonNullable<CargoEntry["opOverrides"]>[number] | undefined;
      for (const c of cargos) {
        const cargoDdActive = (c.demurrageRate || 0) > 0 || (c.despatchRate || 0) > 0;
        if (!cargoDdActive) continue;
        const o = c.opOverrides?.[row.id];
        if (o && Object.keys(o).length > 0) { opOv = o; break; }
      }
      const hasOp = !!opOv;
      // Quantity overrides in the dem/des panel are settlement-only for
      // FREIGHT — the demurrage/despatch amount already captures the quantity
      // difference, so freight must always use the original Sequence quantity
      // to avoid double-counting. However, the changed quantity still drives
      // PORT DAYS, and therefore port bunkering/fuel consumption, because more
      // (or less) cargo genuinely takes more (or less) time alongside.
      const effQty = row.quantity;
      const effTurnTime = hasOp && opOv!.turnTime !== undefined ? opOv!.turnTime : row.turnTime;
      const effExtraTime = hasOp && opOv!.extraTime !== undefined ? opOv!.extraTime : row.extraTime;
      const portDays = hasOp
        ? calculatePortDays({
            ...row,
            quantity: opOv!.quantity ?? row.quantity,
            productivity: opOv!.productivity ?? row.productivity,
            turnTime: effTurnTime,
            extraTime: effExtraTime,
            terms: (opOv!.terms as SequenceRowUI["terms"]) ?? row.terms,
            coefficientFactor: opOv!.coefficientFactor ?? row.coefficientFactor,
            layTime: opOv!.layTime ?? row.layTime,
          })
        : row.calculatedPortDays;
      const effExpDa = hasOp && opOv!.expDa !== undefined ? opOv!.expDa : row.expDa;
      return {
      id: row.id,
      operation: row.operation || "",
      port: row.port,
      portUnloc: row.portUnloc,
      cgo: "",
      distance: row.distance,
      ecaDistance: row.ecaDistance,
      portDays,
      quantity: effQty,
      expDa: effExpDa,
      // Pass sea margin adjusted times for accurate downstream calculations
      seaTime: row.totalLegTime, // Total sea time WITH sea margin applied
      ecaTime: row.ecaTime, // ECA sea time WITH margin
      nonEcaTime: row.seaTime, // Non-ECA sea time WITH margin (named seaTime in UI)
      baseSeaTime: row.baseSeaTime, // Base time without margin (for reference)
      seaMarginTime: row.seaMarginTime, // Extra time from sea margin
      seaMargin: row.seaMargin, // Sea margin percentage
      // Port time breakdown for fuel consumption split
      turnTimeHours: effTurnTime || 0, // Turn time in hours
      extraTimeHours: effExtraTime || 0, // Extra time in hours
      // Terms coefficient — >1 portion of working time burns at the idle rate
      termsFactor: (() => {
        const cf = hasOp ? (opOv!.coefficientFactor ?? row.coefficientFactor) : row.coefficientFactor;
        const t = (hasOp ? ((opOv!.terms as string) ?? row.terms) : row.terms) || "";
        const fallback = t === "sshex" ? 1.5555 : t === "shex" ? 1.2727 : t === "satpm" ? 1.3333 : 1.0;
        const f = Number(cf) > 0 ? Number(cf) : fallback;
        return f < 1 ? 1 : f;
      })(),
      portFuelType: row.portFuelType, // Port fuel type per leg
      distanceSpeedContext: row.distanceSpeedContext, // non-ECA speed/fuel context
      ecaDistanceSpeedContext: row.ecaDistanceSpeedContext, // ECA speed/fuel context
      isEuEea: row.isEuEea, // EU/EEA flag from port API
      ukEts: row.ukEts,
      ukZone: row.ukZone ?? null,
      // Pass through for per-cargo route-bounded allocation
      type: row.type,
      assignedCargoIds: row.assignedCargoIds,
      };
    }),
    cargo: aggregatedCargo,
    cargos: cargos.map(c => {
      const dd = calculateCargoDemurrageDespatch(c, cargos, sequence);
      return {
        id: c.id,
        rate: effectiveCargoRate(c),
        rateType: c.rateType,
        voyageCommission: c.voyageCommission,
        tcCommission: c.tcCommission,
        demurrage: dd.demurrageAmount,
        despatch: dd.despatchAmount,
        extraDays: dd.totalExtraDays,
      };
    }),
    bunker: {
      hsfo: { price: bunker.hsfo.price, robStart: bunker.hsfo.robStart },
      vlsfo: { price: bunker.vlsfo.price, robStart: bunker.vlsfo.robStart },
      lsmgo: { price: bunker.lsmgo.price, robStart: bunker.lsmgo.robStart },
      co2Price: bunker.co2Price,
      euEtsPrice: bunker.euEtsPrice,
      ukEtsPrice: bunker.ukEtsPrice,
      rewardFactor: bunker.rewardFactor,
      fuelMode: bunker.fuelMode,
      ignoreBOB: bunker.ignoreBOB,
      portBunkering: bunker.portBunkering.map(p => ({
        hsfo: { quantity: p.hsfo.quantity, price: p.hsfo.price },
        vlsfo: { quantity: p.vlsfo.quantity, price: p.vlsfo.price },
        lsmgo: { quantity: p.lsmgo.quantity, price: p.lsmgo.price },
      })),
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
      canalFuel: misc.canalFuel,
    },
    applyEuaImpact,
    applyFuelEuImpact,
    applyUkEtsImpact,
  };

  const results = useVoyageCalculation(voyageInputs);

  const cargoValidation = useMemo(
    () => validateCargoAssignments(cargos, sequence),
    [cargos, sequence],
  );

  // Field-level validation across vessel, sequence, and cargos
  const validationIssues = useMemo<ValidationIssue[]>(() => {
    const issues: ValidationIssue[] = [];
    issues.push(...validateVessel(vessel));
    issues.push(...validateSequence(sequence));

    // Per-cargo load/discharge balance maps
    const loaded = new Map<number, number>();
    const disch = new Map<number, number>();
    const usesExplicit = sequence.some((r) => (r.assignedCargoIds || []).length > 0);
    if (cargos.length === 1) {
      const only = cargos[0].id;
      loaded.set(
        only,
        sequence.filter((r) => r.operation === "loading").reduce((s, r) => s + (r.quantity || 0), 0),
      );
      disch.set(
        only,
        sequence.filter((r) => r.operation === "discharging").reduce((s, r) => s + (r.quantity || 0), 0),
      );
    } else if (usesExplicit) {
      cargos.forEach((c) => {
        const l = sequence
          .filter((r) => r.operation === "loading" && (r.assignedCargoIds || []).includes(c.id))
          .reduce((s, r) => s + (r.quantity || 0), 0);
        const d = sequence
          .filter((r) => r.operation === "discharging" && (r.assignedCargoIds || []).includes(c.id))
          .reduce((s, r) => s + (r.quantity || 0), 0);
        loaded.set(c.id, l);
        disch.set(c.id, d);
      });
    } else {
      // Auto-map by order: cargo[i] gets loading[i] and discharging[i]
      const loadRows = sequence.filter((r) => r.operation === "loading");
      const dischRows = sequence.filter((r) => r.operation === "discharging");
      cargos.forEach((c, i) => {
        loaded.set(c.id, loadRows[i]?.quantity || 0);
        disch.set(c.id, dischRows[i]?.quantity || 0);
      });
    }
    issues.push(...validateCargos(cargos, loaded, disch));

    // Header-derived cargo numbers (GTC, Gross BB) — not applicable in tanker mode
    if (sectorMode !== "tanker") {
      const tc = (cargos[0]?.tcCommission ?? 3.75) / 100;
      const gtc = tc < 1 ? hireRate / (1 - tc) : 0;
      const grossBB = tc < 1 ? netBB / (1 - tc) : 0;
      issues.push(...validateCargoHeader(gtc, grossBB));
    }

    return issues;
  }, [vessel, sequence, cargos, hireRate, netBB, sectorMode]);

  const hasErrors = validationIssues.length > 0;

  const getFieldError = useCallback(
    (
      section: "vessel" | "sequence" | "cargo",
      field: string,
      rowId?: number | string,
    ): string | undefined => {
      const issue = validationIssues.find(
        (i) =>
          i.section === section &&
          i.field === field &&
          (rowId === undefined ? i.rowId === undefined : i.rowId === rowId),
      );
      return issue?.message;
    },
    [validationIssues],
  );

  return (
    <VoyageContext.Provider
      value={{
        applyEuaImpact,
        setApplyEuaImpact,
        applyFuelEuImpact,
        setApplyFuelEuImpact,
        applyUkEtsImpact,
        setApplyUkEtsImpact,
        vessel,
        setVessel,
        syncSequenceSpeedContexts,
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
        updateCargoCpOverride,
        updateCargoOpOverride,
        vesselCost,
        setVesselCost,
        charterer,
        setCharterer,
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
        validationIssues,
        hasErrors,
        getFieldError,
        suppressDistanceRecalc,
        setDistanceSuppressed,
        departureUtc,
        setDepartureUtc,
        notes,
        setNotes,
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
      applyUkEtsImpact: false,
      setApplyUkEtsImpact: () => {},
      vessel: defaultVessel,
      setVessel: () => {},
      syncSequenceSpeedContexts: () => {},
      sequence: [],
      setSequence: () => {},
      updateSequenceRow: () => {},
      addPort: () => {},
      addRepositioning: () => {},
      removeSequence: () => {},
      recalculateDistances: () => {},
      autoDistanceEnabled: false,
      setAutoDistanceEnabled: () => {},
      distanceLoading: false,
      suppressDistanceRecalc: () => {},
      setDistanceSuppressed: () => {},
      departureUtc: "",
      setDepartureUtc: () => {},
      notes: "",
      setNotes: () => {},
      cargos: [],
      setCargos: () => {},
      addCargo: () => {},
      removeCargo: () => {},
      updateCargoEntry: () => {},
      updateCargoCpOverride: () => {},
      updateCargoOpOverride: () => {},
      vesselCost: 0,
      setVesselCost: () => {},
      charterer: "",
      setCharterer: () => {},
      bunker: { 
        hsfo: { price: 0, robStart: 0 }, 
        vlsfo: { price: 0, robStart: 0 }, 
        lsmgo: { price: 0, robStart: 0 }, 
        co2Price: 0,
        euEtsPrice: 0,
        ukEtsPrice: 0,
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
        totalBunkerCost: 0, effectiveFuelPrices: { hsfo: 0, vlsfo: 0, lsmgo: 0 }, grossFreight: 0, voyageCommission: 0, netFreight: 0, 
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
          voyageYear: new Date().getFullYear(),
          ghgLimit: 89.34,
          voyageGhg: 0,
          totalEuEnergy: 0,
          hsfoBalance: 0,
          vlsfoBalance: 0,
          mgoBalance: 0,
          totalBalance: 0,
          penaltyEur: 0,
          totalPenalty: 0,
          rewardFactor: 1.0,
          fuels: {
            hsfo: { fuelType: 'hsfo', euQuantity: 0, lcv: 0.0405, ghg: 91.6012, euEnergy: 0, balance: 0, penaltyEur: 0, costPerTon: 0, cost: 0 },
            vlsfo: { fuelType: 'vlsfo', euQuantity: 0, lcv: 0.0410, ghg: 91.2512, euEnergy: 0, balance: 0, penaltyEur: 0, costPerTon: 0, cost: 0 },
            lsmgo: { fuelType: 'lsmgo', euQuantity: 0, lcv: 0.0427, ghg: 90.6319, euEnergy: 0, balance: 0, penaltyEur: 0, costPerTon: 0, cost: 0 },
          },
          costPerTon: { hsfo: 0, vlsfo: 0, lsmgo: 0 },
          legs: [],
        },
        fuelEuTotalPenalty: 0,
        fuelEuFreightImpact: 0,
        etsLegDetails: [],
        perCargoBreakdown: [],
        repositioningCost: 0,
        ukEtsResult: {
          phaseIn: 0,
          ukCoveredFuel: { hsfo: 0, vlsfo: 0, lsmgo: 0 },
          ukCoveredCo2: 0,
          chargeableCo2: 0,
          ukEtsCost: 0,
          ukVoyageCoverage: 0,
          legBreakdown: [],
        },
        ukEtsCost: 0,
        ukChargeableCo2: 0,
        ukEtsVoyageCoverage: 0,
        ukEtsPhaseIn: 0,
        ukEtsFreightImpact: 0,
      },
      cargoValidation: { errors: [], hasErrors: false, usesExplicitMapping: false },
      validationIssues: [],
      hasErrors: false,
      getFieldError: () => undefined,
    } as VoyageContextValue;
  }
  return context;
}
