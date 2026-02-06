import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from "react";
import { useVoyageCalculation, type VoyageInputs, type VoyageResults } from "@/hooks/useVoyageCalculation";
import { defaultVessel, type VesselData } from "@/data/vessels";
import { calculateSeaRouteDistance } from "@/utils/seaRouteDistance";
import { type Port } from "@/components/voyage/PortSelect";

// Season options for Open Port
export type Season = "summer" | "winter" | "tropical" | "eca";

// Operation types for port sequences
export type PortOperation = "loading" | "discharging" | "waiting" | "bunkering";

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
  ecaTime: number; // days sailing in ECA
  seaTime: number; // days sailing in open sea (non-ECA)
  totalLegTime: number; // ecaTime + seaTime
  
  // Time override (if user wants to manually set time)
  timeOverride?: number;
  
  // Cargo quantity & productivity (for loading/discharging)
  quantity: number; // MT
  productivity: number; // MT/day
  
  // Terms and time calculations
  terms: "shinc" | "sshex" | "fhex" | "";
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
}

interface VoyageContextValue {
  // Vessel state
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
  
  // Calculated results
  results: VoyageResults;
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
  
  if (row.operation === "waiting" || row.operation === "bunkering") {
    // For waiting/bunkering, use turn time + extra time only
    return (row.turnTime + row.extraTime) / 24;
  }
  
