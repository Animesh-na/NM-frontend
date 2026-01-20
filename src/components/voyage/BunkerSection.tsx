import { ChevronDown, Fuel } from "lucide-react";
import { useState } from "react";

interface BunkerData {
  co2Price: number;
  hsfo: { quantity: number; price: number };
  vlsfo: { quantity: number; price: number };
  lsmgo: { quantity: number; price: number };
}

const defaultBunker: BunkerData = {
  co2Price: 0,
  hsfo: { quantity: 0, price: 0 },
  vlsfo: { quantity: 1234, price: 450 },
  lsmgo: { quantity: 0, price: 750 },
};

export function BunkerSection() {
  const [bunker] = useState<BunkerData>(defaultBunker);
  const [isExpanded, setIsExpanded] = useState(true);

  const rewardFactor = 1.0;

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
                  type="text"
                  className="form-input w-20 font-mono text-right"
                  value={bunker.co2Price}
                  readOnly
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div className="flex items-end justify-end">
              <label className="text-xs text-muted-foreground mr-2">
                Reward factor for wind-assisted propulsion
              </label>
              <select className="form-select w-20">
                <option>1.00</option>
                <option>0.95</option>
                <option>0.90</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 text-xs">
            <div className="font-medium text-muted-foreground">BOB</div>
            <div>
              <label className="text-muted-foreground block mb-1">HSFO</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  className="form-input-sm w-16 font-mono text-right"
                  value={bunker.hsfo.quantity}
                  readOnly
                />
                <span className="text-muted-foreground">t @</span>
                <input
                  type="text"
                  className="form-input-sm w-16 font-mono text-right"
                  value={bunker.hsfo.price}
                  readOnly
                />
                <span className="text-muted-foreground">USD/t</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">VLSFO</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  className="form-input-sm w-16 font-mono text-right"
                  value={bunker.vlsfo.quantity}
                  readOnly
                />
                <span className="text-muted-foreground">t @</span>
                <input
                  type="text"
                  className="form-input-sm w-16 font-mono text-right"
                  value={bunker.vlsfo.price}
                  readOnly
                />
                <span className="text-muted-foreground">USD/t</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">LSMGO</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  className="form-input-sm w-16 font-mono text-right"
                  value={bunker.lsmgo.quantity}
                  readOnly
                />
                <span className="text-muted-foreground">t @</span>
                <input
                  type="text"
                  className="form-input-sm w-16 font-mono text-right"
                  value={bunker.lsmgo.price}
                  readOnly
                />
                <span className="text-muted-foreground">USD/t</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
