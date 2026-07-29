import { useState, useRef, useEffect } from "react";
import { Search, Ship } from "lucide-react";
import { 
  type VesselData, 
  type ConsumptionMatrix,
  defaultVessel,
  estimateExtendedConsumption,
  estimateTpc,
  syncLegacyConsumption,
} from "@/data/vessels";
import { estimateCubicFromDwt } from "@/utils/draftRestriction";
import { cn } from "@/lib/utils";
import { searchVesselsWithFuel, type VesselWithFuel, type FuelConsumptionResult } from "@/services/vesselFuelApi";
import { logger } from "@/services/logger";

interface VesselSelectProps {
  value: string;
  onChange: (vessel: VesselData | null, fuelData?: VesselWithFuel) => void;
  selectedTypeId?: number | null;
  selectedSectorId?: number | null;
  placeholder?: string;
  className?: string;
}

// Build a ConsumptionMatrix from API fuel_consumption result
function buildMatrixFromFuel(fc: FuelConsumptionResult, hasScrubber: boolean): ConsumptionMatrix {
  const meTpd = fc.outside_eca.me_tpd;
  const aeSeaTpd = fc.outside_eca.ae_tpd;
  const aePortTpd = fc.in_port.ae_tpd;
  const scrubberPenalty = hasScrubber ? fc.outside_eca.scrubber_penalty_tpd : 0;

  // HSFO: only if scrubber equipped, used outside ECA (ballast/laden at sea)
  const hsfo = {
    ballast: hasScrubber ? meTpd : 0,
    laden: hasScrubber ? meTpd : 0,
    canal: hasScrubber ? meTpd : 0,
    load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0,
  };

  // VLSFO: only if NO scrubber, used outside ECA (ballast/laden at sea)
  const vlsfo = {
    ballast: !hasScrubber ? meTpd : 0,
    laden: !hasScrubber ? meTpd : 0,
    canal: !hasScrubber ? meTpd : 0,
    load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0,
  };

  // LSMGO: used inside ECA (sea ME) — port ME is off so LSMGO port = 0
  // AE port consumption is handled separately via the AE row
  const ecaMeTpd = fc.inside_eca.me_tpd;
  const lsmgo = {
    ballast: ecaMeTpd,
    laden: ecaMeTpd,
    canal: ecaMeTpd,
    load: 0, // ME off in port — AE port consumption is in AE row
    discharge: 0,
    idle: 0,
    misc1: 0, misc2: 0,
  };

  // AE consumption (separate row)
  const ae = {
    ballast: aeSeaTpd,
    laden: aeSeaTpd,
    canal: aeSeaTpd,
    load: aePortTpd,
    discharge: aePortTpd,
    idle: aePortTpd,
    misc1: 0, misc2: 0,
  };

  // AE + Scrubber penalty (additional consumption when scrubber runs)
  const aeScrubber = {
    ballast: scrubberPenalty,
    laden: scrubberPenalty,
    canal: scrubberPenalty,
    load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0,
  };

  return {
    speed: { ballast: 13, laden: 12.5, canal: 0, load: 0, discharge: 0, idle: 0, misc1: 0, misc2: 0 },
    hsfo, vlsfo, lsmgo, ae, aeScrubber,
  };
}

// Rough fallbacks used when the upstream record omits a field (common on tanker payloads)
function estimateGtFromDwt(dwt: number): number {
  if (!dwt) return 0;
  return Math.round(dwt * 0.55);
}

function estimateDraftFromDwt(dwt: number): number {
  if (!dwt) return 0;
  if (dwt >= 200000) return 18.2;
  if (dwt >= 100000) return 15.5;
  if (dwt >= 60000) return 13.5;
  if (dwt >= 40000) return 12.0;
  if (dwt >= 25000) return 10.5;
  return 9.0;
}

