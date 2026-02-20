// Vessel fleet database
// Data imported from Dry Bulk Fleet Listing

// Extended consumption columns for AXS Marine style matrix
export interface ExtendedConsumption {
  ballast: number;
  laden: number;
  canal: number;
  load: number;
  discharge: number;
  idle: number;
  misc1: number;
  misc2: number;
}

// Speed profile types
export type SpeedProfile = "eco" | "full";

// Full consumption matrix with both eco and full speed profiles
export interface ConsumptionMatrix {
  speed: ExtendedConsumption;
  hsfo: ExtendedConsumption;
  vlsfo: ExtendedConsumption;
  lsmgo: ExtendedConsumption;
  ae: ExtendedConsumption;
  aeScrubber: ExtendedConsumption;
}

// Legacy consumption interface for backward compatibility
export interface VesselConsumption {
  ecoBallast: number;
  ecoLaden: number;
  canal: number;
}

export interface VesselData {
  name: string;
  type: string;
  imo?: string;
  dwt: number;
  gt: number;
  cubic: number;
  cubicUnit: "cbm" | "cuft";
  draft: number;
  tpcTpi: number;
  hsfoCapability: boolean;
  hasScrubber: boolean;
  scrubberCount: number;
  builtYear?: number;
  builder?: string;
  owner?: string;
  loa?: number;
  beam?: number;
  
  // Speed profile selection
  speedProfile: SpeedProfile;
  
  // Extended consumption matrix (Eco profile)
  ecoConsumption: ConsumptionMatrix;
  
  // Extended consumption matrix (Full Speed profile)
  fullConsumption: ConsumptionMatrix;
  
  // Load = Disch = Idle flag
  loadDischIdleSame: boolean;
  
  // Misc column multiplier
  miscMultiplier: number;
  
  // Legacy consumption (for backward compatibility)
  consumption: {
    speed: VesselConsumption;
    hsfo: VesselConsumption;
    vlsfo: VesselConsumption;
    lsmgo: VesselConsumption;
    ae: VesselConsumption;
    aeScrubber: VesselConsumption;
  };
}

// Create empty extended consumption
function createEmptyExtendedConsumption(): ExtendedConsumption {
  return {
    ballast: 0,
    laden: 0,
    canal: 0,
    load: 0,
    discharge: 0,
    idle: 0,
    misc1: 0,
    misc2: 0,
  };
}

// Create empty consumption matrix
function createEmptyConsumptionMatrix(): ConsumptionMatrix {
  return {
    speed: createEmptyExtendedConsumption(),
    hsfo: createEmptyExtendedConsumption(),
    vlsfo: createEmptyExtendedConsumption(),
    lsmgo: createEmptyExtendedConsumption(),
    ae: createEmptyExtendedConsumption(),
    aeScrubber: createEmptyExtendedConsumption(),
  };
}

// Default vessel template with zero values
export const defaultVessel: VesselData = {
  name: "",
  type: "",
  imo: "",
  dwt: 0,
  gt: 0,
  cubic: 0,
  cubicUnit: "cbm",
  draft: 0,
  tpcTpi: 0,
  hsfoCapability: false,
  hasScrubber: false,
  scrubberCount: 0,
  speedProfile: "eco",
  loadDischIdleSame: false,
  miscMultiplier: 0,
  ecoConsumption: createEmptyConsumptionMatrix(),
  fullConsumption: createEmptyConsumptionMatrix(),
  consumption: {
    speed: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    hsfo: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    vlsfo: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    lsmgo: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    ae: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    aeScrubber: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
  },
};

