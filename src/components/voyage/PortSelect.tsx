import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Update dropdown position when open
  const updatePosition = useCallback(() => {
    if (containerRef.current && isOpen) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    updatePosition();
    if (isOpen) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside both container and portal dropdown
      if (containerRef.current && !containerRef.current.contains(target)) {
        const portalDropdown = document.getElementById('port-select-dropdown');
        if (!portalDropdown || !portalDropdown.contains(target)) {
          setIsOpen(false);
        }
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

  const dropdownContent = (
    <div 
      id="port-select-dropdown"
      className="fixed max-h-60 overflow-auto rounded-sm border border-border bg-popover shadow-lg"
      style={{ 
        top: dropdownPosition.top, 
        left: dropdownPosition.left, 
        width: dropdownPosition.width,
        zIndex: 99999,
      }}
    >
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
  );

  return (
    <div className={cn("relative", className)} ref={containerRef} style={{ overflow: 'visible' }}>
      <div className="relative" style={{ overflow: 'visible' }}>
        <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => {
            setIsOpen(true);
            // Force position update after focus
            setTimeout(updatePosition, 10);
          }}
          onClick={() => {
            setIsOpen(true);
            setTimeout(updatePosition, 10);
          }}
          placeholder={placeholder}
          className="form-input-sm w-full pl-6 pr-6"
        />
        {loading && (
          <Loader2 className="absolute right-6 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground pointer-events-none" />
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

      {isOpen && createPortal(dropdownContent, document.body)}
    </div>
  );
}