  if (row.operation === "loading" || row.operation === "discharging") {
    if (row.productivity <= 0 || row.quantity <= 0) {
      return (row.turnTime + row.extraTime) / 24;
    }
    
    // Base port days = quantity / productivity
    const basePortDays = row.quantity / row.productivity;
    
    // Terms multiplier
    const termsMultiplier = row.terms === "sshex" ? 1.5 : row.terms === "fhex" ? 1.25 : 1.0;
    
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
  vessel: VesselData
): { ecaTime: number; seaTime: number; totalLegTime: number } {
  if (row.type === "open") {
    return { ecaTime: 0, seaTime: 0, totalLegTime: 0 };
  }
  
  // If user has overridden time, use that
  if (row.timeOverride !== undefined && row.timeOverride > 0) {
    return { ecaTime: 0, seaTime: 0, totalLegTime: row.timeOverride };
  }
  
  // Get speeds for non-ECA distance (V context: EV or FV)
  const { seaSpeed: nonEcaSpeed } = getSpeedForContext(row.distanceSpeedContext, isLaden, vessel);
  
  // Get speeds for ECA distance (L context: EL or FL)
  const { seaSpeed: ecaSpeed } = getSpeedForContext(row.ecaDistanceSpeedContext, isLaden, vessel);
  
  // Calculate base times: Time = Distance / (Speed * 24 hours/day)
  const baseSeaTime = nonEcaSpeed > 0 ? row.distance / (nonEcaSpeed * 24) : 0;
  const baseEcaTime = ecaSpeed > 0 ? row.ecaDistance / (ecaSpeed * 24) : 0;
  
  // Apply Sea Margin to sailing time: Adjusted Time = Base Time × (1 + Sea Margin / 100)
  const seaMarginMultiplier = 1 + (row.seaMargin || 0) / 100;
  const seaTime = baseSeaTime * seaMarginMultiplier;
  const ecaTime = baseEcaTime * seaMarginMultiplier;
  const totalLegTime = ecaTime + seaTime;
  
  return { ecaTime, seaTime, totalLegTime };
}

const createNewRow = (type: "open" | "port" | "repos", nextId: number, operation?: PortOperation, speedProfile: "eco" | "full" = "eco", defaultCranes: number = 4): SequenceRowUI => ({
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
});

const initialSequence: SequenceRowUI[] = [
  {
    id: 1,
    type: "open",
    port: "Chittagong",
    portUnloc: "BDCGP",
    season: "summer",
    distance: 0,
    distanceSpeedContext: "EV",
    ecaDistance: 0,
    ecaDistanceSpeedContext: "EL",
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
  },
  {
    id: 2,
    type: "port",
    operation: "loading",
    port: "Paradip",
    portUnloc: "INPAV",
    distance: 370,
    distanceSpeedContext: "EV",
    ecaDistance: 0,
    ecaDistanceSpeedContext: "EL",
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
    seaMargin: 5, // 5% sea margin default for sailing legs
    bunkeringHsfo: 0,
    bunkeringVlsfo: 0,
    bunkeringLsmgo: 0,
    expDa: 13000,
  },
  {
    id: 3,
    type: "port",
    operation: "bunkering",
    port: "Singapore",
    portUnloc: "SGSIN",
    distance: 1555,
    distanceSpeedContext: "EV",
    ecaDistance: 0,
    ecaDistanceSpeedContext: "EL",
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
    seaMargin: 5, // 5% sea margin for sailing legs
    bunkeringHsfo: 0,
    bunkeringVlsfo: 1234,
    bunkeringLsmgo: 1234,
    expDa: 2500,
  },
  {
    id: 4,
    type: "port",
    operation: "discharging",
    port: "Ho Chi Minh City",
    portUnloc: "VNSGN",
    distance: 660,
    distanceSpeedContext: "EV",
    ecaDistance: 0,
    ecaDistanceSpeedContext: "EL",
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
    seaMargin: 5, // 5% sea margin for sailing legs
    bunkeringHsfo: 0,
    bunkeringVlsfo: 0,
    bunkeringLsmgo: 0,
    expDa: 25000,
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

export function VoyageProvider({ children }: { children: ReactNode }) {
  const [vessel, setVessel] = useState<VesselData>({
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

  const [sequence, setSequence] = useState<SequenceRowUI[]>(initialSequence);
  const [cargos, setCargos] = useState<CargoEntry[]>(initialCargos);
  const [bunker, setBunker] = useState<BunkerState>(initialBunker);
  const [misc, setMisc] = useState<MiscState>(initialMisc);
  const [hireRate, setHireRate] = useState(8542);
  const [vesselCost, setVesselCost] = useState(6500);
  const [autoDistanceEnabled, setAutoDistanceEnabled] = useState(true);

  // Recalculate port days and sea times whenever relevant fields change
  useEffect(() => {
    setSequence(prev => {
      let isLaden = false;
      return prev.map(row => {
        // Track laden state based on operations
        if (row.operation === "loading") isLaden = true;
        
        const seaTimeData = calculateSeaTime(row, isLaden, vessel);
        
        if (row.operation === "discharging") isLaden = false;
        
        return {
          ...row,
          calculatedPortDays: calculatePortDays(row),
          ...seaTimeData,
        };
      });
    });
  }, [vessel]);

  const updateSequenceRow = useCallback((id: number, field: keyof SequenceRowUI, value: string | number) => {
    setSequence(prev => {
      let isLaden = false;
      return prev.map(row => {
        // Track laden state based on operations
        if (row.operation === "loading") isLaden = true;
        
        if (row.id !== id) {
          if (row.operation === "discharging") isLaden = false;
          return row;
        }
        
        const updatedRow = { ...row, [field]: value };
        
        // Recalculate port days when relevant fields change
        if (['quantity', 'productivity', 'terms', 'turnTime', 'extraTime', 'operation'].includes(field)) {
          updatedRow.calculatedPortDays = calculatePortDays(updatedRow);
        }
        
        // Recalculate sea times when distance, eca distance, speed context, or sea margin changes
        if (['distance', 'ecaDistance', 'distanceSpeedContext', 'ecaDistanceSpeedContext', 'timeOverride', 'seaMargin'].includes(field)) {
          const seaTimeData = calculateSeaTime(updatedRow, isLaden, vessel);
          Object.assign(updatedRow, seaTimeData);
        }
        
        if (row.operation === "discharging") isLaden = false;
        return updatedRow;
      });
    });
  }, [vessel]);

  const addPort = useCallback((operation: PortOperation) => {
    setSequence(prev => {
      const nextId = Math.max(...prev.map(s => s.id), 0) + 1;
      const newRow = createNewRow("port", nextId, operation, vessel.speedProfile);
      
      // Insert before repos (if any exist at the end)
      const reposRows = prev.filter(r => r.type === "repos");
      const nonReposRows = prev.filter(r => r.type !== "repos");
      return [...nonReposRows, newRow, ...reposRows];
    });
  }, [vessel.speedProfile]);

  const addRepositioning = useCallback(() => {
    setSequence(prev => {
      const nextId = Math.max(...prev.map(s => s.id), 0) + 1;
      const newRow = createNewRow("repos", nextId, undefined, vessel.speedProfile);
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

  // Recalculate all distances using sea route algorithm
  const recalculateDistances = useCallback(() => {
    setSequence(prev => {
      const newSequence = [...prev];
      for (let i = 0; i < newSequence.length; i++) {
        if (i === 0) continue; // First port has no distance
        
        const prevRow = newSequence[i - 1];
        const currRow = newSequence[i];
        
        // Use coordinates from sequence rows if available
        if (prevRow.coordinates && currRow.coordinates) {
          const prevPort: Port = {
            id: prevRow.portId || 0,
            unloc: prevRow.portUnloc,
            name: prevRow.port,
            city: prevRow.port,
            country: "",
            coordinates: prevRow.coordinates,
          };
          const currPort: Port = {
            id: currRow.portId || 0,
            unloc: currRow.portUnloc,
            name: currRow.port,
            city: currRow.port,
            country: "",
            coordinates: currRow.coordinates,
          };
          
          const result = calculateSeaRouteDistance(prevPort, currPort);
          if (result.success) {
            newSequence[i] = { ...currRow, distance: result.distance };
          }
        }
      }
      return newSequence;
    });
  }, []);

  // Memoize port unlocs string for dependency tracking
  const portUnlocsKey = useMemo(() => sequence.map(s => s.portUnloc).join(','), [sequence]);

  // Auto-recalculate distances when ports change
  useEffect(() => {
    if (autoDistanceEnabled && portUnlocsKey) {
      const timer = setTimeout(() => {
        recalculateDistances();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [portUnlocsKey, autoDistanceEnabled, recalculateDistances]);

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
    // Use sequence-derived quantity for gross freight calculation
    const totalQuantity = sequenceCargoQuantity;
    
    // Calculate gross freight using cargo rates with sequence-derived quantity
    const totalGrossFreight = cargos.reduce((sum, c) => {
      if (c.rateType === "lumpsum") {
        return sum + c.rate;
      }
      // For per-MT rate, use sequence quantity proportionally
      // If multiple cargos, divide sequence quantity proportionally
      const cargoQuantityShare = cargos.length > 1 
        ? totalQuantity / cargos.length 
        : totalQuantity;
      return sum + (c.rate * cargoQuantityShare);
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
    })),
    cargo: aggregatedCargo,
    bunker: {
      hsfo: { price: bunker.hsfo.price, robStart: bunker.hsfo.robStart },
      vlsfo: { price: bunker.vlsfo.price, robStart: bunker.vlsfo.robStart },
      lsmgo: { price: bunker.lsmgo.price, robStart: bunker.lsmgo.robStart },
      co2Price: bunker.co2Price,
    },
    hireRate,
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
  };

  const results = useVoyageCalculation(voyageInputs);

  return (
    <VoyageContext.Provider
      value={{
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
        results,
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
      results: {
        totalDistance: 0, totalEcaDistance: 0, seaDaysBallast: 0, seaDaysLaden: 0,
        totalSeaDays: 0, totalPortDays: 0, extraSeaDays: 0, extraPortDays: 0, extraCanalDays: 0,
        totalVoyageDays: 0, hsfoConsumption: 0, vlsfoConsumption: 0, lsmgoConsumption: 0, 
        totalBunkerCost: 0, grossFreight: 0, voyageCommission: 0, netFreight: 0, 
        portCosts: 0, miscCosts: 0, canalCosts: 0, totalVoyageCosts: 0,
        hireCost: 0, voyageCostInclHire: 0, voyageCostExclHire: 0, grossProfit: 0,
        netProfit: 0, tce: 0, ntce: 0, gtce: 0, pAndL: 0, totalCo2: 0,
        co2Laden: 0, co2Ballast: 0, efoi: 0, afrCii: 0, ciiRating: "A",
      },
    } as VoyageContextValue;
  }
  return context;
}
