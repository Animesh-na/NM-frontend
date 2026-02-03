import { ChevronDown, Package, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";

export function CargoSection() {
  const { 
    cargos, 
    addCargo, 
    removeCargo, 
    updateCargoEntry,
    vesselCost,
    setVesselCost,
    results 
  } = useVoyageContext();
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
          <span className="text-xs text-muted-foreground ml-2">
            ({cargos.length} cargo{cargos.length !== 1 ? "es" : ""})
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3 space-y-4">
          {/* Global vessel cost row */}
          <div className="grid grid-cols-12 gap-2 items-end text-xs border-b border-border pb-3">
            <div className="col-span-2">
              <label className="text-muted-foreground mb-1 flex items-center">
                Vessel Cost
                <InfoTooltip 
                  formula="Daily vessel operating cost" 
                  description="Used in P&L calculation"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right"
                  value={vesselCost}
                  onChange={(e) => setVesselCost(parseFloat(e.target.value) || 0)}
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground mb-1 flex items-center">
                Total TCE
                <InfoTooltip 
                  formula="(Gross Freight - Voyage Cost Excl Hire) / Total Days" 
                  description="Combined Time Charter Equivalent"
                />
              </label>
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
              <label className="text-muted-foreground mb-1 flex items-center">
                Total NTCE
                <InfoTooltip 
                  formula="(Net Freight - Voyage Cost Excl Hire) / Total Days" 
                  description="Net Time Charter Equivalent"
                />
              </label>
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
            <div className="col-span-2">
              <label className="text-muted-foreground mb-1 flex items-center">
                Total P&L
                <InfoTooltip 
                  formula="Gross Profit - Hire Cost" 
                  description="Total voyage profit/loss"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className={`form-input-sm w-full font-mono text-right bg-muted ${results.pAndL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  value={results.pAndL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  readOnly
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground mb-1 flex items-center">
                P&L / Day
                <InfoTooltip 
                  formula="P&L / Total Days" 
                  description="Daily profit/loss"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className={`form-input-sm w-full font-mono text-right bg-muted ${results.pAndL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  value={(results.totalVoyageDays > 0 ? results.pAndL / results.totalVoyageDays : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  readOnly
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div className="col-span-2 flex justify-end">
              <button 
                onClick={addCargo}
                className="btn-secondary flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Add Cargo
              </button>
            </div>
          </div>

          {/* Individual cargo entries */}
          {cargos.map((cargo, index) => (
            <CargoEntry 
              key={cargo.id} 
              cargo={cargo} 
              index={index}
              onUpdate={(field, value) => updateCargoEntry(cargo.id, field, value)}
              onRemove={() => removeCargo(cargo.id)}
              canRemove={cargos.length > 1}
              totalVoyageDays={results.totalVoyageDays}
              voyageCostExclHire={results.voyageCostExclHire}
            />
          ))}

          {/* Freight summary */}
          <div className="border-t border-border pt-3">
            <div className="grid grid-cols-6 gap-2 text-xs">
              <div>
                <label className="text-muted-foreground mb-1 block">Total Gross Freight</label>
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
                <label className="text-muted-foreground mb-1 block">Total Net Freight</label>
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
                <label className="text-muted-foreground mb-1 block">Voyage Costs</label>
                <div className="input-with-unit">
                  <input
                    type="text"
                    className="form-input-sm w-full font-mono text-right bg-muted"
                    value={results.totalVoyageCosts.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    readOnly
                  />
                  <span className="unit">$</span>
                </div>
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block">Total Hire</label>
                <div className="input-with-unit">
                  <input
                    type="text"
                    className="form-input-sm w-full font-mono text-right bg-muted"
                    value={results.hireCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    readOnly
                  />
                  <span className="unit">$</span>
                </div>
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block">Gross Profit</label>
                <div className="input-with-unit">
                  <input
                    type="text"
                    className={`form-input-sm w-full font-mono text-right bg-muted ${results.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    value={results.grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    readOnly
                  />
                  <span className="unit">$</span>
                </div>
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block">Net Profit</label>
                <div className="input-with-unit">
                  <input
                    type="text"
                    className={`form-input-sm w-full font-mono text-right bg-muted ${results.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    value={results.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    readOnly
                  />
                  <span className="unit">$</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charterer link */}
          <div className="border-t border-border pt-3">
            <label className="text-xs text-muted-foreground mb-2 block">
              Link to Charterer
            </label>
            <select className="form-select w-64">
              <option value="">Select charterer...</option>
              <option>ABC Shipping Co.</option>
              <option>Global Maritime Ltd</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual cargo entry component
interface CargoEntryProps {
  cargo: {
    id: number;
    rate: number;
    rateType: "mt" | "lumpsum";
    quantity: number;
    voyageCommission: number;
    tcCommission: number;
    demurrageRate: number;
    despatchRate: number;
    demurrageAmount: number;
    despatchAmount: number;
    averageMode: "average" | "per_port" | "per_voyage";
    ntcBase: number;
    gtcTarget: number;
    netBBOverride?: number;
  };
  index: number;
  onUpdate: (field: string, value: number | string) => void;
  onRemove: () => void;
  canRemove: boolean;
  totalVoyageDays: number;
  voyageCostExclHire: number;
}

function CargoEntry({ cargo, index, onUpdate, onRemove, canRemove, totalVoyageDays, voyageCostExclHire }: CargoEntryProps) {
  // Calculate derived values
  const grossFreight = cargo.rateType === "lumpsum" 
    ? cargo.rate 
    : cargo.rate * cargo.quantity;
  
  const voyCommAmount = grossFreight * (cargo.voyageCommission / 100);
  const tcCommAmount = grossFreight * (cargo.tcCommission / 100);
  const netFreight = grossFreight - voyCommAmount - tcCommAmount;
  
  // Net BB calculation (can be overridden)
  const calculatedNetBB = netFreight + cargo.demurrageAmount - cargo.despatchAmount;
  const netBB = cargo.netBBOverride !== undefined ? cargo.netBBOverride : calculatedNetBB;
  
  // Individual cargo TCE (for this cargo only)
  const cargoTCE = totalVoyageDays > 0 ? (grossFreight - (voyageCostExclHire / Math.max(1, index + 1))) / totalVoyageDays : 0;
  const cargoNTCE = totalVoyageDays > 0 ? (netFreight - (voyageCostExclHire / Math.max(1, index + 1))) / totalVoyageDays : 0;

  return (
    <div className="border border-border rounded-md p-3 bg-muted/30">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded">
            Cargo #{index + 1}
          </span>
        </div>
        {canRemove && (
          <button 
            onClick={onRemove}
            className="text-destructive hover:text-destructive/80 p-1"
            title="Remove cargo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Row 1: Rate, Quantity, Commissions */}
      <div className="grid grid-cols-8 gap-2 items-end text-xs mb-2">
        <div className="col-span-2">
          <label className="text-muted-foreground mb-1 flex items-center">
            Rate
            <InfoTooltip 
              formula="Freight Rate" 
              description="Price per metric ton or lumpsum"
            />
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              className="form-input-sm w-20 font-mono text-right"
              value={cargo.rate}
              onChange={(e) => onUpdate("rate", parseFloat(e.target.value) || 0)}
            />
            <select 
              className="form-select text-xs h-6 w-20"
              value={cargo.rateType}
              onChange={(e) => onUpdate("rateType", e.target.value)}
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
              onChange={(e) => onUpdate("quantity", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">mt</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            Voy Comm
            <InfoTooltip 
              formula="Gross Freight × Voy Comm%" 
              description="Voyage Commission deducted from freight"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="number"
              step="0.25"
              className="form-input-sm w-full font-mono text-right"
              value={cargo.voyageCommission}
              onChange={(e) => onUpdate("voyageCommission", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">%</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            TC Comm
            <InfoTooltip 
              formula="Deducted from Net Freight" 
              description="Time Charter Commission percentage"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="number"
              step="0.25"
              className="form-input-sm w-full font-mono text-right"
              value={cargo.tcCommission}
              onChange={(e) => onUpdate("tcCommission", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">%</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            Gross Freight
            <InfoTooltip 
              formula="Rate × Quantity (or Lumpsum amount)" 
              description="Total freight before any deductions"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="text"
              className="form-input-sm w-full font-mono text-right bg-muted"
              value={grossFreight.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              readOnly
            />
            <span className="unit">$</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            Net Freight
            <InfoTooltip 
              formula="Gross Freight × (1 - Voy Comm% - TC Comm%)" 
              description="Freight after all commission deductions"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="text"
              className="form-input-sm w-full font-mono text-right bg-muted"
              value={netFreight.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              readOnly
            />
            <span className="unit">$</span>
          </div>
        </div>
      </div>

      {/* Row 2: NTC, GTC, Net BB, Demurrage/Despatch */}
      <div className="grid grid-cols-8 gap-2 items-end text-xs mb-2">
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            NTC Base
            <InfoTooltip 
              formula="Input: Benchmark rate" 
              description="Net Time Charter baseline for comparison"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={cargo.ntcBase}
              onChange={(e) => onUpdate("ntcBase", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">$/d</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            GTC Target
            <InfoTooltip 
              formula="Input: Target rate" 
              description="Gross Time Charter target"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={cargo.gtcTarget}
              onChange={(e) => onUpdate("gtcTarget", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">$/d</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            Net BB
            <InfoTooltip 
              formula="Net Freight + Demurrage - Despatch" 
              description="Net Brokerage Balance (editable override)"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={netBB}
              onChange={(e) => onUpdate("netBBOverride", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">$</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            Demurrage
            <InfoTooltip 
              formula="Daily penalty rate" 
              description="Rate applied when port time exceeds laytime"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={cargo.demurrageRate}
              onChange={(e) => onUpdate("demurrageRate", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">$/d</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            Dem Amt
            <InfoTooltip 
              formula="Demurrage Rate × Excess Days" 
              description="Total demurrage amount"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={cargo.demurrageAmount}
              onChange={(e) => onUpdate("demurrageAmount", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">$</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            Despatch
            <InfoTooltip 
              formula="Daily bonus rate" 
              description="Rate applied when port time is faster"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={cargo.despatchRate}
              onChange={(e) => onUpdate("despatchRate", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">$/d</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            Des Amt
            <InfoTooltip 
              formula="Despatch Rate × Saved Days" 
              description="Total despatch amount"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={cargo.despatchAmount}
              onChange={(e) => onUpdate("despatchAmount", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">$</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block">Average</label>
          <select 
            className="form-select text-xs h-6 w-full"
            value={cargo.averageMode}
            onChange={(e) => onUpdate("averageMode", e.target.value)}
          >
            <option value="average">Average</option>
            <option value="per_port">Per Port</option>
            <option value="per_voyage">Per Voyage</option>
          </select>
        </div>
      </div>

      {/* Row 3: Calculated TCE/NTCE for this cargo */}
      <div className="grid grid-cols-8 gap-2 items-end text-xs pt-2 border-t border-border/50">
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            TCE
            <InfoTooltip 
              formula="(Gross Freight - Voyage Cost) / Total Days" 
              description="Time Charter Equivalent for this cargo"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="text"
              className="form-input-sm w-full font-mono text-right bg-muted"
              value={cargoTCE.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              readOnly
            />
            <span className="unit">$/d</span>
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 flex items-center">
            NTCE
            <InfoTooltip 
              formula="(Net Freight - Voyage Cost) / Total Days" 
              description="Net Time Charter Equivalent for this cargo"
            />
          </label>
          <div className="input-with-unit">
            <input
              type="text"
              className="form-input-sm w-full font-mono text-right bg-muted"
              value={cargoNTCE.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              readOnly
            />
            <span className="unit">$/d</span>
          </div>
        </div>
        <div className="col-span-6">
          <div className="text-[10px] text-muted-foreground">
            Commission: ${voyCommAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} (Voy) + ${tcCommAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} (TC)
          </div>
        </div>
      </div>
    </div>
  );
}
