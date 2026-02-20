import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MARINE_API_BASE = "https://development.effimove.in/marine/api/v1";
const MARINE_API_KEY = "effimove@2026";

// ─── Constants ───
const AE_SFOC = 181; // g/kWh standard for auxiliary engines

interface ModeParams {
  me_load: number;      // fraction
  ae_sea_load: number;  // fraction of MCR
  ae_port_load: number; // fraction of MCR
  scrubber_penalty: number; // fraction (additional % of total outside ECA)
}

const MODES: Record<string, ModeParams> = {
  full_speed: {
    me_load: 0.85,
    ae_sea_load: 0.04,
    ae_port_load: 0.06,
    scrubber_penalty: 0.015,
  },
  eco: {
    me_load: 0.70,
    ae_sea_load: 0.035,
    ae_port_load: 0.06,
    scrubber_penalty: 0.012,
  },
};

// ─── Calculation Engine ───

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function calculateFuelTPD(mcr: number, sfoc: number, loadFraction: number): number {
  // Fuel (TPD) = (MCR × Load% × SFOC × 24) / 1,000,000
  return (mcr * loadFraction * sfoc * 24) / 1_000_000;
}

function calculateAeFuelTPD(mcr: number, aeLoadFraction: number): number {
  // AE_kW = MCR × AE_Load%, then AE Fuel = (AE_kW × AE_SFOC × 24) / 1,000,000
  const aeKw = mcr * aeLoadFraction;
  return (aeKw * AE_SFOC * 24) / 1_000_000;
}

interface FuelResult {
  outside_eca: { fuel_type: string; me_tpd: number; ae_tpd: number; scrubber_penalty_tpd: number; tpd: number };
  inside_eca:  { fuel_type: string; me_tpd: number; ae_tpd: number; tpd: number };
  in_port:     { fuel_type: string; me_tpd: number; ae_tpd: number; tpd: number };
}

function computeConsumption(
  mcr: number,
  sfoc: number,
  scrubberIndicator: boolean,
  mode: ModeParams,
): FuelResult {
  const meFuel = calculateFuelTPD(mcr, sfoc, mode.me_load);
  const aeSeaFuel = calculateAeFuelTPD(mcr, mode.ae_sea_load);
  const aePortFuel = calculateAeFuelTPD(mcr, mode.ae_port_load);

  // OUTSIDE ECA
  const baseTotalOutside = meFuel + aeSeaFuel;
  const scrubberPenaltyTpd = scrubberIndicator ? round2(baseTotalOutside * mode.scrubber_penalty) : 0;
  const outsideEca = {
    fuel_type: scrubberIndicator ? "HSFO" : "VLSFO",
    me_tpd: round2(meFuel),
    ae_tpd: round2(aeSeaFuel),
    scrubber_penalty_tpd: scrubberPenaltyTpd,
    tpd: round2(baseTotalOutside + scrubberPenaltyTpd),
  };

  // INSIDE ECA — always LSMGO, no scrubber penalty
  const insideEca = {
    fuel_type: "LSMGO",
    me_tpd: round2(meFuel),
    ae_tpd: round2(aeSeaFuel),
    tpd: round2(meFuel + aeSeaFuel),
  };

  // IN PORT — LSMGO, AE only, no ME
  const inPort = {
    fuel_type: "LSMGO",
    me_tpd: 0,
    ae_tpd: round2(aePortFuel),
    tpd: round2(aePortFuel),
  };

  return { outside_eca: outsideEca, inside_eca: insideEca, in_port: inPort };
}

// ─── Marine API proxy helper ───

async function marineApiFetch(endpoint: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `${MARINE_API_BASE}${endpoint}${qs}`;
  console.log('Proxy →', url);
  const res = await fetch(url, {
    headers: { 'API-Key': MARINE_API_KEY, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error('Non-JSON response from upstream:', text.substring(0, 200));
    return { error: 'Upstream returned non-JSON response', status: res.status };
  }
}

// ─── Handler ───

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || '';

    // GET ?action=types
    if (action === 'types') {
      const data = await marineApiFetch('/vessel-types');
      return json(data);
    }

    // GET ?action=sectors
    if (action === 'sectors') {
      const sectors = [
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
      return json({ sectors });
    }

    // GET ?action=search&q=<name_or_imo>&mode=full_speed|eco
    if (action === 'search') {
      const q = url.searchParams.get('q') || '';
      const limit = url.searchParams.get('limit') || '10';
      const modeParam = url.searchParams.get('mode') || 'full_speed';

      if (!q || q.length < 2) {
        return json({ vessels: [], message: 'Query must be at least 2 characters' });
      }

      const mode = MODES[modeParam] || MODES.full_speed;

      // Search by q only — type/sector are NOT mixed into search
      const data = await marineApiFetch('/vessels/search', { q, limit });
      const vessels = (data.vessels || []).map((v: any) => {
        const mcr = v.main_engine1_mcr;
        const sfoc = v.main_engine1_sfoc;
        const scrubber = !!v.scrubber_indicator;

        // Null handling — if MCR or SFOC missing, return insufficient status
        if (mcr == null || sfoc == null || mcr === 0 || sfoc === 0) {
          return {
            ...v,
            scrubber_indicator: scrubber,
            hsfo_allowed: scrubber,
            mode: modeParam,
            calculation_status: "insufficient_engine_data",
            fuel_consumption: null,
          };
        }

        const fuelConsumption = computeConsumption(mcr, sfoc, scrubber, mode);

        return {
          ...v,
          scrubber_indicator: scrubber,
          hsfo_allowed: scrubber,
          mode: modeParam,
          calculation_status: "ok",
          fuel_consumption: fuelConsumption,
        };
      });

      return json({ vessels });
    }

    return json({ error: 'Missing or invalid action param. Use: types, sectors, search' }, 400);
  } catch (error: unknown) {
    console.error('vessel-fuel-api error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: msg }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
