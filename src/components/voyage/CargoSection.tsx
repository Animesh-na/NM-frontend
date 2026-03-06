import { ChevronDown, Package, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";

export function CargoSection() {
  const { 
    cargos = [], addCargo, removeCargo, updateCargoEntry,
    hireRate, setHireRate, results, sequence
  } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);
  const [netBB, setNetBB] = useState<number>(0);

  const sequenceCargoQuantity = sequence
    .filter(row => row.operation === "loading")
    .reduce((sum, row) => sum + (row.quantity || 0), 0);

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          <span>Cargo</span>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
      </button>

      {isExpanded && (
        <div className="px-2 py-1 space-y-1">
          {/* Top summary fields */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="form-field w-28">
              <label className="form-label flex items-center gap-1">
                NTC
                <InfoTooltip formula="(Net Freight - Voyage Cost Excl Hire) / Total Days" description="Net Time Charter" />
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted/30"
                  value={results.ntce.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  readOnly
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div className="form-field w-20">
              <label className="form-label flex items-center gap-1">
                TC Comm
                <InfoTooltip formula="Deducted from Net Freight" description="Time Charter Commission %" />
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
            <div className="form-field w-28">
              <label className="form-label flex items-center gap-1">
                GTC
                <InfoTooltip formula="(Gross Freight - Voyage Cost) / Total Days" description="Gross Time Charter equivalent" />
              </label>
              <div className="input-with-unit">
                <input
                  type="text"
                  className="form-input-sm w-full font-mono text-right bg-muted/30"
                  value={results.gtce.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  readOnly
                />
                <span className="unit">$/d</span>
              </div>
            </div>
            <div className="form-field w-28">
              <label className="form-label flex items-center gap-1">
                Net BB
                <InfoTooltip formula="Net Ballast Bonus (lumpsum added to hire cost)" description="Net Ballast Bonus" />
              </label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right"
                  value={netBB}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setNetBB(isNaN(val) ? 0 : val);
                  }}
                />
                <span className="unit">$</span>
              </div>
            </div>
            <div className="form-field w-28">
              <label className="form-label flex items-center gap-1">
                Daily Hire
                <InfoTooltip formula="Daily vessel hire rate" description="Used in P&L calculation" />
              </label>
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
          </div>

          {/* Cargo entries */}
          {cargos.map((cargo, index) => (
            <CargoEntryCard 
              key={cargo.id} 
              cargo={cargo} 
              index={index}
              onUpdate={(field, value) => updateCargoEntry(cargo.id, field, value)}
              onRemove={() => removeCargo(cargo.id)}
              canRemove={cargos.length > 1}
              sequenceQuantity={cargos.length > 1 ? sequenceCargoQuantity / cargos.length : sequenceCargoQuantity}
            />
          ))}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Link to Charterer</label>
              <select className="form-select-sm flex-1 max-w-xs">
                <option value="">Select...</option>
                <option>ABC Shipping Co.</option>
                <option>Global Maritime Ltd</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={addCargo} className="btn-secondary flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Cargo
              </button>
              <button 
                onClick={() => cargos.length > 1 && removeCargo(cargos[cargos.length - 1].id)}
                className="btn-secondary flex items-center gap-1.5"
                disabled={cargos.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cargo Entry Card ──────────────────────────────────────────────

interface CargoEntryCardProps {
  cargo: {
    id: number; rate: number; rateType: "mt" | "lumpsum"; quantity: number;
    voyageCommission: number; tcCommission: number; demurrageRate: number; despatchRate: number;
    demurrageAmount: number; despatchAmount: number; averageMode: "average" | "per_port" | "per_voyage";
    ntcBase: number; gtcTarget: number; netBBOverride?: number; stowageFactor: number;
  };
  index: number;
  onUpdate: (field: string, value: number | string) => void;
  onRemove: () => void;
  canRemove: boolean;
  sequenceQuantity: number;
}

function CargoEntryCard({ cargo, index, onUpdate, sequenceQuantity }: CargoEntryCardProps & { sequenceQuantity: number }) {
  const cargoQuantity = sequenceQuantity;
  
  return (
    <div className="border border-border rounded p-2 bg-input-bg">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
          #{index + 1}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="form-field w-28">
          <label className="form-label">Rate</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              className="form-input-sm flex-1 font-mono text-right"
              value={cargo.rate}
              onChange={(e) => onUpdate("rate", parseFloat(e.target.value) || 0)}
            />
            <select 
              className="form-select-sm w-16"
              value={cargo.rateType}
              onChange={(e) => onUpdate("rateType", e.target.value)}
            >
              <option value="mt">$/mt</option>
              <option value="lumpsum">Lump</option>
            </select>
          </div>
        </div>

        <div className="form-field w-28">
          <label className="form-label flex items-center gap-1">
            Qty (Seq)
            <InfoTooltip formula="Sum of loading quantities from Sequence" description="Auto-calculated" />
          </label>
          <input
            type="text"
            className="form-input-sm w-full font-mono text-right bg-muted/30"
            value={cargoQuantity.toLocaleString()}
            readOnly
          />
        </div>

        <div className="form-field w-32">
          <label className="form-label flex items-center gap-1">
            Gross Freight
            <InfoTooltip formula="Rate × Qty (or Lumpsum)" description="Calculated" />
          </label>
          <input
            type="text"
            className="form-input-sm w-full font-mono text-right bg-muted/30"
            value={(cargo.rateType === "lumpsum" ? cargo.rate : cargo.rate * cargoQuantity).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            readOnly
          />
        </div>

        <div className="form-field w-24">
          <label className="form-label flex items-center gap-1">
            Voy Comm
            <InfoTooltip formula="Gross Freight × Voy Comm%" description="Commission" />
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

        <div className="form-field w-28">
          <label className="form-label flex items-center gap-1">
            Demurrage
            <InfoTooltip formula="Demurrage Rate × Excess Days" description="Penalty" />
          </label>
          <input
            type="number"
            className="form-input-sm w-full font-mono text-right"
            value={cargo.demurrageAmount}
            onChange={(e) => onUpdate("demurrageAmount", parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="form-field w-28">
          <label className="form-label flex items-center gap-1">
            Despatch
            <InfoTooltip formula="Despatch Rate × Saved Days" description="Bonus" />
          </label>
          <input
            type="number"
            className="form-input-sm w-full font-mono text-right"
            value={cargo.despatchAmount}
            onChange={(e) => onUpdate("despatchAmount", parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="form-field w-20">
          <label className="form-label">Avg</label>
          <select 
            className="form-select-sm w-full"
            value={cargo.averageMode}
            onChange={(e) => onUpdate("averageMode", e.target.value)}
          >
            <option value="average">Average</option>
            <option value="per_port">Port</option>
            <option value="per_voyage">Voyage</option>
          </select>
        </div>

        <div className="form-field w-24">
          <label className="form-label">SF (m³/mt)</label>
          <input
            type="number"
            step="0.01"
            className="form-input-sm w-full font-mono text-right"
            value={cargo.stowageFactor || ""}
            onChange={(e) => onUpdate("stowageFactor", parseFloat(e.target.value) || 0)}
            placeholder="1.40"
          />
        </div>
      </div>
    </div>
  );
}
