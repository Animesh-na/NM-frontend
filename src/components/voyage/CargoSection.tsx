import { ChevronDown, Package, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";

export function CargoSection() {
  const { 
    cargos = [], 
    addCargo, 
    removeCargo, 
    updateCargoEntry,
    hireRate,
    setHireRate,
    results,
    sequence
  } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);

  // Calculate cargo quantity from sequence load/discharge operations
  const sequenceCargoQuantity = sequence
    .filter(row => row.operation === "loading")
    .reduce((sum, row) => sum + (row.quantity || 0), 0);

  // Calculate Gross BB using sequence-derived quantity
  const grossBB = cargos.reduce((sum, cargo) => {
    const cargoQuantityShare = cargos.length > 1 
      ? sequenceCargoQuantity / cargos.length 
      : sequenceCargoQuantity;
    const cargoGrossFreight = cargo.rateType === "lumpsum" 
      ? cargo.rate 
      : cargo.rate * cargoQuantityShare;
    return sum + cargoGrossFreight + cargo.demurrageAmount - cargo.despatchAmount;
  }, 0);

  // Calculate Net BB (Gross BB minus commissions)
  const netBB = results.netFreight + cargos.reduce((sum, c) => sum + c.demurrageAmount - c.despatchAmount, 0);

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5" />
          <span>Cargo</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-1.5 space-y-1.5">
          {/* Top row: NTC, TC Comm, GTC, Net BB, Gross BB, Vessel cost */}
          <div className="grid grid-cols-12 gap-1.5 items-end text-[10px] border-b border-border pb-1.5">
            <div className="col-span-2">
              <label className="compact-label flex items-center">
                NTC
                <InfoTooltip 
                  formula="(Net Freight - Voyage Cost Excl Hire) / Total Days" 
                  description="Net Time Charter - calculated daily earning"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted"
                  value={results.ntce.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  readOnly
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div className="col-span-1">
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
                  value={cargos[0]?.tcCommission ?? 3.75}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    cargos.forEach(c => updateCargoEntry(c.id, "tcCommission", value));
                  }}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground mb-1 flex items-center">
                GTC
                <InfoTooltip 
                  formula="(Gross Freight - Voyage Cost) / Total Days" 
                  description="Gross Time Charter equivalent"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted"
                  value={results.gtce.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  readOnly
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground mb-1 flex items-center">
                Net BB
                <InfoTooltip 
                  formula="Net Freight + Demurrage - Despatch" 
                  description="Net Brokerage Balance after commissions"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted"
                  value={netBB.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  readOnly
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground mb-1 flex items-center">
                Gross BB
                <InfoTooltip 
                  formula="Gross Freight + Demurrage - Despatch" 
                  description="Gross Brokerage Balance before commissions"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted"
                  value={grossBB.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  readOnly
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground mb-1 flex items-center">
                Daily hire
                <InfoTooltip 
                  formula="Daily vessel hire rate" 
                  description="Used in P&L calculation"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right"
                  value={hireRate}
                  onChange={(e) => setHireRate(parseFloat(e.target.value) || 0)}
                />
                <span className="unit">($/d)</span>
              </div>
            </div>
            <div className="col-span-1" />
          </div>

          {/* Individual cargo entries (compact single-row format) */}
          {cargos.map((cargo, index) => (
            <CargoEntryRow 
              key={cargo.id} 
              cargo={cargo} 
              index={index}
              onUpdate={(field, value) => updateCargoEntry(cargo.id, field, value)}
              onRemove={() => removeCargo(cargo.id)}
              canRemove={cargos.length > 1}
              sequenceQuantity={cargos.length > 1 ? sequenceCargoQuantity / cargos.length : sequenceCargoQuantity}
            />
          ))}

          {/* Link to Charterer + buttons */}
          <div className="flex items-center gap-4 pt-1.5 border-t border-border">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs text-muted-foreground whitespace-nowrap">
                Link to Charterer
              </label>
              <select className="form-select text-xs flex-1 max-w-xs">
                <option value="">Select...</option>
                <option>ABC Shipping Co.</option>
                <option>Global Maritime Ltd</option>
              </select>
              <button className="text-muted-foreground hover:text-foreground text-xs px-1">×</button>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={addCargo}
                className="btn-secondary flex items-center gap-1 text-xs"
              >
                <Plus className="h-3 w-3" />
                Add cargo
              </button>
              <button 
                onClick={() => cargos.length > 1 && removeCargo(cargos[cargos.length - 1].id)}
                className="btn-outline flex items-center gap-1 text-xs"
                disabled={cargos.length <= 1}
              >
                <Trash2 className="h-3 w-3" />
                Rem cargo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual cargo entry row (compact AXS-style format)
interface CargoEntryRowProps {
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
    stowageFactor: number;
  };
  index: number;
  onUpdate: (field: string, value: number | string) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function CargoEntryRow({ cargo, index, onUpdate, sequenceQuantity }: CargoEntryRowProps & { sequenceQuantity: number }) {
  // Calculate this cargo's share of the sequence quantity
  const cargoQuantity = sequenceQuantity;
  
  return (
    <div className="grid grid-cols-12 gap-2 items-end text-xs">
      {/* Cargo number indicator */}
      <div className="col-span-1 flex items-center">
        <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-1 rounded">
          #{index + 1}
        </span>
      </div>

      {/* Rate with unit selector */}
      <div className="col-span-2">
        <label className="text-muted-foreground mb-1 block">Rate</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.1"
            className="form-input-sm w-16 font-mono text-right"
            value={cargo.rate}
            onChange={(e) => onUpdate("rate", parseFloat(e.target.value) || 0)}
          />
          <select 
            className="form-select text-xs h-6 w-16"
            value={cargo.rateType}
            onChange={(e) => onUpdate("rateType", e.target.value)}
          >
            <option value="mt">$/mt</option>
            <option value="lumpsum">Lump</option>
          </select>
        </div>
      </div>

      {/* Quantity from Sequence (read-only) */}
      <div className="col-span-2">
        <label className="text-muted-foreground mb-1 flex items-center">
          Qty (Seq)
          <InfoTooltip 
            formula="Sum of loading quantities from Sequence" 
            description="Auto-calculated from sequence load operations"
          />
        </label>
        <input
          type="text"
          className="form-input-sm w-full font-mono text-right bg-muted"
          value={cargoQuantity.toLocaleString()}
          readOnly
        />
      </div>

      {/* Gross Freight (calculated) */}
      <div className="col-span-2">
        <label className="text-muted-foreground mb-1 flex items-center">
          Gross Frt
          <InfoTooltip 
            formula="Rate × Qty (or Lumpsum)" 
            description="Calculated from rate and sequence quantity"
          />
        </label>
        <input
          type="text"
          className="form-input-sm w-full font-mono text-right bg-muted"
          value={(cargo.rateType === "lumpsum" ? cargo.rate : cargo.rate * cargoQuantity).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          readOnly
        />
      </div>

      {/* Voy Comm */}
      <div className="col-span-2">
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

      {/* Demurrage amount */}
      <div className="col-span-2">
        <label className="text-muted-foreground mb-1 flex items-center">
          Demurrage
          <InfoTooltip 
            formula="Demurrage Rate × Excess Days" 
            description="Penalty for exceeding laytime"
          />
        </label>
        <input
          type="number"
          className="form-input-sm w-full font-mono text-right"
          value={cargo.demurrageAmount}
          onChange={(e) => onUpdate("demurrageAmount", parseFloat(e.target.value) || 0)}
        />
      </div>

      {/* Despatch amount */}
      <div className="col-span-2">
        <label className="text-muted-foreground mb-1 flex items-center">
          Despatch
          <InfoTooltip 
            formula="Despatch Rate × Saved Days" 
            description="Bonus for faster port operations"
          />
        </label>
        <input
          type="number"
          className="form-input-sm w-full font-mono text-right"
          value={cargo.despatchAmount}
          onChange={(e) => onUpdate("despatchAmount", parseFloat(e.target.value) || 0)}
        />
      </div>

      {/* Average mode selector */}
      <div className="col-span-1">
        <label className="text-muted-foreground mb-1 block">Avg</label>
        <select 
          className="form-select text-xs h-6 w-full"
          value={cargo.averageMode}
          onChange={(e) => onUpdate("averageMode", e.target.value)}
        >
          <option value="average">average</option>
          <option value="per_port">port</option>
          <option value="per_voyage">voyage</option>
        </select>
      </div>

      {/* Stowage Factor */}
      <div className="col-span-2">
        <label className="text-muted-foreground mb-1 block">SF (m³/mt)</label>
        <input
          type="number"
          step="0.01"
          className="form-input-sm w-full font-mono text-right"
          value={cargo.stowageFactor || ""}
          onChange={(e) => onUpdate("stowageFactor", parseFloat(e.target.value) || 0)}
          placeholder="1.40"
          title="Stowage Factor - m³ per MT (used for draft restriction volume check)"
        />
      </div>
    </div>
  );
}
