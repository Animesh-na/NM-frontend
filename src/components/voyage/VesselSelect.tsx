import { useState, useRef, useEffect } from "react";
import { Search, Ship, Loader2 } from "lucide-react";
import { type VesselData, defaultVessel } from "@/data/vessels";
import { cn } from "@/lib/utils";
import { getVesselTypes, searchVessels, type VesselType, type MarineVessel } from "@/services/marineApi";

interface VesselSelectProps {
  value: string;
  onChange: (vessel: VesselData | null) => void;
  placeholder?: string;
  className?: string;
}

// Helper to estimate consumption based on DWT
function estimateConsumption(dwt: number): VesselData["consumption"] {
  if (dwt >= 200000) {
    return {
      speed: { ecoBallast: 11.5, ecoLaden: 11.0, canal: 0 },
      hsfo: { ecoBallast: 35, ecoLaden: 38, canal: 6 },
      vlsfo: { ecoBallast: 42, ecoLaden: 45, canal: 6 },
      lsmgo: { ecoBallast: 35, ecoLaden: 35, canal: 6 },
      ae: { ecoBallast: 0.25, ecoLaden: 0.25, canal: 0.4 },
      aeScrubber: { ecoBallast: 0.4, ecoLaden: 0.4, canal: 0.4 },
    };
  } else if (dwt >= 100000) {
    return {
      speed: { ecoBallast: 12.0, ecoLaden: 11.5, canal: 0 },
      hsfo: { ecoBallast: 32, ecoLaden: 35, canal: 5 },
      vlsfo: { ecoBallast: 38, ecoLaden: 42, canal: 5 },
      lsmgo: { ecoBallast: 32, ecoLaden: 32, canal: 5 },
      ae: { ecoBallast: 0.22, ecoLaden: 0.22, canal: 0.35 },
      aeScrubber: { ecoBallast: 0.35, ecoLaden: 0.35, canal: 0.35 },
    };
  } else if (dwt >= 60000) {
    return {
      speed: { ecoBallast: 12.5, ecoLaden: 12.0, canal: 0 },
      hsfo: { ecoBallast: 28, ecoLaden: 30, canal: 4.5 },
      vlsfo: { ecoBallast: 34, ecoLaden: 36, canal: 4.5 },
      lsmgo: { ecoBallast: 28, ecoLaden: 28, canal: 4.5 },
      ae: { ecoBallast: 0.2, ecoLaden: 0.2, canal: 0.32 },
      aeScrubber: { ecoBallast: 0.32, ecoLaden: 0.32, canal: 0.32 },
    };
  } else if (dwt >= 40000) {
    return {
      speed: { ecoBallast: 13.0, ecoLaden: 12.5, canal: 0 },
      hsfo: { ecoBallast: 22, ecoLaden: 24, canal: 3.5 },
      vlsfo: { ecoBallast: 28, ecoLaden: 30, canal: 3.5 },
      lsmgo: { ecoBallast: 22, ecoLaden: 22, canal: 3.5 },
      ae: { ecoBallast: 0.18, ecoLaden: 0.18, canal: 0.28 },
      aeScrubber: { ecoBallast: 0.28, ecoLaden: 0.28, canal: 0.28 },
    };
  } else if (dwt >= 25000) {
    return {
      speed: { ecoBallast: 13.5, ecoLaden: 13.0, canal: 0 },
      hsfo: { ecoBallast: 18, ecoLaden: 20, canal: 3 },
      vlsfo: { ecoBallast: 22, ecoLaden: 24, canal: 3 },
      lsmgo: { ecoBallast: 18, ecoLaden: 18, canal: 3 },
      ae: { ecoBallast: 0.15, ecoLaden: 0.15, canal: 0.25 },
      aeScrubber: { ecoBallast: 0.25, ecoLaden: 0.25, canal: 0.25 },
    };
  } else {
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

// Helper to estimate TPC from DWT
function estimateTpc(dwt: number): number {
  if (dwt >= 200000) return 95;
  if (dwt >= 100000) return 80;
  if (dwt >= 60000) return 68;
  if (dwt >= 40000) return 58;
  if (dwt >= 25000) return 50;
  return 42;
}

// Convert API vessel to VesselData
function marineVesselToVesselData(vessel: MarineVessel): VesselData {
  return {
    name: vessel.name,
    type: vessel.type || "Bulk Carrier",
    imo: vessel.imo || "",
    dwt: vessel.dwt || 0,
    gt: vessel.gt || 0,
    cubic: vessel.capacitycuft || 0,
    draft: vessel.draught || 0,
    tpcTpi: estimateTpc(vessel.dwt || 0),
    hsfoScrubbers: "N",
    builtYear: vessel.builtyear,
    builder: vessel.builder,
    owner: vessel.owner,
    loa: vessel.loa,
    beam: vessel.beam,
    consumption: estimateConsumption(vessel.dwt || 0),
  };
}

export function VesselSelect({ value, onChange, placeholder = "Search vessel...", className }: VesselSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [vesselTypes, setVesselTypes] = useState<VesselType[]>([]);
  const [vessels, setVessels] = useState<MarineVessel[]>([]);
  const [loading, setLoading] = useState(false);
  const [typesLoading, setTypesLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load vessel types on mount
  useEffect(() => {
    const loadVesselTypes = async () => {
      setTypesLoading(true);
      try {
        const types = await getVesselTypes();
        setVesselTypes(types);
      } catch (error) {
        console.error("Failed to load vessel types:", error);
      } finally {
        setTypesLoading(false);
      }
    };
    loadVesselTypes();
  }, []);

  // Search vessels when query changes
  useEffect(() => {
    if (search.length < 2) {
      setVessels([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchVessels(search, selectedType || undefined, 10);
        setVessels(results);
      } catch (error) {
        console.error("Failed to search vessels:", error);
        setVessels([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [search, selectedType]);

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
          className="form-input w-full pl-6 pr-6"
        />
        {loading && (
          <Loader2 className="absolute right-6 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
        )}
        {search && (
          <button
            onClick={handleClear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 min-w-[280px] max-h-72 overflow-auto rounded-sm border border-border bg-popover shadow-md">
          {/* Type filter */}
          <div className="px-2 py-1.5 border-b border-border bg-muted/50 flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedType(null)}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded-sm border",
                selectedType === null 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-background border-border hover:bg-accent"
              )}
            >
              All Types
            </button>
            {typesLoading ? (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-2 w-2 animate-spin" /> Loading...
              </span>
            ) : (
              vesselTypes.slice(0, 5).map(type => (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id === selectedType ? null : type.id)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] rounded-sm border",
                    selectedType === type.id 
                      ? "bg-primary text-primary-foreground border-primary" 
                      : "bg-background border-border hover:bg-accent"
                  )}
                >
                  {type.name}
                </button>
              ))
            )}
          </div>

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
                      <span>•</span>
                      <span>DWT: {vessel.dwt?.toLocaleString()}</span>
                      <span>•</span>
                      <span>GT: {vessel.gt?.toLocaleString()}</span>
                      {vessel.builtyear && (
                        <>
                          <span>•</span>
                          <span>Built: {vessel.builtyear}</span>
                        </>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 flex gap-2 flex-wrap mt-0.5">
                      {vessel.owner && <span>Owner: {vessel.owner}</span>}
                      {vessel.loa && (
                        <>
                          <span>•</span>
                          <span>LOA: {vessel.loa}m</span>
                        </>
                      )}
                      {vessel.beam && (
                        <>
                          <span>•</span>
                          <span>Beam: {vessel.beam}m</span>
                        </>
                      )}
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
