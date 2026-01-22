import { useState, useRef, useEffect } from "react";
import { Search, MapPin } from "lucide-react";
import { searchPorts, popularPorts, type Port } from "@/data/ports";
import { cn } from "@/lib/utils";

interface PortSelectProps {
  value: string;
  onChange: (port: Port | null) => void;
  placeholder?: string;
  className?: string;
}

export function PortSelect({ value, onChange, placeholder = "Search port...", className }: PortSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [results, setResults] = useState<Port[]>(popularPorts);
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

  const handleSearch = (query: string) => {
    setSearch(query);
    if (query.length >= 2) {
      const found = searchPorts(query);
      setResults(found.length > 0 ? found : popularPorts);
    } else {
      setResults(popularPorts);
    }
  };

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
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="form-input-sm w-full pl-6 pr-6"
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
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-sm border border-border bg-popover shadow-md">
          {results.length === 0 ? (
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
                  key={port.unloc}
                  onClick={() => handleSelect(port)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground text-xs"
                >
                  <MapPin className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{port.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {port.country} • {port.unloc}
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
