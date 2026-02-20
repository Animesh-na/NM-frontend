import { useState, useRef, useEffect } from "react";
import { Search, Ship, Loader2 } from "lucide-react";
import { 
  type VesselData, 
  defaultVessel,
  estimateExtendedConsumption,
  estimateTpc,
  syncLegacyConsumption,
} from "@/data/vessels";
import { cn } from "@/lib/utils";
import { searchVesselsWithFuel, type VesselWithFuel } from "@/services/vesselFuelApi";

interface VesselSelectProps {
  value: string;
  onChange: (vessel: VesselData | null, fuelData?: VesselWithFuel) => void;
  selectedTypeId?: number | null;
  selectedSectorId?: number | null;
  placeholder?: string;
  className?: string;
}

// Convert API vessel to VesselData
function vesselWithFuelToVesselData(v: VesselWithFuel): VesselData {
  const dwt = v.dwt || 0;
  const ecoMatrix = estimateExtendedConsumption(dwt, false);
  const fullMatrix = estimateExtendedConsumption(dwt, true);

  return {
    name: v.name,
    type: v.type || "Bulk Carrier",
    imo: v.imo || "",
    dwt,
    gt: v.gt || 0,
    cubic: v.capacitycuft || 0,
    cubicUnit: "cuft",
    draft: v.draught || 0,
    tpcTpi: estimateTpc(dwt),
    hsfoCapability: !v.scrubber_indicator, // non-scrubber defaults to VLSFO capability
    hasScrubber: v.scrubber_indicator,
    scrubberCount: v.scrubber_indicator ? 1 : 0,
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
          typeId: selectedTypeId || undefined,
          sectorId: selectedSectorId || undefined,
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

  const handleSelect = (v: VesselWithFuel) => {
    setSearch(v.name);
    onChange(vesselWithFuelToVesselData(v), v);
    setIsOpen(false);
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
        {loading && <Loader2 className="absolute right-6 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />}
        {search && (
          <button onClick={handleClear} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm">×</button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 min-w-[360px] max-h-64 overflow-auto rounded-sm border border-border bg-popover shadow-md">
          {search.length < 2 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Type at least 2 characters to search...</div>
          ) : loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching vessels...
            </div>
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
