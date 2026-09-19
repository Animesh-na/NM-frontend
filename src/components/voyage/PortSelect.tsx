import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchPorts as searchMarinePorts, type MarinePort } from "@/services/marineApi";
import { isPortEuEea } from "@/utils/euCountries";
import { logger } from "@/services/logger";

// Extended Port interface to include coordinates from API
export interface Port {
  id: number;
  unloc: string;
  name: string;
  city: string;
  country: string;
  coordinates?: [number, number];
  isEuEea?: boolean;
  ecaZone?: boolean;
  ukEts?: boolean;
  ukZone?: "gb" | "ni" | null;
}

interface PortSelectProps {
  value: string;
  onChange: (port: Port | null) => void;
  placeholder?: string;
  className?: string;
}

// Convert MarinePort to Port interface
function marinePortToPort(port: MarinePort): Port {
  // Treat "NaN", empty, or whitespace-only port_code as missing
  const rawCode = port.port_code?.trim();
  const validCode = rawCode && rawCode !== "NaN" && rawCode !== "0"
    ? rawCode
    : undefined;

  return {
    id: port.id,
    unloc: validCode || `COORD-${port.latitude.toFixed(4)},${port.longitude.toFixed(4)}`,
    name: port.port_name,
    city: port.port_name,
    country: port.country,
    coordinates: [port.longitude, port.latitude],
    // EU ETS: strictly use the API's eu_zone flag. Fall back to legacy is_eu_eea
    // only when eu_zone is absent (older API responses). Never infer from country.
    isEuEea: port.eu_zone === true || (port.eu_zone === undefined && port.is_eu_eea === true),
    ecaZone: port.eca_zone === true,
    ukEts: port.uk_ets === true,
    ukZone: port.uk_zone ?? null,
  };
}


export function PortSelect({ value, onChange, placeholder = "Search port...", className }: PortSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [results, setResults] = useState<Port[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Update dropdown position when open - use viewport-relative positioning
  const updatePosition = useCallback(() => {
    if (containerRef.current && isOpen) {
      const rect = containerRef.current.getBoundingClientRect();
      // Use fixed positioning relative to viewport, not document
      setDropdownPosition({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 250), // Minimum width of 250px
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Immediate update
      updatePosition();
      // Delayed update to catch any layout shifts
      const timer = setTimeout(updatePosition, 50);
      
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside both container and dropdown
      if (containerRef.current && !containerRef.current.contains(target)) {
        if (dropdownRef.current && !dropdownRef.current.contains(target)) {
          setIsOpen(false);
        }
      }
    };

    if (isOpen) {
      // Use capture phase to catch events before they bubble
      document.addEventListener("mousedown", handleClickOutside, true);
      return () => document.removeEventListener("mousedown", handleClickOutside, true);
    }
  }, [isOpen]);

  // Search ports when query changes
  useEffect(() => {
    if (search.length < 2) {
      setResults([]);
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
    logger.info(`Port selected: ${port.name}`, {
      component: "PortSelect",
      port_id: port.id,
      port_name: port.name,
      country: port.country,
      unloc: port.unloc,
      eca_zone: port.ecaZone,
      is_eu_eea: port.isEuEea,
    });
  };

  const handleClear = () => {
    setSearch("");
    onChange(null);
    setResults([]);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    // Multiple position updates to handle layout timing
    requestAnimationFrame(updatePosition);
    setTimeout(updatePosition, 100);
  };

  const dropdownContent = isOpen ? (
    <div 
      ref={dropdownRef}
      className="max-h-72 overflow-auto rounded border border-border bg-popover text-popover-foreground shadow-2xl"
      style={{ 
        position: 'fixed',
        top: `${dropdownPosition.top}px`, 
        left: `${dropdownPosition.left}px`, 
        width: `${dropdownPosition.width}px`,
        zIndex: 2147483647, // Max z-index value
        isolation: 'isolate',
        pointerEvents: 'auto',
      }}
    >
      {results.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          {search.length < 2 ? "Type at least 2 characters to search" : "No ports found"}
        </div>
      ) : (
        <div className="py-1">
          {results.map((port) => (
            <button
              key={`${port.id}-${port.unloc}`}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(port);
              }}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground text-xs cursor-pointer transition-colors"
            >
              <MapPin className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{port.name} ({port.country})</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {port.unloc}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={handleInputFocus}
          onClick={handleInputFocus}
          placeholder={placeholder}
          title={search || placeholder}
          className="form-input-sm h-7 w-full min-w-0 truncate pl-4 pr-4 text-[10px]"
          autoComplete="off"
        />
        {search && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClear();
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm font-medium"
          >
            ×
          </button>
        )}
      </div>

      {createPortal(dropdownContent, document.body)}
    </div>
  );
}
