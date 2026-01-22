import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useVoyageCalculation, type VoyageInputs, type VoyageResults, parseDistanceString, parsePortDays } from "@/hooks/useVoyageCalculation";
import { defaultVessel, type VesselData } from "@/data/vessels";

// Sequence row for UI state
export interface SequenceRowUI {
  id: number;
  operation: string;
  port: string;
  portUnloc: string;
  cgo: string;
  distanceEca: string;
  time: string;
  wdaysPort: string;
  draft: string;
  c: string;
  quantity: string;
  quantityUnit: string;
  terms: string;
  tt: string;
  et: string;
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

const initialSequence: SequenceRowUI[] = [
  {
    id: 1,
    operation: "load",
    port: "Paradip",
    portUnloc: "INPAV",
    cgo: "#1",
    distanceEca: "370",
    time: "0 nm EV",
    wdaysPort: "5.42d",
    draft: "5 % VL",
    c: "0 m",
    quantity: "30000",
    quantityUnit: "mt",
    terms: "sshex",
    tt: "1.5555",
    et: "18h",
    expDa: 65000,
  },
  {
    id: 2,
    operation: "pssg",
    port: "Singapore",
    portUnloc: "SGSIN",
    cgo: "",
    distanceEca: "1555",
    time: "0 nm EV",
    wdaysPort: "0.5d",
    draft: "5 % VL",
    c: "0 m",
    quantity: "",
    quantityUnit: "",
    terms: "",
    tt: "",
    et: "12h",
    expDa: 2000,
  },
  {
    id: 3,
    operation: "disch",
    port: "Ho Chi Minh City",
    portUnloc: "VNSGN",
    cgo: "#1",
    distanceEca: "660",
    time: "0 nm EV",
    wdaysPort: "3.75d",
    draft: "10 % VL",
    c: "0 m",
    quantity: "30000",
    quantityUnit: "mt",
    terms: "shinc",
    tt: "1.0000",
    et: "18h",
    expDa: 25000,
  },
];

const initialCargo: CargoState = {
  rate: 13,
  rateType: "mt",
  quantity: 30000,
  voyageCommission: 2.5,
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

  const updateSequenceRow = useCallback((id: number, field: keyof SequenceRowUI, value: string | number) => {
    setSequence(prev => prev.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ));
  }, []);

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
    sequence: sequence.map(row => {
      const { distance, ecaDistance } = parseDistanceString(row.distanceEca);
      const portDays = parsePortDays(row.wdaysPort);
      return {
        id: row.id,
        operation: row.operation,
        port: row.port,
        portUnloc: row.portUnloc,
        cgo: row.cgo,
        distance,
        ecaDistance,
        portDays,
        quantity: parseFloat(row.quantity) || 0,
        expDa: row.expDa || 0,
      };
    }),
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