// Helper function to estimate consumption based on DWT
function estimateConsumption(dwt: number): VesselData["consumption"] {
  // Consumption estimates based on vessel size categories
  if (dwt >= 200000) {
    // Capesize / Ore Carrier
    return {
      speed: { ecoBallast: 11.5, ecoLaden: 11.0, canal: 0 },
      hsfo: { ecoBallast: 35, ecoLaden: 38, canal: 6 },
      vlsfo: { ecoBallast: 42, ecoLaden: 45, canal: 6 },
      lsmgo: { ecoBallast: 35, ecoLaden: 35, canal: 6 },
      ae: { ecoBallast: 0.25, ecoLaden: 0.25, canal: 0.4 },
      aeScrubber: { ecoBallast: 0.4, ecoLaden: 0.4, canal: 0.4 },
    };
  } else if (dwt >= 100000) {
    // Large Capesize
    return {
      speed: { ecoBallast: 12.0, ecoLaden: 11.5, canal: 0 },
      hsfo: { ecoBallast: 32, ecoLaden: 35, canal: 5 },
      vlsfo: { ecoBallast: 38, ecoLaden: 42, canal: 5 },
      lsmgo: { ecoBallast: 32, ecoLaden: 32, canal: 5 },
      ae: { ecoBallast: 0.22, ecoLaden: 0.22, canal: 0.35 },
      aeScrubber: { ecoBallast: 0.35, ecoLaden: 0.35, canal: 0.35 },
    };
  } else if (dwt >= 60000) {
    // Panamax
    return {
      speed: { ecoBallast: 12.5, ecoLaden: 12.0, canal: 0 },
      hsfo: { ecoBallast: 28, ecoLaden: 30, canal: 4.5 },
      vlsfo: { ecoBallast: 34, ecoLaden: 36, canal: 4.5 },
      lsmgo: { ecoBallast: 28, ecoLaden: 28, canal: 4.5 },
      ae: { ecoBallast: 0.2, ecoLaden: 0.2, canal: 0.32 },
      aeScrubber: { ecoBallast: 0.32, ecoLaden: 0.32, canal: 0.32 },
    };
  } else if (dwt >= 40000) {
    // Handymax / Supramax
    return {
      speed: { ecoBallast: 13.0, ecoLaden: 12.5, canal: 0 },
      hsfo: { ecoBallast: 22, ecoLaden: 24, canal: 3.5 },
      vlsfo: { ecoBallast: 28, ecoLaden: 30, canal: 3.5 },
      lsmgo: { ecoBallast: 22, ecoLaden: 22, canal: 3.5 },
      ae: { ecoBallast: 0.18, ecoLaden: 0.18, canal: 0.28 },
      aeScrubber: { ecoBallast: 0.28, ecoLaden: 0.28, canal: 0.28 },
    };
  } else if (dwt >= 25000) {
    // Handysize
    return {
      speed: { ecoBallast: 13.5, ecoLaden: 13.0, canal: 0 },
      hsfo: { ecoBallast: 18, ecoLaden: 20, canal: 3 },
      vlsfo: { ecoBallast: 22, ecoLaden: 24, canal: 3 },
      lsmgo: { ecoBallast: 18, ecoLaden: 18, canal: 3 },
      ae: { ecoBallast: 0.15, ecoLaden: 0.15, canal: 0.25 },
      aeScrubber: { ecoBallast: 0.25, ecoLaden: 0.25, canal: 0.25 },
    };
  } else {
    // Small vessel
    return {
      speed: { ecoBallast: 14.0, ecoLaden: 13.5, canal: 0 },
      hsfo: { ecoBallast: 14, ecoLaden: 16, canal: 2.5 },
      vlsfo: { ecoBallast: 18, ecoLaden: 20, canal: 2.5 },
      lsmgo: { ecoBallast: 14, ecoLaden: 14, canal: 2.5 },
      ae: { ecoBallast: 0.12, ecoLaden: 0.12, canal: 0.2 },
      aeScrubber: { ecoBallast: 0.2, ecoLaden: 0.2, canal: 0.2 },
    };
  }
}

