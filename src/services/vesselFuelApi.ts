// Vessel Fuel Consumption API Service

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const BASE = `${SUPABASE_URL}/functions/v1/vessel-fuel-api`;

async function apiFetch<T>(params?: Record<string, string | number>): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    });
  }
  const url = `${BASE}${qs.toString() ? '?' + qs.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
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
    const data = await apiFetch<{ types: VesselType[] }>({ action: 'types' });
    return data.types || [];
  } catch (e) {
    console.error('Failed to fetch vessel types:', e);
    return [];
  }
}

export async function getVesselSectors(): Promise<VesselSector[]> {
  try {
    const data = await apiFetch<{ sectors: VesselSector[] }>({ action: 'sectors' });
    return data.sectors || [];
  } catch (e) {
    console.error('Failed to fetch vessel sectors:', e);
    return [];
  }
}

export async function searchVesselsWithFuel(
  query: string,
  options?: { mode?: OperatingMode; limit?: number },
): Promise<VesselWithFuel[]> {
  try {
    const params: Record<string, string | number> = {
      action: 'search',
      q: query,
      limit: options?.limit ?? 10,
      mode: options?.mode ?? 'full_speed',
    };
    const data = await apiFetch<{ vessels: VesselWithFuel[] }>(params);
    return data.vessels || [];
  } catch (e) {
    console.error('Failed to search vessels:', e);
    return [];
  }
}
