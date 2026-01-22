import { ChevronDown, Fuel } from "lucide-react";
import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";

export function BunkerSection() {
  const { bunker, updateBunker, setBunker, results } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Fuel className="h-4 w-4" />
          <span>Bunker</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                CO2 Price
              </label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input w-20 font-mono text-right"
                  value={bunker.co2Price}
                  onChange={(e) => setBunker(prev => ({ ...prev, co2Price: parseFloat(e.target.value) || 0 }))}
                />
                <span className="unit">$/t</span>
              </div>
            </div>
            <div className="flex items-end justify-end">
              <div className="text-xs">
                <span className="text-muted-foreground mr-2">Total Bunker Cost:</span>
                <span className="font-mono font-semibold text-primary">
                  ${results.totalBunkerCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 text-xs">
            <div className="font-medium text-muted-foreground">Fuel Type</div>
            <div className="font-medium text-muted-foreground text-center">Price ($/t)</div>
            <div className="font-medium text-muted-foreground text-center">ROB Start (t)</div>
            <div className="font-medium text-muted-foreground text-center">Consumption (t)</div>
          </div>

          {/* HSFO */}
          <div className="grid grid-cols-4 gap-3 text-xs items-center">
            <div className="font-medium">HSFO</div>
            <div>
              <input
                type="number"
                className="form-input-sm w-full font-mono text-right"
                value={bunker.hsfo.price || ""}
                onChange={(e) => updateBunker("hsfo", "price", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <input
                type="number"
                className="form-input-sm w-full font-mono text-right"
                value={bunker.hsfo.robStart || ""}
                onChange={(e) => updateBunker("hsfo", "robStart", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="font-mono text-right bg-muted px-2 py-1 rounded">
              {results.hsfoConsumption.toFixed(2)}
            </div>
          </div>

          {/* VLSFO */}
          <div className="grid grid-cols-4 gap-3 text-xs items-center">
            <div className="font-medium">VLSFO</div>
            <div>
              <input
                type="number"
                className="form-input-sm w-full font-mono text-right"
                value={bunker.vlsfo.price || ""}
                onChange={(e) => updateBunker("vlsfo", "price", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <input
                type="number"
                className="form-input-sm w-full font-mono text-right"
                value={bunker.vlsfo.robStart || ""}
                onChange={(e) => updateBunker("vlsfo", "robStart", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="font-mono text-right bg-muted px-2 py-1 rounded">
              {results.vlsfoConsumption.toFixed(2)}
            </div>
          </div>

          {/* LSMGO */}
          <div className="grid grid-cols-4 gap-3 text-xs items-center">
            <div className="font-medium">LSMGO</div>
            <div>
              <input
                type="number"
                className="form-input-sm w-full font-mono text-right"
                value={bunker.lsmgo.price || ""}
                onChange={(e) => updateBunker("lsmgo", "price", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <input
                type="number"
                className="form-input-sm w-full font-mono text-right"
                value={bunker.lsmgo.robStart || ""}
                onChange={(e) => updateBunker("lsmgo", "robStart", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="font-mono text-right bg-muted px-2 py-1 rounded">
              {results.lsmgoConsumption.toFixed(2)}
            </div>
          </div>

          {/* CO2 Summary */}
          <div className="border-t border-border pt-2 mt-2">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Total CO₂:</span>
                <span className="font-mono ml-2">{results.totalCo2.toFixed(2)} t</span>
              </div>
              <div>
                <span className="text-muted-foreground">Laden:</span>
                <span className="font-mono ml-2">{results.co2Laden.toFixed(2)} t</span>
              </div>
              <div>
                <span className="text-muted-foreground">Ballast:</span>
                <span className="font-mono ml-2">{results.co2Ballast.toFixed(2)} t</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
