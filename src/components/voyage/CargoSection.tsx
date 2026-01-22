import { ChevronDown, Package, Plus, Minus } from "lucide-react";
import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";

export function CargoSection() {
  const { cargo, updateCargo, hireRate, setHireRate, results } = useVoyageContext();
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
              <label className="text-muted-foreground block mb-1">NTC (calc)</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted"
                  value={results.ntce.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  readOnly
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">TC Comm</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  step="0.25"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.tcCommission}
                  onChange={(e) => updateCargo("tcCommission", parseFloat(e.target.value) || 0)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">GTC (calc)</label>
              <input
                type="text"
                className="form-input-sm w-full font-mono text-right bg-muted"
                value={results.gtce.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                readOnly
              />
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground block mb-1">Rate</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  className="form-input-sm w-16 font-mono text-right"
                  value={cargo.rate}
                  onChange={(e) => updateCargo("rate", parseFloat(e.target.value) || 0)}
                />
                <select 
                  className="form-select text-xs h-6 w-20"
                  value={cargo.rateType}
                  onChange={(e) => updateCargo("rateType", e.target.value)}
                >
                  <option value="mt">$/mt</option>
                  <option value="lumpsum">Lumpsum</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Quantity</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.quantity}
                  onChange={(e) => updateCargo("quantity", parseFloat(e.target.value) || 0)}
                />
                <span className="unit">mt</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Voy Comm</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  step="0.25"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.voyageCommission}
                  onChange={(e) => updateCargo("voyageCommission", parseFloat(e.target.value) || 0)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div></div>
          </div>

          <div className="grid grid-cols-8 gap-2 items-end text-xs">
            <div>
              <label className="text-muted-foreground block mb-1">Hire Rate</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right"
                  value={hireRate}
                  onChange={(e) => setHireRate(parseFloat(e.target.value) || 0)}
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Gross Freight</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted"
                  value={results.grossFreight.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  readOnly
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Net Freight</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted"
                  value={results.netFreight.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  readOnly
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">TCE</label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted"
                  value={results.tce.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  readOnly
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground block mb-1">Demurrage</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.demurrage}
                  onChange={(e) => updateCargo("demurrage", parseFloat(e.target.value) || 0)}
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground block mb-1">Despatch</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right"
                  value={cargo.despatch}
                  onChange={(e) => updateCargo("despatch", parseFloat(e.target.value) || 0)}
                />
                <span className="unit">$</span>
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
