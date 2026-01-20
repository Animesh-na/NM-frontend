import { ChevronDown, Package, Plus, Minus } from "lucide-react";
import { useState } from "react";

interface CargoData {
  ntc: number;
  tcComm: number;
  gtc: string;
  rate: number;
  rateUnit: string;
  lumpsum: number;
  voyComm: number;
  netBb: number;
  grossBb: number;
  vesselCost: number;
}

const defaultCargo: CargoData = {
  ntc: 8542.19,
  tcComm: 3.75,
  gtc: "GTC",
  rate: 13,
  rateUnit: "$/mt",
  lumpsum: 0,
  voyComm: 2.5,
  netBb: 0,
  grossBb: 0,
  vesselCost: 8542.19,
};

export function CargoSection() {
  const [cargo] = useState<CargoData>(defaultCargo);
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          <span>Cargo</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-8 gap-2 items-end text-xs">
            <div>
              <label className="text-muted-foreground block mb-1">NTC</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.ntc.toLocaleString()}
                  readOnly
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">TC Comm</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.tcComm}
                  readOnly
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">GTC</label>
              <input
                type="text"
                className="form-input-sm w-full"
                value={cargo.gtc}
                readOnly
              />
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground block mb-1">Rate</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  className="form-input-sm w-16 font-mono text-right"
                  value={cargo.rate}
                  readOnly
                />
                <select className="form-select text-xs h-6 w-16">
                  <option>$/mt</option>
                  <option>$/d</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Lumpsum</label>
              <input
                type="text"
                className="form-input-sm w-full font-mono text-right"
                value={cargo.lumpsum}
                readOnly
              />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Voy Comm</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.voyComm}
                  readOnly
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div></div>
          </div>

          <div className="grid grid-cols-8 gap-2 items-end text-xs">
            <div>
              <label className="text-muted-foreground block mb-1">Net BB</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.netBb}
                  readOnly
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Gross BB</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.grossBb}
                  readOnly
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div></div>
            <div>
              <label className="text-muted-foreground block mb-1">Vessel cost</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.vesselCost.toLocaleString()}
                  readOnly
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground block mb-1">Demurrage</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right"
                  value={0}
                  readOnly
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground block mb-1">Despatch</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  className="form-input-sm w-16 font-mono text-right"
                  value={0}
                  readOnly
                />
                <select className="form-select text-xs h-6">
                  <option>average</option>
                  <option>all time</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <label className="text-xs text-muted-foreground mb-2 block">
              Link to Charterer
            </label>
            <div className="flex gap-2">
              <select className="form-select flex-1">
                <option value="">Select charterer...</option>
                <option>ABC Shipping Co.</option>
                <option>Global Maritime Ltd</option>
              </select>
              <button className="btn-secondary flex items-center gap-1">
                <Plus className="h-3 w-3" />
                Add cargo
              </button>
              <button className="btn-secondary flex items-center gap-1">
                <Minus className="h-3 w-3" />
                Rem cargo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
