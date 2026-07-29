// Presentation-only sample analytics for the dashboard overview.
// No business logic, calculations, or API data are affected by this file.

export type VesselStatus = "At Sea" | "In Port" | "Loading" | "Discharging" | "Idle";

export interface FleetVessel {
  id: string;
  name: string;
  type: string;
  route: string;
  status: VesselStatus;
  speed: number;
  fuelPerDay: number;
  co2PerDay: number;
  utilization: number;
  // Map position in percentage of container box
  x: number;
  y: number;
}

export const FLEET: FleetVessel[] = [
  { id: "IMO9345123", name: "Ocean Pioneer", type: "Capesize", route: "Paradip → Rotterdam", status: "At Sea", speed: 13.2, fuelPerDay: 32.4, co2PerDay: 103.7, utilization: 94, x: 62, y: 47 },
  { id: "IMO9412887", name: "Nordic Trader", type: "Panamax", route: "Santos → Qingdao", status: "At Sea", speed: 12.1, fuelPerDay: 27.8, co2PerDay: 89.0, utilization: 88, x: 32, y: 62 },
  { id: "IMO9501234", name: "Aegean Star", type: "Supramax", route: "Gibraltar → Aviles", status: "Loading", speed: 0, fuelPerDay: 6.2, co2PerDay: 19.8, utilization: 71, x: 46, y: 36 },
  { id: "IMO9633741", name: "Baltic Spirit", type: "Handysize", route: "Great Yarmouth → Sheerness", status: "In Port", speed: 0, fuelPerDay: 4.1, co2PerDay: 13.1, utilization: 63, x: 48, y: 28 },
  { id: "IMO9722018", name: "Pacific Dawn", type: "Aframax", route: "Fujairah → Singapore", status: "Discharging", speed: 0, fuelPerDay: 7.6, co2PerDay: 24.3, utilization: 82, x: 74, y: 55 },
  { id: "IMO9800456", name: "Atlantic Crest", type: "Kamsarmax", route: "Tubarao → Antwerpen", status: "At Sea", speed: 11.6, fuelPerDay: 29.9, co2PerDay: 95.7, utilization: 90, x: 38, y: 44 },
  { id: "IMO9877654", name: "Coral Meridian", type: "Suezmax", route: "Suez → Porto Marghera", status: "At Sea", speed: 13.8, fuelPerDay: 34.5, co2PerDay: 110.4, utilization: 96, x: 55, y: 40 },
  { id: "IMO9911002", name: "Harbour Ranger", type: "Handymax", route: "Chittagong → Trincomalee", status: "Idle", speed: 0, fuelPerDay: 2.8, co2PerDay: 9.0, utilization: 41, x: 70, y: 52 },
];

export const FLEET_OVERVIEW = [
  { month: "Feb", atSea: 18, inPort: 6, idle: 3 },
  { month: "Mar", atSea: 21, inPort: 5, idle: 2 },
  { month: "Apr", atSea: 19, inPort: 8, idle: 4 },
  { month: "May", atSea: 24, inPort: 6, idle: 2 },
  { month: "Jun", atSea: 26, inPort: 5, idle: 1 },
  { month: "Jul", atSea: 23, inPort: 7, idle: 3 },
];

export const FUEL_SERIES = [
  { month: "Feb", vlsfo: 1180, lsmgo: 310, hsfo: 420 },
  { month: "Mar", vlsfo: 1340, lsmgo: 290, hsfo: 460 },
  { month: "Apr", vlsfo: 1210, lsmgo: 340, hsfo: 405 },
  { month: "May", vlsfo: 1480, lsmgo: 360, hsfo: 512 },
  { month: "Jun", vlsfo: 1560, lsmgo: 330, hsfo: 540 },
  { month: "Jul", vlsfo: 1425, lsmgo: 355, hsfo: 498 },
];

export const CO2_SERIES = [
  { month: "Feb", euEts: 1120, ukEts: 340, total: 5980 },
  { month: "Mar", euEts: 1290, ukEts: 380, total: 6540 },
  { month: "Apr", euEts: 1180, ukEts: 300, total: 6120 },
  { month: "May", euEts: 1460, ukEts: 420, total: 7310 },
  { month: "Jun", euEts: 1530, ukEts: 455, total: 7640 },
  { month: "Jul", euEts: 1395, ukEts: 410, total: 7025 },
];

export const VOYAGE_STATUS = [
  { key: "laden", label: "Laden Voyages", count: 12, delta: "+2 this week", tone: "info" as const },
  { key: "ballast", label: "Ballast Legs", count: 5, delta: "-1 this week", tone: "neutral" as const },
  { key: "port", label: "In Port Ops", count: 7, delta: "3 loading", tone: "warning" as const },
  { key: "completed", label: "Completed", count: 34, delta: "+6 this month", tone: "success" as const },
];

export const ALERTS = [
  { id: 1, severity: "danger" as const, title: "EU ETS allowance shortfall", detail: "Coral Meridian — 42 t CO₂e above allocated EUAs", time: "12 min ago" },
  { id: 2, severity: "warning" as const, title: "Bunker price spike — Rotterdam", detail: "VLSFO up 4.8% vs last estimate", time: "1 h ago" },
  { id: 3, severity: "warning" as const, title: "Draft restriction at Paradip", detail: "Max sailing draft reduced to 13.1 m", time: "3 h ago" },
  { id: 4, severity: "info" as const, title: "Weather delay forecast", detail: "Bay of Biscay — +0.6 d on Atlantic Crest", time: "6 h ago" },
];

export const ACTIVITIES = [
  { id: 1, who: "Operations", what: "updated bunker prices for Singapore", time: "8 min ago" },
  { id: 2, who: "Chartering", what: "created estimate “Tubarao → Antwerpen”", time: "40 min ago" },
  { id: 3, who: "Compliance", what: "approved FuelEU penalty projection", time: "2 h ago" },
  { id: 4, who: "Operations", what: "closed voyage “Suez → Marghera”", time: "5 h ago" },
  { id: 5, who: "Chartering", what: "shared 3 sheets with the organization", time: "Yesterday" },
];