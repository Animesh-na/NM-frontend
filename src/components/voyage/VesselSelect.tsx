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
import { searchVessels, type MarineVessel } from "@/services/marineApi";

interface VesselSelectProps {
  value: string;
  onChange: (vessel: VesselData | null) => void;
  selectedTypeId?: number | null;
  placeholder?: string;
  className?: string;
}

// Convert API vessel to VesselData
function marineVesselToVesselData(vessel: MarineVessel): VesselData {
  const dwt = vessel.dwt || 0;
  const ecoMatrix = estimateExtendedConsumption(dwt, false);
  const fullMatrix = estimateExtendedConsumption(dwt, true);
  
  return {
    name: vessel.name,
    type: vessel.type || "Bulk Carrier",
    imo: vessel.imo || "",
    dwt: dwt,
    gt: vessel.gt || 0,
    cubic: vessel.capacitycuft || 0,
    cubicUnit: "cuft",
    draft: vessel.draught || 0,
    tpcTpi: estimateTpc(dwt),
    hsfoCapability: true,
    hasScrubber: false,
    scrubberCount: 0,
    builtYear: vessel.builtyear,
    builder: vessel.builder,
    owner: vessel.owner,
    loa: vessel.loa,
    beam: vessel.beam,
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
  placeholder = "Search vessel...", 
  className 
}: VesselSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [vessels, setVessels] = useState<MarineVessel[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search vessels when query changes
  useEffect(() => {
    if (search.length < 2) {
      setVessels([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchVessels(search, selectedTypeId || undefined, 10);
        setVessels(results);
      } catch (error) {
        console.error("Failed to search vessels:", error);
        setVessels([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [search, selectedTypeId]);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (vessel: MarineVessel) => {
    setSearch(vessel.name);
    onChange(marineVesselToVesselData(vessel));
    setIsOpen(false);
  };

  const handleClear = () => {
    setSearch("");
    onChange(null);
    setVessels([]);
  };

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
        {loading && (
          <Loader2 className="absolute right-6 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
        )}
        {search && (
          <button
            onClick={handleClear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 min-w-[300px] max-h-64 overflow-auto rounded-sm border border-border bg-popover shadow-md">
          {/* Vessel list */}
          {search.length < 2 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Type at least 2 characters to search...
            </div>
          ) : loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching vessels...
            </div>
          ) : vessels.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No vessels found</div>
          ) : (
            <div>
              {vessels.map((vessel) => (
                <button
                  key={vessel.id}
                  onClick={() => handleSelect(vessel)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground text-xs border-b border-border/50 last:border-0"
                >
                  <Ship className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{vessel.name}</div>
                    <div className="text-[10px] text-muted-foreground flex gap-2 flex-wrap">
                      <span className="text-primary/80">{vessel.type}</span>
                      {vessel.builtyear && <span>Built: {vessel.builtyear}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Add new vessel option */}
          <div className="px-2 py-1.5 border-t border-border bg-muted/30">
            <button
              onClick={() => {
                onChange(null);
                setIsOpen(false);
              }}
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
