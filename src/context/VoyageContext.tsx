import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from "react";
import { useVoyageCalculation, type VoyageInputs, type VoyageResults } from "@/hooks/useVoyageCalculation";
import { defaultVessel, type VesselData } from "@/data/vessels";
import { getPortByUnloc, type Port } from "@/data/ports";
import { calculateSeaRouteDistance } from "@/utils/seaRouteDistance";

// Season options for Open Port
export type Season = "summer" | "winter" | "tropical" | "eca";

// Operation types for port sequences
export type PortOperation = "loading" | "discharging" | "waiting" | "bunkering";

// Sequence row for UI state
export interface SequenceRowUI {
  id: number;
  type: "open" | "port" | "repos";
  operation?: PortOperation; // only for port type
  port: string;
  portUnloc: string;
  season?: Season; // only for open type
  
  // Distance (auto-calculated, read-only)
  distance: number;
  ecaDistance: number;
  
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

const createNewRow = (type: "open" | "port" | "repos", nextId: number, operation?: PortOperation): SequenceRowUI => ({
  id: nextId,
  type,
  operation,
  port: "",
  portUnloc: "",
  season: type === "open" ? "summer" : undefined,
  distance: 0,
  ecaDistance: 0,
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
    name: "Ap Dubrava",
    dwt: 38703,
    gt: 25494,
    cubic: 50905,
    draft: 10.5,
    tpcTpi: 53.9,
    consumption: {
      speed: { ecoBallast: 12.5, ecoLaden: 12, canal: 0 },
      hsfo: { ecoBallast: 16, ecoLaden: 16, canal: 2.5 },
      vlsfo: { ecoBallast: 21, ecoLaden: 22, canal: 2.5 },
      lsmgo: { ecoBallast: 0.5, ecoLaden: 0.5, canal: 0.5 },
      ae: { ecoBallast: 0.1, ecoLaden: 0.1, canal: 0.2 },
      aeScrubber: { ecoBallast: 0.2, ecoLaden: 0.2, canal: 0.2 },
    },
  });

  const [sequence, setSequence] = useState<SequenceRowUI[]>(initialSequence);
  const [cargo, setCargo] = useState<CargoState>(initialCargo);
  const [bunker, setBunker] = useState<BunkerState>(initialBunker);
  const [hireRate, setHireRate] = useState(8542);
  const [autoDistanceEnabled, setAutoDistanceEnabled] = useState(true);

  // Recalculate port days whenever relevant fields change
  useEffect(() => {
    setSequence(prev => prev.map(row => ({
      ...row,
      calculatedPortDays: calculatePortDays(row),
    })));
  }, []);

  const updateSequenceRow = useCallback((id: number, field: keyof SequenceRowUI, value: string | number) => {
    setSequence(prev => prev.map(row => {
      if (row.id !== id) return row;
      
      const updatedRow = { ...row, [field]: value };
      // Recalculate port days when relevant fields change
      if (['quantity', 'productivity', 'terms', 'turnTime', 'extraTime', 'operation'].includes(field)) {
        updatedRow.calculatedPortDays = calculatePortDays(updatedRow);
      }
      return updatedRow;
    }));
  }, []);

  const addPort = useCallback((operation: PortOperation) => {
    setSequence(prev => {
      const nextId = Math.max(...prev.map(s => s.id), 0) + 1;
      const newRow = createNewRow("port", nextId, operation);
      
      // Insert before repos (if any exist at the end)
      const reposRows = prev.filter(r => r.type === "repos");
      const nonReposRows = prev.filter(r => r.type !== "repos");
      return [...nonReposRows, newRow, ...reposRows];
    });
  }, []);

  const addRepositioning = useCallback(() => {
    setSequence(prev => {
      const nextId = Math.max(...prev.map(s => s.id), 0) + 1;
      const newRow = createNewRow("repos", nextId);
      return [...prev, newRow];
    });
  }, []);

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
        
        if (prevRow.portUnloc && currRow.portUnloc) {
          const prevPort = getPortByUnloc(prevRow.portUnloc);
          const currPort = getPortByUnloc(currRow.portUnloc);
          
          if (prevPort && currPort) {
            const result = calculateSeaRouteDistance(prevPort, currPort);
            if (result.success) {
              newSequence[i] = { ...currRow, distance: result.distance };
            }
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
    throw new Error("useVoyageContext must be used within a VoyageProvider");
  }
  return context;
}
