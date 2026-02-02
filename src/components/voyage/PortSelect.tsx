import { useState, useRef, useEffect } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchPorts as searchMarinePorts, type MarinePort } from "@/services/marineApi";

// Extended Port interface to include coordinates from API
export interface Port {
  id: number;
  unloc: string;
  name: string;
  city: string;
  country: string;
  coordinates?: [number, number];
}

interface PortSelectProps {
  value: string;
  onChange: (port: Port | null) => void;
  placeholder?: string;
  className?: string;
}

// Convert MarinePort to Port interface
function marinePortToPort(port: MarinePort): Port {
  return {
    id: port.id,
    unloc: port.port_code,
    name: port.port_name,
    city: port.port_name,
    country: port.country,
    coordinates: [port.longitude, port.latitude],
  };
}

// Popular ports for initial display (hardcoded fallback)
const popularPorts: Port[] = [
  { id: 1, unloc: 'SGSIN', name: 'Singapore', city: 'Singapore', country: 'Singapore' },
  { id: 2, unloc: 'CNSHA', name: 'Shanghai', city: 'Shanghai', country: 'China' },
  { id: 3, unloc: 'AEDXB', name: 'Dubai', city: 'Dubai', country: 'United Arab Emirates' },
  { id: 4, unloc: 'NLRTM', name: 'Rotterdam', city: 'Rotterdam', country: 'Netherlands' },
  { id: 5, unloc: 'USHOU', name: 'Houston', city: 'Houston', country: 'United States' },
];

export function PortSelect({ value, onChange, placeholder = "Search port...", className }: PortSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [results, setResults] = useState<Port[]>(popularPorts);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Search ports when query changes
  useEffect(() => {
    if (search.length < 2) {
      setResults(popularPorts);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setLoading(true);
      try {
        const marinePorts = await searchMarinePorts(search, 15);
        if (marinePorts.length > 0) {
          setResults(marinePorts.map(marinePortToPort));
        } else {
          setResults([]);
        }
      } catch (error) {
        console.error("Failed to search ports:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [search]);

  const handleSelect = (port: Port) => {
    setSearch(port.name);
    onChange(port);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSearch("");
    onChange(null);
    setResults(popularPorts);
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
          className="form-input-sm w-full pl-6 pr-6"
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
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-sm border border-border bg-popover shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching ports...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No ports found</div>
          ) : (
            <div>
              {search.length < 2 && (
                <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/50 border-b border-border">
                  Popular Ports
                </div>
              )}
              {results.map((port) => (
                <button
                  key={`${port.id}-${port.unloc}`}
                  onClick={() => handleSelect(port)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground text-xs"
                >
                  <MapPin className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{port.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {port.country} • {port.unloc}
                      {port.coordinates && (
                        <span className="ml-1 opacity-60">
                          ({port.coordinates[1].toFixed(2)}, {port.coordinates[0].toFixed(2)})
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
