import { ChevronDown, Package, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useVoyageContext, type CargoEntry, type SequenceRowUI } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";
import { AlertTriangle } from "lucide-react";
import { getRowsForCargo } from "@/utils/cargoRowMapping";
import { calculateCargoDemurrageDespatchFromRows } from "@/utils/demurrageDespatch";

export function CargoSection() {
  const { 
    cargos = [], addCargo, removeCargo, updateCargoEntry,
    hireRate, setHireRate, results, sequence,
    netBB, setNetBB, cargoValidation, updateCargoCpOverride,
  } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);

  // Derive per-cargo loaded qty using the same logic as the calculation engine:
  // explicit chip mapping wins; otherwise auto-map loading rows to cargos by order.
  const loadingRows = sequence.filter((r) => r.operation === "loading");
  const usesExplicitMapping = sequence.some((r) => (r.assignedCargoIds || []).length > 0);
  const perCargoQty = (cargoId: number, ci: number): number => {
    if (usesExplicitMapping) {
      return loadingRows
        .filter((r) => (r.assignedCargoIds || []).includes(cargoId))
        .reduce((sum, r) => sum + (r.quantity || 0), 0);
    }
    // Auto: cargo #ci gets loading row #ci (1-to-1 by order)
    return loadingRows[ci]?.quantity || 0;
  };

  const validation = cargoValidation ?? { errors: [], hasErrors: false, usesExplicitMapping: false };

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
                GTC
                <InfoTooltip
                  formula="Gross Time Charter — primary hire input. NTC = GTC × (1 - TC Comm%)"
                  description="Gross Time Charter (primary editable hire rate)"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right"
                  value={parseFloat(((cargos[0]?.tcCommission ?? 3.75) < 100 ? hireRate / (1 - (cargos[0]?.tcCommission ?? 3.75) / 100) : 0).toFixed(2))}
                  onChange={(e) => {
                    const gtc = parseFloat(e.target.value) || 0;
                    const tc = (cargos[0]?.tcCommission ?? 3.75) / 100;
                    setHireRate(gtc * (1 - tc));
                  }}
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
                NTC
                <InfoTooltip
                  formula="NTC = GTC × (1 - TC Comm%). Drives Hire Cost."
                  description="Net Time Charter (derived from GTC)"
                />
              </label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right bg-muted/30"
                  value={parseFloat((hireRate || 0).toFixed(2))}
                  onChange={(e) => setHireRate(parseFloat(e.target.value) || 0)}
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
          </div>

          {/* Cargo assignment validation banner */}
          {validation.hasErrors && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-1.5 text-[10px] text-destructive space-y-0.5">
              <div className="flex items-center gap-1 font-semibold">
                <AlertTriangle className="h-3 w-3" />
                Cargo assignment errors
              </div>
              {validation.errors.map((err) => (
                <div key={err.cargoId} className="pl-4">• {err.message}</div>
              ))}
            </div>
          )}

          {/* Cargo entries */}
          {cargos.map((cargo, index) => (
            <CargoEntryCard 
              key={cargo.id} 
              cargo={cargo} 
              index={index}
              onUpdate={(field, value) => updateCargoEntry(cargo.id, field, value)}
              onRemove={() => removeCargo(cargo.id)}
              canRemove={cargos.length > 1}
              sequenceQuantity={perCargoQty(cargo.id, index)}
              cpRows={getRowsForCargo(cargo.id, cargos, sequence).filter(
                (r) => r.operation === "loading" || r.operation === "discharging",
              )}
              onCpOverride={(rowId, field, value) =>
                updateCargoCpOverride(cargo.id, rowId, field, value)
              }
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
  cargo: CargoEntry;
  index: number;
  onUpdate: (field: string, value: number | string) => void;
  onRemove: () => void;
  canRemove: boolean;
  sequenceQuantity: number;
  cpRows: SequenceRowUI[];
  onCpOverride: (rowId: number, field: "quantity" | "productivity" | "demurrage" | "despatch", value: number) => void;
}

function CargoEntryCard({ cargo, index, onUpdate, sequenceQuantity, cpRows, onCpOverride }: CargoEntryCardProps) {
  const cargoQuantity = sequenceQuantity;

  // ─── Auto-compute Demurrage / Despatch from TOTAL day-diff ───
  // First sum all row differences for this cargo: Σ(Operational days − CP days).
  // Only the final total decides demurrage/despatch: positive = demurrage,
  // negative = despatch. A fast port can therefore offset a slow port.
  const demurrageResult = useMemo(
    () => calculateCargoDemurrageDespatchFromRows(cargo, cpRows),
    [cargo, cpRows],
  );
  const perRowCalc = demurrageResult.rows;
  const totalExtraDays = demurrageResult.totalExtraDays;
  const totalDem = demurrageResult.demurrageAmount;
  const totalDesp = demurrageResult.despatchAmount;

  // Snapshot CP baseline from operational values once per row, so later
  // operational edits compute a proper Δ Days against the original CP figures.
  useEffect(() => {
    cpRows.forEach((r) => {
      const ov = cargo.cpOverrides?.[r.id] || {};
      if (ov.quantity === undefined || ov.quantity === null) {
        onCpOverride(r.id, "quantity", r.quantity || 0);
      }
      if (ov.productivity === undefined || ov.productivity === null) {
        onCpOverride(r.id, "productivity", r.productivity || 0);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpRows.map((r) => r.id).join(",")]);

  // Sync aggregated totals into the cargo entry so the engine picks them up.
  useEffect(() => {
    if (Math.abs((cargo.demurrageAmount || 0) - totalDem) > 0.01) {
      onUpdate("demurrageAmount", parseFloat(totalDem.toFixed(2)));
    }
    if (Math.abs((cargo.despatchAmount || 0) - totalDesp) > 0.01) {
      onUpdate("despatchAmount", parseFloat(totalDesp.toFixed(2)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalDem, totalDesp]);

  return (
    <div className="border border-border rounded p-2 bg-input-bg">
      <div className="flex flex-wrap gap-2 items-end">
        <span className="text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded self-center">
          #{index + 1}
        </span>
        <div className="form-field w-48">
          <label className="form-label">Rate</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              className="form-input-sm min-w-0 flex-1 font-mono text-right"
              value={cargo.rate}
              onChange={(e) => onUpdate("rate", parseFloat(e.target.value) || 0)}
            />
            <select
              className="form-select-sm w-[72px] flex-shrink-0"
              value={cargo.rateType}
              onChange={(e) => onUpdate("rateType", e.target.value)}
            >
              <option value="mt">$/mt</option>
              <option value="lumpsum">Lump</option>
            </select>
          </div>
        </div>

        <div className="form-field w-36">
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
            <InfoTooltip
              formula="Auto = Rate ($/day) × Excess Port Days (Op − CP). Cost to charterer."
              description="Demurrage rate per day"
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

        <div className="form-field w-28">
          <label className="form-label flex items-center gap-1">
            Despatch
            <InfoTooltip
              formula="Auto = Rate ($/day) × Saved Port Days (CP − Op). Earnings for charterer."
              description="Despatch rate per day"
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

      </div>

      {/* Charter party rows — shown when demurrage or despatch rates are set.
          Contract CP values stay editable here; operational values mirror the
          sequence and are not changed by demurrage/despatch rates. */}
      {cpRows.length > 0 && ((cargo.demurrageRate || 0) > 0 || (cargo.despatchRate || 0) > 0) && (
        <div className="mt-1.5 rounded border border-sky-400 bg-sky-50 dark:bg-sky-950/30 p-1 space-y-1">
          {cpRows.map((r) => {
            const ov = cargo.cpOverrides?.[r.id] || {};
            const qtyVal = ov.quantity !== undefined && ov.quantity !== null ? ov.quantity : r.quantity;
            const prodVal = ov.productivity !== undefined && ov.productivity !== null ? ov.productivity : r.productivity;
            const calc = perRowCalc.find((x) => x.rowId === r.id);
            const diffDays = calc?.diff || 0;
            const demVal = calc?.dem || 0;
            const despVal = calc?.desp || 0;
            const ro = "form-input-sm font-mono text-right bg-white/60 dark:bg-sky-900/40 cursor-default";
            return (
              <div key={r.id} className="flex flex-wrap gap-1 items-end">
                <div className="form-field w-20">
                  <label className="form-label flex items-center gap-1">
                    Δ Days
                    <InfoTooltip
                      formula="Operational Port Days − CP Port Days"
                      description="Positive = excess (demurrage). Negative = saved (despatch)."
                    />
                  </label>
                  <input readOnly className={`${ro} w-full ${diffDays > 0 ? "text-red-600" : diffDays < 0 ? "text-green-600" : ""}`}
                    value={diffDays.toFixed(2)} />
                </div>
                <div className="form-field w-24">
                  <label className="form-label">Demurrage ($)</label>
                  <input readOnly className={`${ro} w-full`} value={Math.round(demVal).toLocaleString()} />
                </div>
                <div className="form-field w-24">
                  <label className="form-label">Despatch ($)</label>
                  <input readOnly className={`${ro} w-full`} value={Math.round(despVal).toLocaleString()} />
                </div>
                <div className="form-field w-10">
                  <label className="form-label">Op</label>
                  <input readOnly className={`${ro} w-full uppercase text-center`}
                    value={r.operation === "loading" ? "L" : r.operation === "discharging" ? "D" : "-"} />
                </div>
                <div className="form-field w-32">
                  <label className="form-label">Port</label>
                  <input readOnly className={`${ro} text-left w-full`} value={r.port || "—"} title={r.port} />
                </div>
                <div className="form-field w-20">
                  <label className="form-label">V ({r.distanceSpeedContext})</label>
                  <input readOnly className={`${ro} w-full`} value={r.distance || 0} />
                </div>
                <div className="form-field w-20">
                  <label className="form-label">L ({r.ecaDistanceSpeedContext})</label>
                  <input readOnly className={`${ro} w-full`} value={r.ecaDistance || 0} />
                </div>
                <div className="form-field w-24">
                  <label className="form-label">CP Qty (mt)</label>
                  <input
                    type="number"
                    className="form-input-sm w-full font-mono text-right border-sky-400 bg-white"
                    value={qtyVal || 0}
                    onChange={(e) => onCpOverride(r.id, "quantity", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-field w-20">
                  <label className="form-label">CP MT/d</label>
                  <input
                    type="number"
                    className="form-input-sm w-full font-mono text-right border-sky-400 bg-white"
                    value={prodVal || 0}
                    onChange={(e) => onCpOverride(r.id, "productivity", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-field w-24">
                  <label className="form-label">Op Qty (mt)</label>
                  <input readOnly className={`${ro} w-full`} value={r.quantity || 0} />
                </div>
                <div className="form-field w-20">
                  <label className="form-label">Op MT/d</label>
                  <input readOnly className={`${ro} w-full`} value={r.productivity || 0} />
                </div>
                <div className="form-field w-16">
                  <label className="form-label">Terms</label>
                  <input readOnly className={`${ro} w-full uppercase`} value={r.terms || "-"} />
                </div>
                <div className="form-field w-16">
                  <label className="form-label">Turn (h)</label>
                  <input readOnly className={`${ro} w-full`} value={r.turnTime || 0} />
                </div>
                <div className="form-field w-16">
                  <label className="form-label">Extra (h)</label>
                  <input readOnly className={`${ro} w-full`} value={r.extraTime || 0} />
                </div>
                <div className="form-field w-20">
                  <label className="form-label">Exp DA</label>
                  <input readOnly className={`${ro} w-full`} value={r.expDa || 0} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
