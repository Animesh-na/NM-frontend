import { useState, useRef, useEffect } from "react";
import { Search, Ship } from "lucide-react";
import { vesselFleet, vesselTypes, type VesselData } from "@/data/vessels";
import { cn } from "@/lib/utils";

interface VesselSelectProps {
  value: string;
  onChange: (vessel: VesselData | null) => void;
  placeholder?: string;
  className?: string;
}

export function VesselSelect({ value, onChange, placeholder = "Search vessel...", className }: VesselSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [selectedType, setSelectedType] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredVessels = vesselFleet.filter(v => {
    const matchesSearch = !search || search.length < 2 || 
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.imo && v.imo.includes(search));
    const matchesType = !selectedType || v.type === selectedType;
    return matchesSearch && matchesType;
  });

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

  const handleSelect = (vessel: VesselData) => {
    setSearch(vessel.name);
    onChange(vessel);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSearch("");
    onChange(null);
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
              onClick={() => setSelectedType("")}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded-sm border",
                !selectedType 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-background border-border hover:bg-accent"
              )}
            >
              All
            </button>
            {vesselTypes.slice(0, 4).map(type => (
              <button
                key={type}
                onClick={() => setSelectedType(type === selectedType ? "" : type)}
                className={cn(
                  "px-2 py-0.5 text-[10px] rounded-sm border",
                  selectedType === type 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "bg-background border-border hover:bg-accent"
                )}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Vessel list */}
          {filteredVessels.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No vessels found</div>
          ) : (
            <div>
              {filteredVessels.map((vessel) => (
                <button
                  key={vessel.name}
                  onClick={() => handleSelect(vessel)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground text-xs border-b border-border/50 last:border-0"
                >
                  <Ship className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{vessel.name}</div>
                    <div className="text-[10px] text-muted-foreground flex gap-2">
                      <span>{vessel.type}</span>
                      <span>•</span>
                      <span>DWT: {vessel.dwt.toLocaleString()}</span>
                      {vessel.imo && (
                        <>
                          <span>•</span>
                          <span>IMO: {vessel.imo}</span>
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
