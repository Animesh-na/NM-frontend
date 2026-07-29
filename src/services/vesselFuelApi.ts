// Vessel Fuel Consumption API Service — calls upstream directly + computes
// fuel TPD client-side (previously done inside the vessel-fuel-api edge function).
import { buildMarineUrl, marineHeaders } from "./apiConfig";
import { modePath } from "./apiMode";
import { dispatchSessionExpired, getStoredAuthToken } from "@/utils/authToken";

const AE_SFOC = 181; // g/kWh standard for auxiliary engines

interface ModeParams {
  me_load: number;
  ae_sea_load: number;
  ae_port_load: number;
  scrubber_penalty: number;
}

const MODES: Record<OperatingMode, ModeParams> = {
  full_speed: { me_load: 0.85, ae_sea_load: 0.04, ae_port_load: 0.06, scrubber_penalty: 0.015 },
  eco:        { me_load: 0.70, ae_sea_load: 0.035, ae_port_load: 0.06, scrubber_penalty: 0.012 },
};

const SECTORS: VesselSector[] = [
  { id: 1, name: "Dry Bulk" },
  { id: 2, name: "Tanker" },
  { id: 3, name: "Container" },
  { id: 4, name: "Gas" },
  { id: 5, name: "Offshore" },
  { id: 6, name: "General Cargo" },
  { id: 7, name: "General Cargo, Coastal Trading" },
  { id: 8, name: "Specialised Tanker" },
  { id: 9, name: "Car Carrier" },
  { id: 10, name: "Reefer" },
  { id: 11, name: "Cruise" },
];

const round2 = (v: number) => Math.round(v * 100) / 100;

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Normalizes an upstream vessel record into the canonical shape.
 * Dry-bulk and tanker endpoints return different field names
 * (e.g. `vessel_name`/`blt`/`summer_draught`/`scrubbers` on tanker).
 */
function normalizeVesselRecord(v: Record<string, any>) {
  const name = v.name ?? v.vessel_name ?? v.vessel_enriched ?? "";
  const draught = v.draught ?? v.summer_draught ?? v.summer_draft ?? v.draft ?? 0;
  const scrubber = !!(v.scrubber_indicator ?? v.scrubbers);
  const capacityCbm =
    v.capacity_cu_m ??
    v.liquid_capacity_cbm ??
    v.cargo_capacity_cbm ??
    v.cbm ??
    (v.capacitycuft ? num(v.capacitycuft) / 35.3147 : null);

  return {
    ...v,
    id: num(v.id),
    name,
    type: v.type ?? v.vessel_class ?? v.built_for_trade ?? v.trade ?? "",
    imo: v.imo != null ? String(v.imo) : "",
    dwt: num(v.dwt),
    gt: num(v.gt ?? v.grt ?? v.gross_tonnage),
    loa: num(v.loa ?? v.loa_m ?? v.length_overall),
    beam: num(v.beam ?? v.beam_m ?? v.breadth),
    draught: num(draught),
    builtyear: num(v.builtyear ?? v.blt ?? v.built ?? v.year_built),
    builder: v.builder ?? v.shipyard_built ?? v.shipyard ?? "",
    owner: v.owner ?? v.head_owner ?? v.commercial_operator ?? "",
    capacitycuft: num(v.capacitycuft),
    capacity_cu_m: capacityCbm != null ? num(capacityCbm) : null,
    tpc: v.tpc ?? v.summer_tpc ?? v.tpc_summer ?? null,
    speed_knots: v.speed_knots ?? null,
    sector: v.sector ?? v.vessel_class ?? null,
    scrubber_indicator: scrubber,
    hsfo_allowed: scrubber,
    main_engine1_mcr: num(v.main_engine1_mcr ?? v.main_engine_power_kw ?? v.me_power_kw),
    main_engine1_sfoc: num(v.main_engine1_sfoc ?? v.main_engine_sfoc ?? v.me_sfoc),
  };
}
const meFuelTpd = (mcr: number, sfoc: number, load: number) => (mcr * load * sfoc * 24) / 1_000_000;
const aeFuelTpd = (mcr: number, aeLoad: number) => (mcr * aeLoad * AE_SFOC * 24) / 1_000_000;

