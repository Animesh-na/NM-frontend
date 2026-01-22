// Vessel fleet database
// This data can be loaded from an Excel file or maintained here

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
  draft: number;
  tpcTpi: number;
  hsfoScrubbers: string;
  consumption: {
    speed: VesselConsumption;
    hsfo: VesselConsumption;
    vlsfo: VesselConsumption;
    lsmgo: VesselConsumption;
    ae: VesselConsumption;
    aeScrubber: VesselConsumption;
  };
}

// Default vessel template with zero values
export const defaultVessel: VesselData = {
  name: "",
  type: "Bulk Carrier",
  imo: "",
  dwt: 0,
  gt: 0,
  cubic: 0,
  draft: 0,
  tpcTpi: 0,
  hsfoScrubbers: "N",
  consumption: {
    speed: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    hsfo: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    vlsfo: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    lsmgo: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    ae: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
    aeScrubber: { ecoBallast: 0, ecoLaden: 0, canal: 0 },
  },
};

// Sample vessel fleet data - replace with actual data from Excel
export const vesselFleet: VesselData[] = [
  {
    name: "Ap Dubrava",
    type: "Bulk Carrier",
    imo: "9876543",
    dwt: 38703,
    gt: 25494,
    cubic: 50905,
    draft: 10.5,
    tpcTpi: 53.9,
    hsfoScrubbers: "N",
    consumption: {
      speed: { ecoBallast: 12.5, ecoLaden: 12, canal: 0 },
      hsfo: { ecoBallast: 16, ecoLaden: 16, canal: 2.5 },
      vlsfo: { ecoBallast: 21, ecoLaden: 22, canal: 2.5 },
      lsmgo: { ecoBallast: 16, ecoLaden: 16, canal: 2.5 },
      ae: { ecoBallast: 0.1, ecoLaden: 0.1, canal: 0.2 },
      aeScrubber: { ecoBallast: 0.2, ecoLaden: 0.2, canal: 0.2 },
    },
  },
  {
    name: "Nordic Tanker",
    type: "Tanker",
    imo: "9123456",
    dwt: 45000,
    gt: 30000,
    cubic: 55000,
    draft: 11.2,
    tpcTpi: 58.5,
    hsfoScrubbers: "Y",
    consumption: {
      speed: { ecoBallast: 13, ecoLaden: 12.5, canal: 0 },
      hsfo: { ecoBallast: 18, ecoLaden: 19, canal: 3 },
      vlsfo: { ecoBallast: 23, ecoLaden: 24, canal: 3 },
      lsmgo: { ecoBallast: 18, ecoLaden: 18, canal: 3 },
      ae: { ecoBallast: 0.15, ecoLaden: 0.15, canal: 0.25 },
      aeScrubber: { ecoBallast: 0.25, ecoLaden: 0.25, canal: 0.25 },
    },
  },
  {
    name: "Pacific Star",
    type: "Container",
    imo: "9234567",
    dwt: 52000,
    gt: 42000,
    cubic: 0,
    draft: 12.5,
    tpcTpi: 65.0,
    hsfoScrubbers: "N",
    consumption: {
      speed: { ecoBallast: 14, ecoLaden: 13.5, canal: 0 },
      hsfo: { ecoBallast: 22, ecoLaden: 24, canal: 4 },
      vlsfo: { ecoBallast: 28, ecoLaden: 30, canal: 4 },
      lsmgo: { ecoBallast: 22, ecoLaden: 22, canal: 4 },
      ae: { ecoBallast: 0.2, ecoLaden: 0.2, canal: 0.3 },
      aeScrubber: { ecoBallast: 0.3, ecoLaden: 0.3, canal: 0.3 },
    },
  },
  {
    name: "Atlantic Voyager",
    type: "Bulk Carrier",
    imo: "9345678",
    dwt: 75000,
    gt: 45000,
    cubic: 85000,
    draft: 14.2,
    tpcTpi: 72.0,
    hsfoScrubbers: "Y",
    consumption: {
      speed: { ecoBallast: 11.5, ecoLaden: 11, canal: 0 },
      hsfo: { ecoBallast: 28, ecoLaden: 30, canal: 5 },
      vlsfo: { ecoBallast: 35, ecoLaden: 38, canal: 5 },
      lsmgo: { ecoBallast: 28, ecoLaden: 28, canal: 5 },
      ae: { ecoBallast: 0.2, ecoLaden: 0.2, canal: 0.35 },
      aeScrubber: { ecoBallast: 0.35, ecoLaden: 0.35, canal: 0.35 },
    },
  },
  {
    name: "Eastern Glory",
    type: "Tanker",
    imo: "9456789",
    dwt: 105000,
    gt: 58000,
    cubic: 120000,
    draft: 15.5,
    tpcTpi: 85.0,
    hsfoScrubbers: "Y",
    consumption: {
      speed: { ecoBallast: 12, ecoLaden: 11.5, canal: 0 },
      hsfo: { ecoBallast: 35, ecoLaden: 38, canal: 6 },
      vlsfo: { ecoBallast: 42, ecoLaden: 45, canal: 6 },
      lsmgo: { ecoBallast: 35, ecoLaden: 35, canal: 6 },
      ae: { ecoBallast: 0.25, ecoLaden: 0.25, canal: 0.4 },
      aeScrubber: { ecoBallast: 0.4, ecoLaden: 0.4, canal: 0.4 },
    },
  },
];

// Vessel types
export const vesselTypes = ["Bulk Carrier", "Tanker", "Container", "General Cargo", "LNG", "LPG", "Chemical Tanker"];

// Get vessel by name
export function getVesselByName(name: string): VesselData | undefined {
  return vesselFleet.find(v => v.name.toLowerCase() === name.toLowerCase());
}

// Search vessels by name
export function searchVessels(query: string): VesselData[] {
  if (!query || query.length < 2) return vesselFleet;
  
  const lowerQuery = query.toLowerCase();
  return vesselFleet.filter(v => 
    v.name.toLowerCase().includes(lowerQuery) ||
    v.type.toLowerCase().includes(lowerQuery) ||
    (v.imo && v.imo.includes(query))
  );
}

// Get vessels by type
export function getVesselsByType(type: string): VesselData[] {
  return vesselFleet.filter(v => v.type === type);
}
