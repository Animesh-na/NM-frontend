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
// EV = ECA Voyage, EL = ECA Operational, FV = Open Sea Voyage, FL = Open Sea Operational
export type SpeedContext = "EV" | "EL" | "FV" | "FL";

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
  
  // Distance (auto-calculated, can be overridden)
  distance: number;
  ecaDistance: number;
  
  // Speed context for ECA vs non-ECA zones
  speedContext: SpeedContext;
  
  // Calculated sea times (read-only)
  ecaTime: number; // days sailing in ECA
  seaTime: number; // days sailing in open sea
  totalLegTime: number; // ecaTime + seaTime
  
  // Cargo quantity & productivity (for loading/discharging)
  quantity: number; // MT
  productivity: number; // MT/day
  
  // Terms and time calculations
  terms: "shinc" | "sshex" | "fhex" | "";
  turnTime: number; // hours
  extraTime: number; // hours
  
  // Calculated port days (read-only, derived from quantity/productivity/terms/extra time)
  calculatedPortDays: number;
  
  // Bunkering data (for bunkering operation)
  bunkeringHsfo: number;
  bunkeringVlsfo: number;
  bunkeringLsmgo: number;
  
  // Expected DA
  expDa: number;
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
  
  // Cargo state
  cargo: CargoState;
  setCargo: React.Dispatch<React.SetStateAction<CargoState>>;
  updateCargo: (field: keyof CargoState, value: number | string) => void;
  
  // Bunker state
  bunker: BunkerState;
  setBunker: React.Dispatch<React.SetStateAction<BunkerState>>;
  updateBunker: (fuelType: string, field: string, value: number) => void;
  
  // Hire rate
  hireRate: number;
  setHireRate: (rate: number) => void;
  
  // Calculated results
  results: VoyageResults;
}

interface CargoState {
  rate: number;
  rateType: "mt" | "lumpsum";
  quantity: number;
  voyageCommission: number;
  tcCommission: number;
  demurrage: number;
  despatch: number;
}

