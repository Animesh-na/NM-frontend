// Vessel fleet database
// Data imported from Dry Bulk Fleet Listing

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
  builtYear?: number;
  builder?: string;
  owner?: string;
  loa?: number;
  beam?: number;
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

// Helper to estimate TPC from DWT (rough approximation)
function estimateTpc(dwt: number): number {
  if (dwt >= 200000) return 95;
  if (dwt >= 100000) return 80;
  if (dwt >= 60000) return 68;
  if (dwt >= 40000) return 58;
  if (dwt >= 25000) return 50;
  return 42;
}

// Vessel fleet data imported from Dry Bulk Fleet Listing
export const vesselFleet: VesselData[] = [
  // ============ ORE CARRIERS ============
  {
    name: "Global Harmony",
    type: "Ore Carrier",
    dwt: 327095,
    gt: 160774,
    cubic: 0,
    draft: 21,
    tpcTpi: 110,
    hsfoScrubbers: "N",
    builtYear: 2009,
    builder: "Mitsui SB (Chiba)",
    owner: "Mitsui OSK Lines",
    loa: 340,
    beam: 60,
    consumption: estimateConsumption(327095),
  },
  {
    name: "Tubarao Maru",
    type: "Ore Carrier",
    dwt: 327127,
    gt: 160774,
    cubic: 0,
    draft: 21,
    tpcTpi: 110,
    hsfoScrubbers: "N",
    builtYear: 2008,
    builder: "Mitsui SB (Chiba)",
    owner: "Doun Kisen",
    loa: 340,
    beam: 60,
    consumption: estimateConsumption(327127),
  },
  {
    name: "Brasil Maru",
    type: "Ore Carrier",
    dwt: 327180,
    gt: 160774,
    cubic: 0,
    draft: 21,
    tpcTpi: 110,
    hsfoScrubbers: "N",
    builtYear: 2007,
    builder: "Mitsui SB (Chiba)",
    owner: "Mitsui OSK Lines",
    loa: 340,
    beam: 60,
    consumption: estimateConsumption(327180),
  },
  {
    name: "Ore Amazonas",
    type: "Ore Carrier",
    dwt: 297978,
    gt: 152311,
    cubic: 0,
    draft: 21.4,
    tpcTpi: 100,
    hsfoScrubbers: "N",
    builtYear: 2010,
    builder: "Nantong COSCO KHI",
    owner: "NYK Line",
    loa: 327,
    beam: 55,
    consumption: estimateConsumption(297978),
  },
  {
    name: "Baogang Spirit",
    type: "Ore Carrier",
    dwt: 297902,
    gt: 152311,
    cubic: 0,
    draft: 21.4,
    tpcTpi: 100,
    hsfoScrubbers: "N",
    builtYear: 2010,
    builder: "Nantong COSCO KHI",
    owner: "K-Line",
    loa: 327,
    beam: 55,
    consumption: estimateConsumption(297902),
  },
  {
    name: "He Tong",
    type: "Ore Carrier",
    dwt: 297633,
    gt: 152305,
    cubic: 0,
    draft: 21.4,
    tpcTpi: 100,
    hsfoScrubbers: "N",
    builtYear: 2009,
    builder: "Nantong COSCO KHI",
    owner: "COSCO Shipping Bulk",
    loa: 327,
    beam: 55,
    consumption: estimateConsumption(297633),
  },
  {
    name: "He Heng",
    type: "Ore Carrier",
    dwt: 297592,
    gt: 152305,
    cubic: 0,
    draft: 21.4,
    tpcTpi: 100,
    hsfoScrubbers: "N",
    builtYear: 2008,
    builder: "Nantong COSCO KHI",
    owner: "COSCO Shipping Bulk",
    loa: 327,
    beam: 55,
    consumption: estimateConsumption(297592),
  },
  {
    name: "Bao Fu",
    type: "Ore Carrier",
    dwt: 250877,
    gt: 132537,
    cubic: 0,
    draft: 18.03,
    tpcTpi: 95,
    hsfoScrubbers: "N",
    builtYear: 2010,
    builder: "Namura Shipbuilding",
    owner: "NYK Line",
    loa: 329.95,
    beam: 57,
    consumption: estimateConsumption(250877),
  },
  {
    name: "Yi Da",
    type: "Ore Carrier",
    dwt: 228850,
    gt: 116396,
    cubic: 0,
    draft: 18.1,
    tpcTpi: 90,
    hsfoScrubbers: "N",
    builtYear: 2010,
    builder: "Guangzhou Longxue",
    owner: "Haibao Shipping",
    loa: 324.99,
    beam: 52.5,
    consumption: estimateConsumption(228850),
  },
  {
    name: "CSB Hope",
    type: "Ore Carrier",
    dwt: 229008,
    gt: 116396,
    cubic: 0,
    draft: 18.1,
    tpcTpi: 90,
    hsfoScrubbers: "N",
    builtYear: 2010,
    builder: "Guangzhou Longxue",
    owner: "COSCO Shipping Bulk",
    loa: 324.99,
    beam: 52.5,
    consumption: estimateConsumption(229008),
  },

  // ============ CAPESIZE BULK CARRIERS ============
  {
    name: "Yasa Dream",
    type: "Bulk Carrier",
    dwt: 207805,
    gt: 106405,
    cubic: 0,
    draft: 18.23,
    tpcTpi: 85,
    hsfoScrubbers: "N",
    builtYear: 2008,
    builder: "Universal SB (Tsu)",
    owner: "Yasa Shipping",
    loa: 299.7,
    beam: 50,
    consumption: estimateConsumption(207805),
  },
  {
    name: "Wen Chang Star",
    type: "Bulk Carrier",
    dwt: 207933,
    gt: 106384,
    cubic: 0,
    draft: 18.23,
    tpcTpi: 85,
    hsfoScrubbers: "N",
    builtYear: 2008,
    builder: "Universal SB (Tsu)",
    owner: "UC Shipping Pte Ltd",
    loa: 299.7,
    beam: 50,
    consumption: estimateConsumption(207933),
  },
  {
    name: "Wu Ying Star",
    type: "Bulk Carrier",
    dwt: 207918,
    gt: 106367,
    cubic: 0,
    draft: 18.23,
    tpcTpi: 85,
    hsfoScrubbers: "N",
    builtYear: 2010,
    builder: "Universal SB (Tsu)",
    owner: "UC Shipping Pte Ltd",
    loa: 299.7,
    beam: 50,
    consumption: estimateConsumption(207918),
  },
  {
    name: "Hyundai Pioneer",
    type: "Bulk Carrier",
    dwt: 207955,
    gt: 106367,
    cubic: 0,
    draft: 18.23,
    tpcTpi: 85,
    hsfoScrubbers: "N",
    builtYear: 2009,
    builder: "Universal SB (Tsu)",
    owner: "HMM",
    loa: 299.7,
    beam: 50,
    consumption: estimateConsumption(207955),
  },
  {
    name: "Cape Alliance",
    type: "Bulk Carrier",
    dwt: 206190,
    gt: 104732,
    cubic: 0,
    draft: 18.11,
    tpcTpi: 84,
    hsfoScrubbers: "N",
    builtYear: 2007,
    builder: "Imabari SB Saijo",
    owner: "K-Line",
    loa: 299.94,
    beam: 50,
    consumption: estimateConsumption(206190),
  },
  {
    name: "Berge Kuju",
    type: "Bulk Carrier",
    dwt: 206312,
    gt: 104727,
    cubic: 0,
    draft: 18.11,
    tpcTpi: 84,
    hsfoScrubbers: "Y",
    builtYear: 2006,
    builder: "Imabari SB Saijo",
    owner: "Berge Bulk",
    loa: 299.94,
    beam: 50,
    consumption: estimateConsumption(206312),
  },
  {
    name: "Winning Ocean",
    type: "Bulk Carrier",
    dwt: 203315,
    gt: 102207,
    cubic: 0,
    draft: 17.91,
    tpcTpi: 82,
    hsfoScrubbers: "N",
    builtYear: 2003,
    builder: "Universal SB (Tsu)",
    owner: "Winning Intl",
    loa: 299.95,
    beam: 50,
    consumption: estimateConsumption(203315),
  },
  {
    name: "Berge Dinara",
    type: "Bulk Carrier",
    dwt: 203163,
    gt: 102132,
    cubic: 0,
    draft: 17.91,
    tpcTpi: 82,
    hsfoScrubbers: "Y",
    builtYear: 2005,
    builder: "Universal SB (Tsu)",
    owner: "Berge Bulk",
    loa: 299.95,
    beam: 50,
    consumption: estimateConsumption(203163),
  },
  {
    name: "Cape Arola",
    type: "Bulk Carrier",
    dwt: 179329,
    gt: 95152,
    cubic: 0,
    draft: 18.2,
    tpcTpi: 78,
    hsfoScrubbers: "N",
    builtYear: 2009,
    builder: "Hyundai HI (Ulsan)",
    owner: "Minerva Marine",
    loa: 291.97,
    beam: 45,
    consumption: estimateConsumption(179329),
  },
  {
    name: "Star Ophelia",
    type: "Bulk Carrier",
    dwt: 180716,
    gt: 95047,
    cubic: 0,
    draft: 18.2,
    tpcTpi: 78,
    hsfoScrubbers: "N",
    builtYear: 2010,
    builder: "STX SB (Jinhae)",
    owner: "Star Bulk Carriers",
    loa: 292,
    beam: 45,
    consumption: estimateConsumption(180716),
  },
  {
    name: "Alexos",
    type: "Bulk Carrier",
    dwt: 180171,
    gt: 94863,
    cubic: 0,
    draft: 18.1,
    tpcTpi: 78,
    hsfoScrubbers: "N",
    builtYear: 2009,
    builder: "Dalian Shipbuilding",
    owner: "Kisamos Shpg",
    loa: 294.47,
    beam: 46,
    consumption: estimateConsumption(180171),
  },
  {
    name: "Berge Song Shan",
    type: "Bulk Carrier",
    dwt: 180154,
    gt: 94710,
    cubic: 0,
    draft: 18.1,
    tpcTpi: 78,
    hsfoScrubbers: "Y",
    builtYear: 2010,
    builder: "Dalian Shipbuilding",
    owner: "Berge Bulk",
    loa: 294.47,
    beam: 46,
    consumption: estimateConsumption(180154),
  },
  {
    name: "Navios Pollux",
    type: "Bulk Carrier",
    dwt: 180727,
    gt: 94817,
    cubic: 0,
    draft: 18.2,
    tpcTpi: 78,
    hsfoScrubbers: "N",
    builtYear: 2009,
    builder: "STX SB (Jinhae)",
    owner: "Navios MLP",
    loa: 292,
    beam: 45,
    consumption: estimateConsumption(180727),
  },

  // ============ PANAMAX BULK CARRIERS ============
  {
    name: "Ap Dubrava",
    type: "Bulk Carrier",
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
    name: "Pacific Gem",
    type: "Bulk Carrier",
    dwt: 85462,
    gt: 50218,
    cubic: 98500,
    draft: 14.5,
    tpcTpi: 72,
    hsfoScrubbers: "N",
    builtYear: 2015,
    consumption: estimateConsumption(85462),
  },
  {
    name: "Ocean Pearl",
    type: "Bulk Carrier",
    dwt: 82120,
    gt: 48500,
    cubic: 95000,
    draft: 14.3,
    tpcTpi: 70,
    hsfoScrubbers: "Y",
    builtYear: 2018,
    consumption: estimateConsumption(82120),
  },
  {
    name: "Nordic Voyager",
    type: "Bulk Carrier",
    dwt: 76500,
    gt: 44200,
    cubic: 88000,
    draft: 14.0,
    tpcTpi: 68,
    hsfoScrubbers: "N",
    builtYear: 2012,
    consumption: estimateConsumption(76500),
  },
  {
    name: "Atlantic Voyager",
    type: "Bulk Carrier",
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

  // ============ SUPRAMAX / ULTRAMAX BULK CARRIERS ============
  {
    name: "Meghna Princess",
    type: "Bulk Carrier",
    dwt: 63500,
    gt: 38500,
    cubic: 78000,
    draft: 13.5,
    tpcTpi: 62,
    hsfoScrubbers: "N",
    builtYear: 2019,
    consumption: estimateConsumption(63500),
  },
  {
    name: "Yamato Spirit",
    type: "Bulk Carrier",
    dwt: 61000,
    gt: 36800,
    cubic: 75000,
    draft: 13.2,
    tpcTpi: 60,
    hsfoScrubbers: "Y",
    builtYear: 2020,
    consumption: estimateConsumption(61000),
  },
  {
    name: "Shandong Express",
    type: "Bulk Carrier",
    dwt: 58200,
    gt: 35100,
    cubic: 72000,
    draft: 13.0,
    tpcTpi: 58,
    hsfoScrubbers: "N",
    builtYear: 2017,
    consumption: estimateConsumption(58200),
  },
  {
    name: "Golden Fortune",
    type: "Bulk Carrier",
    dwt: 56800,
    gt: 34200,
    cubic: 70000,
    draft: 12.8,
    tpcTpi: 56,
    hsfoScrubbers: "N",
    builtYear: 2016,
    consumption: estimateConsumption(56800),
  },

  // ============ HANDYMAX BULK CARRIERS ============
  {
    name: "Bright Star",
    type: "Bulk Carrier",
    dwt: 52500,
    gt: 31500,
    cubic: 65000,
    draft: 12.5,
    tpcTpi: 54,
    hsfoScrubbers: "N",
    builtYear: 2014,
    consumption: estimateConsumption(52500),
  },
  {
    name: "Sea Dragon",
    type: "Bulk Carrier",
    dwt: 48200,
    gt: 29000,
    cubic: 60000,
    draft: 12.0,
    tpcTpi: 52,
    hsfoScrubbers: "Y",
    builtYear: 2018,
    consumption: estimateConsumption(48200),
  },
  {
    name: "Lucky Trader",
    type: "Bulk Carrier",
    dwt: 45100,
    gt: 27500,
    cubic: 56000,
    draft: 11.8,
    tpcTpi: 50,
    hsfoScrubbers: "N",
    builtYear: 2015,
    consumption: estimateConsumption(45100),
  },

  // ============ HANDYSIZE BULK CARRIERS ============
  {
    name: "Ocean Spirit",
    type: "Bulk Carrier",
    dwt: 38500,
    gt: 24200,
    cubic: 48000,
    draft: 11.2,
    tpcTpi: 48,
    hsfoScrubbers: "N",
    builtYear: 2019,
    consumption: estimateConsumption(38500),
  },
  {
    name: "Emerald Bay",
    type: "Bulk Carrier",
    dwt: 35200,
    gt: 22500,
    cubic: 44000,
    draft: 10.8,
    tpcTpi: 46,
    hsfoScrubbers: "Y",
    builtYear: 2021,
    consumption: estimateConsumption(35200),
  },
  {
    name: "Pacific Pioneer",
    type: "Bulk Carrier",
    dwt: 32800,
    gt: 21000,
    cubic: 41000,
    draft: 10.5,
    tpcTpi: 44,
    hsfoScrubbers: "N",
    builtYear: 2016,
    consumption: estimateConsumption(32800),
  },
  {
    name: "Blue Horizon",
    type: "Bulk Carrier",
    dwt: 28500,
    gt: 18500,
    cubic: 36000,
    draft: 10.0,
    tpcTpi: 42,
    hsfoScrubbers: "N",
    builtYear: 2020,
    consumption: estimateConsumption(28500),
  },

  // ============ TANKERS ============
  {
    name: "Nordic Tanker",
    type: "Tanker",
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
    name: "Eastern Glory",
    type: "Tanker",
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
  {
    name: "Aegean Titan",
    type: "Tanker",
    dwt: 160000,
    gt: 85000,
    cubic: 180000,
    draft: 17.5,
    tpcTpi: 95,
    hsfoScrubbers: "Y",
    builtYear: 2018,
    consumption: estimateConsumption(160000),
  },
  {
    name: "Gulf Voyager",
    type: "Tanker",
    dwt: 115000,
    gt: 62000,
    cubic: 130000,
    draft: 16.0,
    tpcTpi: 88,
    hsfoScrubbers: "N",
    builtYear: 2015,
    consumption: estimateConsumption(115000),
  },

  // ============ CONTAINER VESSELS ============
  {
    name: "Pacific Star",
    type: "Container",
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
    name: "Maersk Explorer",
    type: "Container",
    dwt: 85000,
    gt: 72000,
    cubic: 0,
    draft: 14.5,
    tpcTpi: 75,
    hsfoScrubbers: "Y",
    builtYear: 2019,
    consumption: estimateConsumption(85000),
  },
  {
    name: "MSC Navigator",
    type: "Container",
    dwt: 120000,
    gt: 95000,
    cubic: 0,
    draft: 15.5,
    tpcTpi: 90,
    hsfoScrubbers: "Y",
    builtYear: 2021,
    consumption: estimateConsumption(120000),
  },

  // ============ LNG / LPG CARRIERS ============
  {
    name: "LNG Atlantis",
    type: "LNG",
    dwt: 82000,
    gt: 98000,
    cubic: 174000,
    draft: 12.0,
    tpcTpi: 70,
    hsfoScrubbers: "N",
    builtYear: 2020,
    consumption: estimateConsumption(82000),
  },
  {
    name: "LPG Voyager",
    type: "LPG",
    dwt: 55000,
    gt: 48000,
    cubic: 85000,
    draft: 11.5,
    tpcTpi: 58,
    hsfoScrubbers: "N",
    builtYear: 2018,
    consumption: estimateConsumption(55000),
  },

  // ============ CHEMICAL TANKERS ============
  {
    name: "Chem Star",
    type: "Chemical Tanker",
    dwt: 37500,
    gt: 24000,
    cubic: 42000,
    draft: 11.0,
    tpcTpi: 48,
    hsfoScrubbers: "N",
    builtYear: 2017,
    consumption: estimateConsumption(37500),
  },
  {
    name: "Stolt Confidence",
    type: "Chemical Tanker",
    dwt: 45000,
    gt: 28500,
    cubic: 52000,
    draft: 11.8,
    tpcTpi: 52,
    hsfoScrubbers: "Y",
    builtYear: 2019,
    consumption: estimateConsumption(45000),
  },

  // ============ GENERAL CARGO ============
  {
    name: "General Trader",
    type: "General Cargo",
    dwt: 18500,
    gt: 12000,
    cubic: 24000,
    draft: 8.5,
    tpcTpi: 38,
    hsfoScrubbers: "N",
    builtYear: 2014,
    consumption: estimateConsumption(18500),
  },
  {
    name: "Multi Purpose",
    type: "General Cargo",
    dwt: 22000,
    gt: 14500,
    cubic: 28000,
    draft: 9.0,
    tpcTpi: 40,
    hsfoScrubbers: "N",
    builtYear: 2016,
    consumption: estimateConsumption(22000),
  },
];

// Vessel types
export const vesselTypes = [
  "Bulk Carrier",
  "Ore Carrier",
  "Tanker",
  "Container",
  "General Cargo",
  "LNG",
  "LPG",
  "Chemical Tanker",
];

// Get vessel by name
export function getVesselByName(name: string): VesselData | undefined {
  return vesselFleet.find(
    (v) => v.name.toLowerCase() === name.toLowerCase()
  );
}

// Search vessels by name
export function searchVessels(query: string): VesselData[] {
  if (!query || query.length < 2) return vesselFleet;

  const lowerQuery = query.toLowerCase();
  return vesselFleet.filter(
    (v) =>
      v.name.toLowerCase().includes(lowerQuery) ||
      v.type.toLowerCase().includes(lowerQuery) ||
      (v.imo && v.imo.includes(query)) ||
      (v.owner && v.owner.toLowerCase().includes(lowerQuery))
  );
}

// Get vessels by type
export function getVesselsByType(type: string): VesselData[] {
  return vesselFleet.filter((v) => v.type === type);
}
