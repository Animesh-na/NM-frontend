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

export interface FuelConsumptionResult {
  outside_eca: FuelZone;
  inside_eca: FuelZone;
  in_port: FuelZone;
}

export interface EngineEstimates {
  expected_me_consumption: number;
  expected_ae_consumption_non_scrubber: number;
  expected_ae_consumption_scrubber: number;
}

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
  scrubber_indicator: boolean;
  main_engine1_mcr: number;
  main_engine1_sfoc: number;
  engine_estimates: EngineEstimates;
  fuel_consumption: FuelConsumptionResult;
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
  options?: { typeId?: number; sectorId?: number; limit?: number },
): Promise<VesselWithFuel[]> {
  try {
    const params: Record<string, string | number> = { action: 'search', q: query, limit: options?.limit ?? 10 };
    if (options?.typeId) params.type_id = options.typeId;
    if (options?.sectorId) params.sector_id = options.sectorId;
    const data = await apiFetch<{ vessels: VesselWithFuel[] }>(params);
    return data.vessels || [];
  } catch (e) {
    console.error('Failed to search vessels:', e);
    return [];
  }
}