interface BunkerState {
  hsfo: { price: number; robStart: number };
  vlsfo: { price: number; robStart: number };
  lsmgo: { price: number; robStart: number };
  co2Price: number;
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

// Helper to calculate sea time for a leg
function calculateSeaTime(
  row: SequenceRowUI, 
  isLaden: boolean, 
  vessel: VesselData
): { ecaTime: number; seaTime: number; totalLegTime: number } {
  if (row.type === "open") {
    return { ecaTime: 0, seaTime: 0, totalLegTime: 0 };
  }
  
  const { ecaSpeed, seaSpeed } = getSpeedForContext(row.speedContext, isLaden, vessel);
  const nonEcaDistance = Math.max(0, row.distance - row.ecaDistance);
  
  // Time = Distance / (Speed * 24 hours/day)
  const ecaTime = ecaSpeed > 0 ? row.ecaDistance / (ecaSpeed * 24) : 0;
  const seaTime = seaSpeed > 0 ? nonEcaDistance / (seaSpeed * 24) : 0;
  const totalLegTime = ecaTime + seaTime;
  
  return { ecaTime, seaTime, totalLegTime };
}

const createNewRow = (type: "open" | "port" | "repos", nextId: number, operation?: PortOperation, speedProfile: "eco" | "full" = "eco"): SequenceRowUI => ({
  id: nextId,
  type,
  operation,
  port: "",
  portUnloc: "",
  season: type === "open" ? "summer" : undefined,
  distance: 0,
  ecaDistance: 0,
  speedContext: speedProfile === "eco" ? "EV" : "FV", // Default based on vessel profile
  ecaTime: 0,
  seaTime: 0,
  totalLegTime: 0,
  quantity: 0,
  productivity: type === "port" && (operation === "loading" || operation === "discharging") ? 8000 : 0,
  terms: type === "port" && (operation === "loading" || operation === "discharging") ? "shinc" : "",
  turnTime: type === "port" ? 18 : 0,
  extraTime: 0,
  calculatedPortDays: 0,
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
    ecaDistance: 0,
    speedContext: "EV",
    ecaTime: 0,
    seaTime: 0,
    totalLegTime: 0,
    quantity: 0,
    productivity: 0,
    terms: "",
    turnTime: 0,
    extraTime: 0,
    calculatedPortDays: 0,
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
    ecaDistance: 0,
    speedContext: "EV",
    ecaTime: 0,
    seaTime: 0,
    totalLegTime: 0,
    quantity: 56550,
    productivity: 8000,
    terms: "shinc",
    turnTime: 18,
    extraTime: 0,
    calculatedPortDays: 0,
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
    ecaDistance: 0,
    speedContext: "EV",
    ecaTime: 0,
    seaTime: 0,
    totalLegTime: 0,
    quantity: 0,
    productivity: 0,
    terms: "",
    turnTime: 12,
    extraTime: 0,
    calculatedPortDays: 0,
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
    ecaDistance: 0,
    speedContext: "EV",
    ecaTime: 0,
    seaTime: 0,
    totalLegTime: 0,
    quantity: 56550,
    productivity: 5000,
    terms: "shinc",
    turnTime: 18,
    extraTime: 0,
    calculatedPortDays: 0,
    bunkeringHsfo: 0,
    bunkeringVlsfo: 0,
    bunkeringLsmgo: 0,
    expDa: 25000,
  },
];

const initialCargo: CargoState = {
  rate: 13.7,
  rateType: "mt",
  quantity: 56550,
  voyageCommission: 1.25,
  tcCommission: 3.75,
  demurrage: 0,
  despatch: 0,
};

const initialBunker: BunkerState = {
  hsfo: { price: 0, robStart: 0 },
  vlsfo: { price: 450, robStart: 1234 },
  lsmgo: { price: 750, robStart: 0 },
  co2Price: 0,
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
  const [cargo, setCargo] = useState<CargoState>(initialCargo);
  const [bunker, setBunker] = useState<BunkerState>(initialBunker);
  const [hireRate, setHireRate] = useState(8542);
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
        
        // Recalculate sea times when distance or speed context changes
        if (['distance', 'ecaDistance', 'speedContext'].includes(field)) {
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

  const updateCargo = useCallback((field: keyof CargoState, value: number | string) => {
    setCargo(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateBunker = useCallback((fuelType: string, field: string, value: number) => {
    setBunker(prev => ({
      ...prev,
      [fuelType]: { ...prev[fuelType as keyof BunkerState] as object, [field]: value },
    }));
  }, []);

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
    cargo: {
      rate: cargo.rate,
      rateType: cargo.rateType,
      quantity: cargo.quantity,
      voyageCommission: cargo.voyageCommission,
      tcCommission: cargo.tcCommission,
      demurrage: cargo.demurrage,
      despatch: cargo.despatch,
    },
    bunker: {
      hsfo: { price: bunker.hsfo.price, robStart: bunker.hsfo.robStart },
      vlsfo: { price: bunker.vlsfo.price, robStart: bunker.vlsfo.robStart },
      lsmgo: { price: bunker.lsmgo.price, robStart: bunker.lsmgo.robStart },
      co2Price: bunker.co2Price,
    },
    hireRate,
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
        cargo,
        setCargo,
        updateCargo,
        bunker,
        setBunker,
        updateBunker,
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
      cargo: { rate: 0, rateType: "mt" as const, quantity: 0, voyageCommission: 0, tcCommission: 0, demurrage: 0, despatch: 0 },
      setCargo: () => {},
      updateCargo: () => {},
      bunker: { hsfo: { price: 0, robStart: 0 }, vlsfo: { price: 0, robStart: 0 }, lsmgo: { price: 0, robStart: 0 }, co2Price: 0 },
      setBunker: () => {},
      updateBunker: () => {},
      hireRate: 0,
      setHireRate: () => {},
      results: {
        totalDistance: 0, totalEcaDistance: 0, seaDaysBallast: 0, seaDaysLaden: 0,
        totalSeaDays: 0, totalPortDays: 0, totalVoyageDays: 0, hsfoConsumption: 0,
        vlsfoConsumption: 0, lsmgoConsumption: 0, totalBunkerCost: 0, grossFreight: 0,
        voyageCommission: 0, netFreight: 0, portCosts: 0, totalVoyageCosts: 0,
        hireCost: 0, voyageCostInclHire: 0, voyageCostExclHire: 0, grossProfit: 0,
        netProfit: 0, tce: 0, ntce: 0, gtce: 0, pAndL: 0, totalCo2: 0,
        co2Laden: 0, co2Ballast: 0, efoi: 0, afrCii: 0, ciiRating: "A",
      },
    } as VoyageContextValue;
  }
  return context;
}
