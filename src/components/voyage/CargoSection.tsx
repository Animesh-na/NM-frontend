import { ChevronDown, Package, Plus, Trash2, Search, Building2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getApiMode, API_MODE_CHANGED_EVENT } from "@/services/apiMode";
import { searchCompanies, type MarineCompany } from "@/services/marineApi";
import { useVoyageContext, type CargoEntry, type SequenceRowUI } from "@/context/VoyageContext";

import { AlertTriangle } from "lucide-react";
import { getRowsForCargo } from "@/utils/cargoRowMapping";
import { calculateCargoDemurrageDespatchFromRows } from "@/utils/demurrageDespatch";
import { getFieldId, MAX_CARGOS } from "@/utils/validation";

function ChartererSearch({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<MarineCompany[]>([]);
  const [open, setOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 2,
      left: rect.left,
      width: Math.max(rect.width, 280),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const companies = await searchCompanies(query.trim(), 10);
      if (!cancelled) setResults(companies);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      className="max-h-64 overflow-auto rounded border border-border bg-popover text-popover-foreground shadow-2xl"
      style={{
        position: "fixed",
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`,
        width: `${dropdownPosition.width}px`,
        zIndex: 2147483647,
      }}
    >
      {query.trim().length < 2 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">Type at least 2 characters to search</div>
      ) : results.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">No companies found</div>
      ) : (
        <div className="py-1">
          {results.map((company, index) => (
            <button
              key={`${company.company}-${index}`}
              type="button"
              onClick={() => {
                setQuery(company.company);
                onChange(company.company);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground text-xs cursor-pointer transition-colors"
            >
              <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{company.company}</div>
                {company.type?.length > 0 && (
                  <div className="text-[10px] text-muted-foreground truncate">{company.type.join(", ")}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-xs">
      <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          const nextValue = e.target.value;
          setQuery(nextValue);
          onChange(nextValue);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          requestAnimationFrame(updatePosition);
        }}
        placeholder="Search charterer..."
        className="form-input-sm w-full pl-6 pr-6"
        autoComplete="off"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            onChange("");
            setResults([]);
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm font-medium"
        >
          ×
        </button>
      )}
      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}

export function CargoSection() {
  const { 
    cargos = [], addCargo, removeCargo, updateCargoEntry,
    hireRate, setHireRate, sequence, vesselCost, setVesselCost,
    netBB, setNetBB, cargoValidation, updateCargoCpOverride, updateCargoOpOverride,
    getFieldError, charterer, setCharterer,
  } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);
  const errCls = (msg?: string) =>
    msg ? "border-destructive ring-1 ring-destructive focus-visible:ring-destructive" : "";

  // NTC is always considered the vessel cost — keep them in sync.
  useEffect(() => {
    if (vesselCost !== hireRate) setVesselCost(hireRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hireRate]);

  // Derive per-cargo loaded qty using the same logic as the calculation engine:
  // explicit chip mapping wins; otherwise auto-map loading rows to cargos by order.
  const loadingRows = sequence.filter((r) => r.operation === "loading");
  const usesExplicitMapping = sequence.some((r) => (r.assignedCargoIds || []).length > 0);
  const perCargoQty = (cargoId: number, ci: number): number => {
    if (cargos.length === 1) {
      return loadingRows.reduce((sum, r) => sum + (r.quantity || 0), 0);
    }
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
    <div className="calc-card-row">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Cargo"
      >
        <span>Cargo</span>
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 px-2 py-1 space-y-1">
          {/* Top summary fields */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2 items-end">
            <div className="form-field min-w-0">
              <label className="form-label">GTC</label>
              <div className="input-with-unit">
                {(() => { const err = getFieldError("cargo","gtc","_header"); return (
                <input
                  id={getFieldId("cargo","gtc","_header")}
                  aria-invalid={!!err}
                  title={err}
                  type="number"
                  className={`form-input-sm w-full font-mono text-right ${errCls(err)}`}
                  value={parseFloat(((cargos[0]?.tcCommission ?? 3.75) < 100 ? hireRate / (1 - (cargos[0]?.tcCommission ?? 3.75) / 100) : 0).toFixed(2))}
                  onChange={(e) => {
                    const gtc = parseFloat(e.target.value) || 0;
                    const tc = (cargos[0]?.tcCommission ?? 3.75) / 100;
                    setHireRate(gtc * (1 - tc));
                  }}
                />
                );})()}
                <span className="unit">$/d</span>
              </div>
            </div>
            <div className="form-field min-w-0">
              <label className="form-label">TC Comm</label>
              <div className="input-with-unit">
                {(() => { const err = getFieldError("cargo","tcCommission",cargos[0]?.id); return (
                <input
                  id={getFieldId("cargo","tcCommission",cargos[0]?.id ?? "_")}
                  aria-invalid={!!err}
                  title={err}
                  type="number"
                  step="0.25"
                  className={`form-input-sm w-full font-mono text-right ${errCls(err)}`}
                  value={cargos[0]?.tcCommission ?? 3.75}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    cargos.forEach(c => updateCargoEntry(c.id, "tcCommission", value));
                  }}
                />
                );})()}
                <span className="unit">%</span>
              </div>
            </div>
            <div className="form-field min-w-0">
              <label className="form-label">NTC</label>
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
            <div className="form-field min-w-0">
              <label className="form-label">Net BB</label>
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
            <div className="form-field min-w-0">
              <label className="form-label">Gross BB</label>
              <div className="input-with-unit">
                {(() => { const err = getFieldError("cargo","grossBB","_header"); return (
                <input
                  id={getFieldId("cargo","grossBB","_header")}
                  aria-invalid={!!err}
                  title={err}
                  type="number"
                  className={`form-input-sm w-full font-mono text-right ${errCls(err)}`}
                  value={parseFloat(((cargos[0]?.tcCommission ?? 3.75) < 100 ? netBB / (1 - (cargos[0]?.tcCommission ?? 3.75) / 100) : 0).toFixed(2))}
                  onChange={(e) => {
                    const gross = parseFloat(e.target.value) || 0;
                    const tc = (cargos[0]?.tcCommission ?? 3.75) / 100;
                    setNetBB(gross * (1 - tc));
                  }}
                />
                );})()}
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
              onOpUpdate={(rowId, field, value) =>
                updateCargoOpOverride(cargo.id, rowId, field, value)
              }
            />
          ))}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Link to Charterer</label>
              <ChartererSearch value={charterer} onChange={setCharterer} />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={addCargo}
                disabled={cargos.length >= MAX_CARGOS}
                title={cargos.length >= MAX_CARGOS ? "Maximum 5 cargoes are allowed per voyage" : undefined}
                className="btn-secondary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
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
  onOpUpdate: (
    rowId: number,
    field: "quantity" | "productivity" | "turnTime" | "extraTime" | "terms" | "coefficientFactor" | "cranes" | "expDa" | "layTime",
    value: number | string,
  ) => void;
}

function CargoEntryCard({ cargo, index, onUpdate, sequenceQuantity, cpRows, onCpOverride, onOpUpdate }: CargoEntryCardProps) {
  const cargoQuantity = sequenceQuantity;
  const { getFieldError } = useVoyageContext();
  const [open, setOpen] = useState(index === 0);
  const [isTanker, setIsTanker] = useState(getApiMode() === "tanker");
  useEffect(() => {
    const onModeChange = () => setIsTanker(getApiMode() === "tanker");
    window.addEventListener(API_MODE_CHANGED_EVENT, onModeChange);
    return () => window.removeEventListener(API_MODE_CHANGED_EVENT, onModeChange);
  }, []);
  const errCls = (msg?: string) =>
    msg ? "border-destructive ring-1 ring-destructive focus-visible:ring-destructive" : "";
  const errRate = getFieldError("cargo","rate",cargo.id);
  const errDem = getFieldError("cargo","demurrageRate",cargo.id);
  const errDesp = getFieldError("cargo","despatchRate",cargo.id);
  const errVoy = getFieldError("cargo","voyageCommission",cargo.id);
  const errBal = getFieldError("cargo","quantityBalance",cargo.id);

  // ─── Auto-compute Demurrage / Despatch from TOTAL day-diff ───
  // First sum all row differences for this cargo: Σ(CP days − Operational days).
  // Only the final total decides demurrage/despatch: positive = despatch,
  // negative = demurrage. A fast port can therefore offset a slow port.
  const demurrageResult = useMemo(
    () => calculateCargoDemurrageDespatchFromRows(cargo, cpRows),
    [cargo, cpRows],
  );
  const laytimeMode = cargo.laytimeMode ?? "average";
  const perRowCalc = demurrageResult.rows;
  const totalExtraDays = demurrageResult.totalExtraDays;
  const totalDem = demurrageResult.demurrageAmount;
  const totalDesp = demurrageResult.despatchAmount;


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
    <div className="border border-border rounded-md bg-input-bg overflow-hidden">
      {/* Collapsed summary row */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50 transition-colors"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span className="text-[10px] font-semibold bg-muted text-foreground px-1.5 py-0.5 rounded">
          #{index + 1}
        </span>
        <span className="text-[11px] font-mono tabular-nums">{cargoQuantity.toLocaleString()} mt</span>
        <span className="text-muted-foreground text-[11px]">|</span>
        <span className="text-[11px] font-mono tabular-nums">
          {cargo.rateType === "lumpsum"
            ? `$${(cargo.rate || 0).toLocaleString()} lump`
            : isTanker
              ? `WS ${(cargo.worldscale ?? 100).toFixed(2)} → ${(((cargo.rate || 0) * (cargo.worldscale ?? 100)) / 100).toFixed(3)} $/ton`
              : `${(cargo.rate || 0).toFixed(3)} $/ton`}
        </span>
        <span className="text-muted-foreground text-[11px]">|</span>
        <span className="text-[11px] font-mono tabular-nums">{(cargo.voyageCommission || 0)}%</span>
        <Package className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" />
      </button>

      {open && (
      <div className="px-2 pb-2 pt-1 border-t border-border">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-2 items-end">
        <div className="form-field min-w-0">
          <label className="form-label">{isTanker ? "Flat rate user input" : "Rate"}</label>
          <div className="flex items-center gap-1">
            <input
              id={getFieldId("cargo","rate",cargo.id)}
              aria-invalid={!!errRate}
              title={errRate}
              type="number"
              step="0.1"
              className={`form-input-sm min-w-0 flex-1 font-mono text-right ${errCls(errRate)}`}
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

        {isTanker && (
          <div className="form-field min-w-0">
            <label className="form-label">{isTanker ? "Freight WS" : "WS"}</label>
            <div className="input-with-unit">
              <input
                type="number"
                step="0.25"
                min="0"
                className="form-input-sm w-full font-mono text-right"
                value={cargo.worldscale ?? 100}
                onChange={(e) => onUpdate("worldscale", parseFloat(e.target.value) || 0)}
                disabled={cargo.rateType === "lumpsum"}
              />
              <span className="unit">%</span>
            </div>
          </div>
        )}

        {isTanker && (
          <div className="form-field min-w-0">
            <label className="form-label">Eff. Rate</label>
            <div className="input-with-unit">
              <input
                type="text"
                readOnly
                className="form-input-sm w-full font-mono text-right bg-muted/30"
                value={(((cargo.rate || 0) * (cargo.worldscale ?? 100)) / 100).toFixed(3)}
              />
              <span className="unit">$/mt</span>
            </div>
          </div>
        )}

        <div className="form-field min-w-0">
          <label className="form-label">Qty (Seq)</label>
          <input
            id={getFieldId("cargo","quantityBalance",cargo.id)}
            aria-invalid={!!errBal}
            title={errBal}
            type="text"
            className={`form-input-sm w-full font-mono text-right bg-muted/30 ${errCls(errBal)}`}
            value={cargoQuantity.toLocaleString()}
            readOnly
          />
        </div>

        <div className="form-field min-w-0">
          <label className="form-label">Lumpsum</label>
          <div className="input-with-unit">
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={cargo.rateType === "lumpsum" ? cargo.rate : 0}
              onChange={(e) => onUpdate("rate", parseFloat(e.target.value) || 0)}
              disabled={cargo.rateType !== "lumpsum"}
            />
            <span className="unit">$</span>
          </div>
        </div>

        <div className="form-field min-w-0">
          <label className="form-label">Voy Comm</label>
          <div className="input-with-unit">
            <input
              id={getFieldId("cargo","voyageCommission",cargo.id)}
              aria-invalid={!!errVoy}
              title={errVoy}
              type="number"
              step="0.25"
              className={`form-input-sm w-full font-mono text-right ${errCls(errVoy)}`}
              value={cargo.voyageCommission}
              onChange={(e) => onUpdate("voyageCommission", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">%</span>
          </div>
        </div>

        <div className="form-field min-w-0">
          <label className="form-label">Demurrage</label>
          <div className="input-with-unit">
            <input
              id={getFieldId("cargo","demurrageRate",cargo.id)}
              aria-invalid={!!errDem}
              title={errDem}
              type="number"
              className={`form-input-sm w-full font-mono text-right ${errCls(errDem)}`}
              value={cargo.demurrageRate}
              onChange={(e) => {
                const dem = parseFloat(e.target.value) || 0;
                onUpdate("demurrageRate", dem);
                // Despatch conventionally defaults to half demurrage.
                onUpdate("despatchRate", parseFloat((dem / 2).toFixed(2)));
              }}
            />
            <span className="unit">$/d</span>
          </div>
        </div>

        <div className="form-field min-w-0">
          <label className="form-label">Despatch</label>
          <div className="input-with-unit">
            <input
              id={getFieldId("cargo","despatchRate",cargo.id)}
              aria-invalid={!!errDesp}
              title={errDesp}
              type="number"
              className={`form-input-sm w-full font-mono text-right ${errCls(errDesp)}`}
              value={cargo.despatchRate}
              onChange={(e) => onUpdate("despatchRate", parseFloat(e.target.value) || 0)}
            />
            <span className="unit">$/d</span>
          </div>
        </div>

        <div className="form-field min-w-0">
          <label className="form-label">Laytime</label>
          <select
            className="form-input-sm w-full"
            value={cargo.laytimeMode ?? "average"}
            onChange={(e) => onUpdate("laytimeMode", e.target.value)}
          >
            <option value="average">Average</option>
            <option value="non_reversible">Non-reversible</option>
            <option value="cancelled">Cancel dem/desp</option>
          </select>
        </div>

      </div>

      {/* Cargo operational rows: only load/discharge rows shown here are used for demurrage/despatch. */}
      {cpRows.length > 0 && ((cargo.demurrageRate || 0) > 0 || (cargo.despatchRate || 0) > 0) && (
        <div className="mt-1.5 rounded border border-sky-400 bg-sky-50 dark:bg-sky-950/30 p-1 space-y-1">
          {cpRows.map((r) => {
            const ov = cargo.cpOverrides?.[r.id] || {};
            const op = cargo.opOverrides?.[r.id] || {};
            const opQty = op.quantity ?? r.quantity ?? 0;
            const opProd = op.productivity ?? r.productivity ?? 0;
            const opTerms = (op.terms ?? r.terms ?? "") as string;
            const opFactor = op.coefficientFactor ?? r.coefficientFactor ?? 0;
            const opTurn = op.turnTime ?? r.turnTime ?? 0;
            const opExtra = op.extraTime ?? r.extraTime ?? 0;
            
            const opExpDa = op.expDa ?? r.expDa ?? 0;
            const calc = perRowCalc.find((x) => x.rowId === r.id);
            const diffDays = calc?.diffDays || 0;
            const demVal = ov.demurrage ?? cargo.demurrageRate ?? 0;
            const despVal = ov.despatch ?? cargo.despatchRate ?? 0;
            const ro = "form-input-sm font-mono text-right bg-white/60 dark:bg-sky-900/40 cursor-default";
            const edit = "form-input-sm w-full font-mono text-right border-sky-400 bg-white";
            return (
              <div key={r.id} className="flex flex-wrap gap-1 items-end">
                <span className="w-4 pb-1 text-xs font-semibold">&gt;</span>
                <div className="form-field w-10">
                  <label className="form-label">Op</label>
                  <input readOnly className={`${ro} w-full uppercase text-center`}
                    value={r.operation === "loading" ? "load" : r.operation === "discharging" ? "disch" : "-"} />
                </div>
                <div className="form-field w-28">
                  <label className="form-label">Port</label>
                  <input readOnly className={`${ro} text-left w-full`} value={r.port || "—"} title={r.port} />
                </div>
                <div className="form-field w-20">
                  <label className="form-label">Demurrage</label>
                  <input type="number" className={edit} value={demVal} onChange={(e) => onCpOverride(r.id, "demurrage", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="form-field w-20">
                  <label className="form-label">Despatch</label>
                  <input type="number" className={edit} value={despVal} onChange={(e) => onCpOverride(r.id, "despatch", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="form-field w-20">
                  <label className="form-label">Quantity</label>
                  <input
                    type="number"
                    className={edit}
                    value={opQty}
                    onChange={(e) => onOpUpdate(r.id, "quantity", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-field w-16">
                  <label className="form-label">MT/d</label>
                  <input
                    type="number"
                    className={edit}
                    value={opProd}
                    onChange={(e) => onOpUpdate(r.id, "productivity", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-field w-14">
                  <label className="form-label">Terms</label>
                  <select
                    className={edit}
                    value={opTerms || "shinc"}
                    onChange={(e) => {
                      const val = e.target.value;
                      onOpUpdate(r.id, "terms", val);
                      const dc = val === "sshex" ? 1.5555 : val === "fhex" ? 1.25 : val === "satpn" ? 1.33 : 1.0;
                      onOpUpdate(r.id, "coefficientFactor", dc);
                    }}
                  >
                    <option value="shinc">shinc</option>
                    <option value="sshex">sshex</option>
                    <option value="fhex">fhex</option>
                    <option value="satpn">satpn</option>
                  </select>
                </div>
                <div className="form-field w-14">
                  <label className="form-label">Factor</label>
                  <input type="number" step="0.0001" className={edit} value={opFactor} onChange={(e) => onOpUpdate(r.id, "coefficientFactor", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="form-field w-12">
                  <label className="form-label">Tt</label>
                  <input
                    type="number"
                    className={edit}
                    value={opTurn}
                    onChange={(e) => onOpUpdate(r.id, "turnTime", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-field w-12">
                  <label className="form-label">Et</label>
                  <input
                    type="number"
                    className={edit}
                    value={opExtra}
                    onChange={(e) => onOpUpdate(r.id, "extraTime", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-field w-16">
                  <label className="form-label">Exp DA</label>
                  {(() => { const err = getFieldError("sequence","expDa", r.id); return (
                  <input
                    id={getFieldId("sequence","expDa", r.id)}
                    aria-invalid={!!err}
                    title={err}
                    type="number"
                    className={`${edit} ${errCls(err)}`}
                    value={opExpDa}
                    onChange={(e) => onOpUpdate(r.id, "expDa", parseFloat(e.target.value) || 0)}
                  />
                  );})()}
                </div>
                <div className="form-field w-16">
                  <label className="form-label">Δ Days</label>
                  <input readOnly className={`${ro} w-full ${diffDays > 0 ? "text-green-600" : diffDays < 0 ? "text-red-600" : ""}`} value={diffDays.toFixed(2)} />
                </div>
                {laytimeMode === "non_reversible" && (
                  <div className="form-field w-24">
                    <label className="form-label">{diffDays > 0 ? "Despatch $" : "Demurrage $"}</label>
                    <input
                      readOnly
                      className={`${ro} w-full ${diffDays > 0 ? "text-red-600" : diffDays < 0 ? "text-green-600" : ""}`}
                      value={(diffDays > 0 ? diffDays * despVal : Math.abs(diffDays) * demVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    />
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex justify-end gap-3 border-t border-border pt-1 text-[10px] font-semibold">
            <span>CP − Op time: <span className="font-mono">{totalExtraDays.toFixed(2)} d</span></span>
            <span>Demurrage: <span className="font-mono">${totalDem.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            <span>Despatch: <span className="font-mono">${totalDesp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