// Helper function to estimate extended consumption matrix based on DWT
export function estimateExtendedConsumption(dwt: number, isFull: boolean = false): ConsumptionMatrix {
  const legacyCons = estimateConsumption(dwt);
  const speedFactor = isFull ? 1.15 : 1.0; // Full speed is ~15% faster
  const consFactor = isFull ? 1.3 : 1.0; // Full speed consumes ~30% more
  
  return {
    speed: {
      ballast: legacyCons.speed.ecoBallast * speedFactor,
      laden: legacyCons.speed.ecoLaden * speedFactor,
      canal: 0,
      load: 0,
      discharge: 0,
      idle: 0,
      misc1: 0,
      misc2: 0,
    },
    hsfo: {
      ballast: legacyCons.hsfo.ecoBallast * consFactor,
      laden: legacyCons.hsfo.ecoLaden * consFactor,
      canal: legacyCons.hsfo.canal,
      load: legacyCons.hsfo.canal * 1.2,
      discharge: legacyCons.hsfo.canal * 1.2,
      idle: legacyCons.hsfo.canal * 0.8,
      misc1: 0,
      misc2: 0,
    },
    vlsfo: {
      ballast: legacyCons.vlsfo.ecoBallast * consFactor,
      laden: legacyCons.vlsfo.ecoLaden * consFactor,
      canal: legacyCons.vlsfo.canal,
      load: legacyCons.vlsfo.canal * 1.2,
      discharge: legacyCons.vlsfo.canal * 1.2,
      idle: legacyCons.vlsfo.canal * 0.8,
      misc1: 0,
      misc2: 0,
    },
    lsmgo: {
      ballast: legacyCons.lsmgo.ecoBallast * consFactor,
      laden: legacyCons.lsmgo.ecoLaden * consFactor,
      canal: legacyCons.lsmgo.canal,
      load: legacyCons.lsmgo.canal * 1.2 + legacyCons.ae.canal * 1.5, // ME LSMGO + AE port
      discharge: legacyCons.lsmgo.canal * 1.2 + legacyCons.ae.canal * 1.5, // ME LSMGO + AE port
      idle: legacyCons.lsmgo.canal * 0.8 + legacyCons.ae.canal * 0.6, // ME LSMGO + AE port
      misc1: 0,
      misc2: 0,
    },
    ae: {
      ballast: legacyCons.ae.ecoBallast,
      laden: legacyCons.ae.ecoLaden,
      canal: legacyCons.ae.canal,
      load: legacyCons.ae.canal * 1.5,
      discharge: legacyCons.ae.canal * 1.5,
      idle: legacyCons.ae.canal * 0.6,
      misc1: 0,
      misc2: 0,
    },
    aeScrubber: {
      ballast: legacyCons.aeScrubber.ecoBallast,
      laden: legacyCons.aeScrubber.ecoLaden,
      canal: legacyCons.aeScrubber.canal,
      load: legacyCons.aeScrubber.canal * 1.5,
      discharge: legacyCons.aeScrubber.canal * 1.5,
      idle: legacyCons.aeScrubber.canal * 0.6,
      misc1: 0,
      misc2: 0,
    },
  };
}

// Helper to estimate TPC from DWT (rough approximation)
export function estimateTpc(dwt: number): number {
  if (dwt >= 200000) return 95;
  if (dwt >= 100000) return 80;
  if (dwt >= 60000) return 68;
  if (dwt >= 40000) return 58;
  if (dwt >= 25000) return 50;
  return 42;
}

// Sync legacy consumption from extended matrix
export function syncLegacyConsumption(matrix: ConsumptionMatrix): VesselData["consumption"] {
  return {
    speed: { ecoBallast: matrix.speed.ballast, ecoLaden: matrix.speed.laden, canal: matrix.speed.canal },
    hsfo: { ecoBallast: matrix.hsfo.ballast, ecoLaden: matrix.hsfo.laden, canal: matrix.hsfo.canal },
    vlsfo: { ecoBallast: matrix.vlsfo.ballast, ecoLaden: matrix.vlsfo.laden, canal: matrix.vlsfo.canal },
    lsmgo: { ecoBallast: matrix.lsmgo.ballast, ecoLaden: matrix.lsmgo.laden, canal: matrix.lsmgo.canal },
    ae: { ecoBallast: matrix.ae.ballast, ecoLaden: matrix.ae.laden, canal: matrix.ae.canal },
    aeScrubber: { ecoBallast: matrix.aeScrubber.ballast, ecoLaden: matrix.aeScrubber.laden, canal: matrix.aeScrubber.canal },
  };
}

// Vessel types for dropdown
export const vesselTypes = [
  "Bulk Carrier",
  "Ore Carrier",
  "Tanker",
  "Container Ship",
  "General Cargo",
  "Ro-Ro",
  "LNG Carrier",
  "LPG Carrier",
  "Chemical Tanker",
  "Product Tanker",
];

// Vessel fleet data imported from Dry Bulk Fleet Listing
export const vesselFleet: VesselData[] = [
  // Sample vessels with extended consumption data
  {
    name: "Global Harmony",
    type: "Ore Carrier",
    dwt: 327095,
    gt: 160774,
    cubic: 0,
    cubicUnit: "cbm",
    draft: 21,
    tpcTpi: 110,
    hsfoCapability: true,
    hasScrubber: false,
    scrubberCount: 0,
    builtYear: 2009,
    builder: "Mitsui SB (Chiba)",
    owner: "Mitsui OSK Lines",
    loa: 340,
    beam: 60,
    speedProfile: "eco",
    loadDischIdleSame: false,
    miscMultiplier: 0,
    ecoConsumption: estimateExtendedConsumption(327095, false),
    fullConsumption: estimateExtendedConsumption(327095, true),
    consumption: estimateConsumption(327095),
  },
];