// Convert API vessel to VesselData, using actual fuel data when available
function vesselWithFuelToVesselData(
  v: VesselWithFuel,
  fullSpeedData?: FuelConsumptionResult | null,
): VesselData {
  const dwt = v.dwt || 0;
  const hasScrubber = !!v.scrubber_indicator;

  // Use API fuel data if available, otherwise fall back to DWT estimates
  let ecoMatrix: ConsumptionMatrix;
  let fullMatrix: ConsumptionMatrix;

  if (v.fuel_consumption && v.calculation_status === 'ok') {
    // v is searched with eco mode → use for eco matrix
    ecoMatrix = buildMatrixFromFuel(v.fuel_consumption, hasScrubber);
  } else {
    ecoMatrix = estimateExtendedConsumption(dwt, false);
  }

  if (fullSpeedData) {
    fullMatrix = buildMatrixFromFuel(fullSpeedData, hasScrubber);
  } else {
    fullMatrix = estimateExtendedConsumption(dwt, true);
  }

  return {
    name: v.name,
    type: v.type || "",
    imo: v.imo || "",
    dwt,
    gt: v.gt || estimateGtFromDwt(dwt),
    cubic: Math.round((v.capacity_cu_m || (v.capacitycuft ? v.capacitycuft / 35.3147 : 0) || estimateCubicFromDwt(dwt)) * 100) / 100,
    cubicUnit: "cbm",
    draft: v.draught || estimateDraftFromDwt(dwt),
    tpcTpi: v.tpc || estimateTpc(dwt),
    hsfoCapability: hasScrubber,
    hasScrubber,
    scrubberCount: hasScrubber ? 1 : 0,
    builtYear: v.builtyear,
    builder: v.builder,
    owner: v.owner,
    loa: v.loa,
    beam: v.beam,
    speedProfile: "eco",
    loadDischIdleSame: false,
    miscMultiplier: 0,
    ecoConsumption: ecoMatrix,
    fullConsumption: fullMatrix,
    consumption: syncLegacyConsumption(ecoMatrix),
  };
}

export function VesselSelect({ 
  value, 
  onChange, 
  selectedTypeId,
  selectedSectorId,
  placeholder = "Search vessel by name or IMO...", 
  className 
}: VesselSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [vessels, setVessels] = useState<VesselWithFuel[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (search.length < 2) { setVessels([]); return; }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchVesselsWithFuel(search, {
          mode: 'eco',
          limit: 10,
        });
        setVessels(results);
      } catch { setVessels([]); }
      finally { setLoading(false); }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, selectedTypeId, selectedSectorId]);

  useEffect(() => { setSearch(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = async (v: VesselWithFuel) => {
    setSearch(v.name);
    setIsOpen(false);
    logger.info(`Vessel selected: ${v.name}`, {
      component: "VesselSelect",
      vessel_id: v.id,
      vessel_name: v.name,
      imo: v.imo,
      dwt: v.dwt,
      type: v.type,
    });

    // The search was done in eco mode (default). Now fetch full_speed data for the same vessel.
    let fullSpeedFuel: FuelConsumptionResult | null = null;
    try {
      const fullResults = await searchVesselsWithFuel(v.imo || v.name, { mode: 'full_speed', limit: 5 });
      const match = fullResults.find(fv => fv.id === v.id || fv.imo === v.imo);
      if (match?.fuel_consumption && match.calculation_status === 'ok') {
        fullSpeedFuel = match.fuel_consumption;
      }
    } catch (e) {
      console.warn('Failed to fetch full_speed fuel data:', e);
    }

    onChange(vesselWithFuelToVesselData(v, fullSpeedFuel), v);
  };

  const handleClear = () => { setSearch(""); onChange(null); setVessels([]); };

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="form-input w-full pl-6 pr-6 text-xs"
        />
        {search && (
          <button onClick={handleClear} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm">×</button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 min-w-[360px] max-h-64 overflow-auto rounded-sm border border-border bg-popover shadow-md">
          {search.length < 2 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Type at least 2 characters to search...</div>
          ) : vessels.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No vessels found</div>
          ) : (
            <div>
              {vessels.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleSelect(v)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground text-xs border-b border-border/50 last:border-0"
                >
                  <Ship className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{v.name}</div>
                    <div className="text-[10px] text-muted-foreground flex gap-2 flex-wrap">
                      <span className="text-primary/80">{v.type}</span>
                      {v.imo && <span>IMO: {v.imo}</span>}
                      {v.dwt > 0 && <span>DWT: {v.dwt.toLocaleString()}</span>}
                      {v.builtyear > 0 && <span>Built: {v.builtyear}</span>}
                      {v.scrubber_indicator && <span className="text-green-500">Scrubber</span>}
                    </div>
                    {v.fuel_consumption && (
                      <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                        {v.fuel_consumption.outside_eca.fuel_type}: {v.fuel_consumption.outside_eca.tpd} TPD
                        {" · ECA: "}{v.fuel_consumption.inside_eca.tpd} TPD
                        {" · Port: "}{v.fuel_consumption.in_port.tpd} TPD
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="px-2 py-1.5 border-t border-border bg-muted/30">
            <button
              onClick={() => { onChange(null); setIsOpen(false); }}
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground"
            >
              + Enter vessel manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