function computeConsumption(mcr: number, sfoc: number, scrubber: boolean, mode: ModeParams): FuelConsumptionResult {
  const meFuel = meFuelTpd(mcr, sfoc, mode.me_load);
  const aeSea = aeFuelTpd(mcr, mode.ae_sea_load);
  const aePort = aeFuelTpd(mcr, mode.ae_port_load);

  const baseOutside = meFuel + aeSea;
  const penalty = scrubber ? round2(baseOutside * mode.scrubber_penalty) : 0;

  return {
    outside_eca: {
      fuel_type: scrubber ? "HSFO" : "VLSFO",
      me_tpd: round2(meFuel),
      ae_tpd: round2(aeSea),
      scrubber_penalty_tpd: penalty,
      tpd: round2(baseOutside + penalty),
    },
    inside_eca: {
      fuel_type: "LSMGO",
      me_tpd: round2(meFuel),
      ae_tpd: round2(aeSea),
      tpd: round2(meFuel + aeSea),
    },
    in_port: {
      fuel_type: "LSMGO",
      me_tpd: 0,
      ae_tpd: round2(aePort),
      tpd: round2(aePort),
    },
  };
}

async function upstream<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
  const token = getStoredAuthToken();
  if (!token) {
    dispatchSessionExpired();
    throw new Error("Session expired");
  }
  const res = await fetch(buildMarineUrl(endpoint, params), {
    headers: marineHeaders({ Authorization: `Bearer ${token}` }),
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      dispatchSessionExpired();
    }
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// ── Types ──

export interface VesselType { id: number; name: string }
export interface VesselSector { id: number; name: string }

export interface FuelZone {
  fuel_type: string;
  me_tpd: number;
  ae_tpd: number;
  tpd: number;
}

export interface FuelZoneOutsideEca extends FuelZone {
  scrubber_penalty_tpd: number;
}

export interface FuelConsumptionResult {
  outside_eca: FuelZoneOutsideEca;
  inside_eca: FuelZone;
  in_port: FuelZone;
}

export type OperatingMode = 'full_speed' | 'eco';

export interface VesselWithFuel {
  id: number;
  name: string;
  type: string;
  imo: string;
  dwt: number;
  gt: number;
  loa: number;
  beam: number;
  draught: number;
  builtyear: number;
  builder: string;
  owner: string;
  capacitycuft: number;
  capacity_cu_m: number | null;
  tpc: number | null;
  speed_knots: number | null;
  sector: string | null;
  scrubber_indicator: boolean;
  hsfo_allowed: boolean;
  main_engine1_mcr: number;
  main_engine1_sfoc: number;
  mode: OperatingMode;
  calculation_status: 'ok' | 'insufficient_engine_data';
  fuel_consumption: FuelConsumptionResult | null;
}

// ── API Calls ──

export async function getVesselTypes(): Promise<VesselType[]> {
  try {
    const data = await upstream<{ types?: VesselType[] } | VesselType[]>(modePath("/vessel-types"));
    return Array.isArray(data) ? data : (data.types || []);
  } catch (e) {
    console.error('Failed to fetch vessel types:', e);
    return [];
  }
}

export async function getVesselSectors(): Promise<VesselSector[]> {
  // Static list — previously hardcoded in the edge function.
  return SECTORS;
}

export async function searchVesselsWithFuel(
  query: string,
  options?: { mode?: OperatingMode; limit?: number },
): Promise<VesselWithFuel[]> {
  try {
    if (!query || query.length < 2) return [];
    const modeKey: OperatingMode = options?.mode ?? 'full_speed';
    const mode = MODES[modeKey];
    const data = await upstream<{ results?: any[]; vessels?: any[] } | any[]>(
      modePath("/vessels"),
      { q: query, limit: options?.limit ?? 10 },
    );
    const raw = Array.isArray(data) ? data : (data.results || data.vessels || []);
    return raw.map((rec: any) => {
      const v = normalizeVesselRecord(rec);
      const mcr = v.main_engine1_mcr;
      const sfoc = v.main_engine1_sfoc;
      const scrubber = v.scrubber_indicator;
      if (mcr == null || sfoc == null || mcr === 0 || sfoc === 0) {
        return {
          ...v,
          mode: modeKey,
          calculation_status: 'insufficient_engine_data',
          fuel_consumption: null,
        } as VesselWithFuel;
      }
      return {
        ...v,
        mode: modeKey,
        calculation_status: 'ok',
        fuel_consumption: computeConsumption(mcr, sfoc, scrubber, mode),
      } as VesselWithFuel;
    });
  } catch (e) {
    console.error('Failed to search vessels:', e);
    return [];
  }
}
