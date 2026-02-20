import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MARINE_API_BASE = "https://development.effimove.in/marine/api/v1";
const MARINE_API_KEY = "effimove@2026";

// ─── Fuel Consumption Rule Engine ───

interface FuelConsumptionResult {
  outside_eca: { fuel_type: string; me_tpd: number; ae_tpd: number; tpd: number };
  inside_eca:  { fuel_type: string; me_tpd: number; ae_tpd: number; tpd: number };
  in_port:     { fuel_type: string; me_tpd: number; ae_tpd: number; tpd: number };
}

function calculateFuelConsumption(
  scrubberIndicator: boolean,
  meConsumption: number,
  aeNonScrubber: number,
  aeScrubber: number,
): FuelConsumptionResult {
  // OUTSIDE ECA
  const outsideEca = scrubberIndicator
    ? { fuel_type: "HSFO",  me_tpd: meConsumption, ae_tpd: aeScrubber,    tpd: round(meConsumption + aeScrubber) }
    : { fuel_type: "VLSFO", me_tpd: meConsumption, ae_tpd: aeNonScrubber, tpd: round(meConsumption + aeNonScrubber) };

  // INSIDE ECA — always LSMGO, scrubber does NOT affect
  const insideEca = {
    fuel_type: "LSMGO",
    me_tpd: meConsumption,
    ae_tpd: aeNonScrubber,
    tpd: round(meConsumption + aeNonScrubber),
  };

  // IN PORT — LSMGO, ME = 0
  const inPort = {
    fuel_type: "LSMGO",
    me_tpd: 0,
    ae_tpd: aeNonScrubber,
    tpd: round(aeNonScrubber),
  };

  return { outside_eca: outsideEca, inside_eca: insideEca, in_port: inPort };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Estimate consumption from engine specs ───

function estimateConsumptionFromEngine(mcr: number, sfoc: number) {
  // ME consumption (TPD) = MCR (kW) × SFOC (g/kWh) × 24h / 1_000_000
  const meConsumption = (mcr * sfoc * 24) / 1_000_000;
  // AE non-scrubber ≈ 24.5% of ME
  const aeNonScrubber = meConsumption * 0.245;
  // AE scrubber ≈ 39.2% of ME (scrubber adds ~60% to AE load)
  const aeScrubber = meConsumption * 0.392;
  return {
    expected_me_consumption: round(meConsumption),
    expected_ae_consumption_non_scrubber: round(aeNonScrubber),
    expected_ae_consumption_scrubber: round(aeScrubber),
  };
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

    // GET ?action=sectors (derived from known vessel sectors)
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

    // GET ?action=search&q=<name_or_imo>
    if (action === 'search') {
      const q = url.searchParams.get('q') || '';
      const limit = url.searchParams.get('limit') || '10';
      const typeId = url.searchParams.get('type_id') || '';
      const sectorId = url.searchParams.get('sector_id') || '';

      if (!q || q.length < 2) {
        return json({ vessels: [], message: 'Query must be at least 2 characters' });
      }

      const params: Record<string, string> = { q, limit };
      if (typeId) params.type_id = typeId;
      if (sectorId) params.sector_id = sectorId;

      const data = await marineApiFetch('/vessels/search', params);
      const vessels = (data.vessels || []).map((v: any) => {
        const mcr = v.main_engine1_mcr || 0;
        const sfoc = v.main_engine1_sfoc || 0;
        const scrubber = !!v.scrubber_indicator;

        const estimates = estimateConsumptionFromEngine(mcr, sfoc);
        const fuelConsumption = calculateFuelConsumption(
          scrubber,
          estimates.expected_me_consumption,
          estimates.expected_ae_consumption_non_scrubber,
          estimates.expected_ae_consumption_scrubber,
        );

        return {
          ...v,
          scrubber_indicator: scrubber,
          engine_estimates: estimates,
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
