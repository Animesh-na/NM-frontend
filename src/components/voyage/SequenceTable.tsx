import { ChevronDown, Plus, Trash2, Ship, Loader2, AlertTriangle, ArrowUp, ArrowDown, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { PortSelect, type Port } from "./PortSelect";
import { useVoyageContext, type SequenceRowUI, type PortOperation, type Season, type SpeedContext, type WdaysUnit } from "@/context/VoyageContext";
import { SequenceSummary } from "./SequenceSummary";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { estimateCubicFromDwt } from "@/utils/draftRestriction";
import { IntakeCalculator } from "./IntakeCalculator";
import { CustomTermsDialog } from "./CustomTermsDialog";
import { PortDaDialog } from "./PortDaDialog";
import { DaSplitDialog } from "./DaSplitDialog";

import { getCargoRowMap } from "@/utils/cargoRowMapping";
import { toast } from "@/hooks/use-toast";
import { getFieldId } from "@/utils/validation";
import { getApiMode, API_MODE_CHANGED_EVENT } from "@/services/apiMode";
import { buildContext, contextFuel, contextProfile, FUEL_LABEL, type ContextFuel } from "@/utils/speedContext";

const seasonOptions: { value: Season; label: string }[] = [
  { value: "summer", label: "Summer" },
  { value: "winter", label: "Winter" },
  { value: "tropical", label: "Tropical" },
  { value: "eca", label: "ECA" },
];

const termsOptions = [
  { value: "shinc", label: "shinc" },
  { value: "sshex", label: "sshex" },
  { value: "shex", label: "shex" },
  { value: "satpm", label: "satpm" },
  { value: "custom", label: "custom" },
];

/**
 * Speed/fuel context picker — a small popup with two dropdowns:
 *   1. speed profile (Eco / Full)
 *   2. fuel (VLSFO / LSMGO / HSFO + Scrubber)
 * HSFO is only selectable when the vessel is scrubber-fitted; such vessels may
 * also burn HSFO inside ECA zones.
 */
function SpeedContextPicker({
  value,
  hasScrubber,
  onChange,
}: {
  value: SpeedContext;
  hasScrubber: boolean;
  onChange: (v: SpeedContext) => void;
}) {
  const profile = contextProfile(value);
  const fuel = contextFuel(value, "vlsfo");
  const set = (p: "eco" | "full", f: ContextFuel) => onChange(buildContext(p, f) as SpeedContext);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${profile === "eco" ? "Eco" : "Full"} speed · ${FUEL_LABEL[fuel]}`}
          className="form-select-sm h-6 w-full min-w-0 px-0.5 pr-3 text-center font-mono text-[10px] hover:bg-muted"
        >
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2 space-y-2 z-50 bg-popover">
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Speed</div>
          <select
            className="form-select-sm w-full text-[11px]"
            value={profile}
            onChange={(e) => set(e.target.value as "eco" | "full", fuel)}
          >
            <option value="full">Full Speed</option>
            <option value="eco">Eco Speed</option>
          </select>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Fuel</div>
          <select
            className="form-select-sm w-full text-[11px]"
            value={fuel}
            onChange={(e) => set(profile, e.target.value as ContextFuel)}
          >
            <option value="vlsfo">VLSFO</option>
            <option value="lsmgo">LSMGO</option>
            <option value="hsfo" disabled={!hasScrubber}>
              HSFO + Scrubber{hasScrubber ? "" : " (no scrubber)"}
            </option>
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SequenceTable() {
  const { 
    sequence, setSequence, updateSequenceRow, addPort, addRepositioning, removeSequence,
    autoDistanceEnabled, setAutoDistanceEnabled, distanceLoading, vessel,
    departureUtc, setDepartureUtc, getFieldError, results,
  } = useVoyageContext();

  const errCls = (msg?: string) =>
    msg ? "border-destructive ring-1 ring-destructive focus-visible:ring-destructive" : "";
  
  const [isExpanded, setIsExpanded] = useState(true);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [intakeRowId, setIntakeRowId] = useState<number | null>(null);
  const [daPort, setDaPort] = useState<{ rowId: number; port: string } | null>(null);
  const [daSplitRowId, setDaSplitRowId] = useState<number | null>(null);

  const [customTermsRowId, setCustomTermsRowId] = useState<number | null>(null);
  const [savedCustomTerms, setSavedCustomTerms] = useState<{ name: string; coefficient: number }[]>([]);

  // Tanker sheets use agreed laytime (hours) instead of mt/day + terms.
  const [sectorMode, setSectorMode] = useState(getApiMode());
  useEffect(() => {
    const onModeChange = () => setSectorMode(getApiMode());
    window.addEventListener(API_MODE_CHANGED_EVENT, onModeChange);
    return () => window.removeEventListener(API_MODE_CHANGED_EVENT, onModeChange);
  }, []);
  const isTanker = sectorMode === "tanker";
  
  const { cargos = [] } = useVoyageContext();
  const globalStowageFactor = cargos[0]?.stowageFactor || 1.4;

  // Local draft store so user can type freely while we keep the underlying numeric value.
  const [coeffDrafts, setCoeffDrafts] = useState<Record<number, string>>({});

  // Truncate (not round) to 4 decimal places, always pad to 4.
  const formatCoefficient = (v: number): string => {
    if (!isFinite(v)) return "1.0000";
    const truncated = Math.trunc(v * 10000) / 10000;
    return truncated.toFixed(4);
  };

  /**
   * Move a port/repos row up or down with cargo-order validation:
   *  - a discharge row must remain after at least one load row of the same cargo.
   *  - "open" row is locked at index 0; can't move into/over it.
   */
  const moveRow = (id: number, direction: "up" | "down") => {
    const idx = sequence.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= sequence.length) return;
    if (sequence[idx].type === "open" || sequence[target].type === "open") {
      toast({ title: "Cannot move", description: "Open row is fixed at the start.", variant: "destructive" });
      return;
    }

    const next = [...sequence];
    [next[idx], next[target]] = [next[target], next[idx]];

    // Validate cargo ordering: every discharge must follow a load of its cargo.
    const map = getCargoRowMap(cargos, next);
    for (let i = 0; i < next.length; i++) {
      const row = next[i];
      if ((row.operation || "").toLowerCase().startsWith("disch")) {
        const cargoIds = map.get(row.id) || [];
        if (cargoIds.length === 0) continue;
        for (const cargoId of cargoIds) {
          const hasPriorLoad = next.slice(0, i).some(
            (r) => (r.operation || "").toLowerCase().startsWith("load") && (map.get(r.id) || []).includes(cargoId),
          );
          if (!hasPriorLoad) {
            const cIdx = cargos.findIndex((c) => c.id === cargoId);
            toast({
              title: "Invalid move",
              description: `Discharge port for Cargo #${cIdx + 1} cannot be placed before its load port.`,
              variant: "destructive",
            });
            return;
          }
        }
      }
    }

    setSequence(next);
  };


  const handlePortChange = (id: number, port: Port | null) => {
    setSequence(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, port: port?.name || "", portUnloc: port?.unloc || "", portId: port?.id, coordinates: port?.coordinates, isEuEea: port?.isEuEea, portCountry: port?.country, ukEts: port?.ukEts, ukZone: port?.ukZone ?? null };
      // Auto-set port fuel to LSMGO in ECA zones — unless the vessel has a
      // scrubber, in which case it may burn HSFO inside ECA too.
      if (port?.ecaZone) {
        updated.portFuelType = vessel.hasScrubber ? "hsfo" : "lsmgo";
      }
      return updated;
    }));
  };

  const getTypeLabel = (row: SequenceRowUI): string => {
    if (row.type === "open") return "Open";
    if (row.type === "repos") return "Repos";
    if (row.operation === "loading") return "load";
    if (row.operation === "discharging") return "disch";
    if (row.operation === "bunkering") return "bkrg";
    if (row.operation === "pssg") return "pssg";
    return "port";
  };

  const handleTypeChange = (id: number, value: string) => {
    if (value === "load") updateSequenceRow(id, "operation", "loading");
    else if (value === "disch") updateSequenceRow(id, "operation", "discharging");
    else if (value === "bkrg") updateSequenceRow(id, "operation", "bunkering");
    else if (value === "pssg") updateSequenceRow(id, "operation", "pssg");
  };

  const showQuantityFields = (row: SequenceRowUI) => 
    row.type === "port" && (row.operation === "loading" || row.operation === "discharging");

  const showBunkeringFields = (row: SequenceRowUI) =>
    row.type === "port" && row.operation === "bunkering";

  const formatTime = (days: number): string => {
    if (days === 0) return "0.00";
    return days.toFixed(2);
  };

  const thClass = "min-w-0 overflow-hidden px-0.5 py-0.5 text-[9px] font-semibold leading-none text-foreground whitespace-nowrap text-center bg-table-header";
  const rowGridClass = isTanker
    ? "grid-cols-[minmax(50px,.5fr)_minmax(136px,2fr)_minmax(38px,.38fr)_minmax(174px,1.75fr)_minmax(88px,.85fr)_minmax(58px,.55fr)_minmax(58px,.6fr)_minmax(58px,.6fr)_minmax(48px,.48fr)_minmax(48px,.48fr)_minmax(50px,.5fr)_minmax(70px,.85fr)_28px]"
    : "grid-cols-[minmax(50px,.5fr)_minmax(136px,2fr)_minmax(38px,.38fr)_minmax(174px,1.75fr)_minmax(88px,.85fr)_minmax(58px,.55fr)_minmax(58px,.6fr)_minmax(58px,.6fr)_minmax(58px,.58fr)_minmax(58px,.58fr)_minmax(48px,.48fr)_minmax(48px,.48fr)_minmax(50px,.5fr)_minmax(70px,.85fr)_28px]";
  const tableMinWidthClass = isTanker ? "min-w-[904px]" : "min-w-[1020px]";
  const pairedCellClass = "flex h-6 min-w-0 items-center gap-0.5 overflow-hidden whitespace-nowrap";
  const pairedRowClass = "flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden whitespace-nowrap";
  const contextRowClass = "grid min-w-0 flex-1 grid-cols-[28px_minmax(42px,1fr)] items-center gap-0.5 overflow-hidden";
  const separatorClass = "shrink-0 text-[8px] text-muted-foreground/70";
  const sequenceNumericInputClass = "form-input-sm h-6 w-full min-w-0 max-w-full box-border px-0.5 font-mono text-right text-[10px]";

  return (
    <div className="calc-card-row">
      <button
        data-readonly-allowed="true"
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Sequence"
      >
        <span>Sequence ({vessel.speedProfile === "eco" ? "Eco" : "Full"})</span>
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 p-1">
          <div className="sequence-horizontal-scroll sheet-scroll w-full min-w-0 overflow-x-auto">
            <table className={`block w-full ${tableMinWidthClass} text-[10px]`}>
              <thead className="block w-full min-w-0">
                <tr className={`grid w-full min-w-0 ${rowGridClass}`}>
                   <th className={`${thClass} border-r border-border`}>Type</th>
                   <th className={`${thClass} border-r border-border text-left`}>Port</th>
                  <th className={thClass}>Cargo</th>
                  <th className={thClass}>Distance &amp; ECA</th>
                  <th className={thClass}>Sea time &amp; WD</th>
                  <th className={thClass}>Port Fuel</th>
                  <th className={thClass}>Quantity (mt)</th>
                  <th className={thClass}>{isTanker ? "Laytime h" : "mt/d"}</th>
                  {!isTanker && <th className={thClass}>Terms</th>}
                  {!isTanker && <th className={thClass}>Coefficient</th>}
                  <th className={thClass}>Tt hrs</th>
                  <th className={thClass}>Extra hrs</th>
                  <th className={thClass}>Draft (m)</th>
                  <th className={thClass}>DA ($)</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody className="block w-full min-w-0">
                {sequence.map((row, index) => {
                  const isOpen = row.type === "open";
                  const isPort = row.type === "port";
                  const hasQty = showQuantityFields(row);
                  const hasBunkering = showBunkeringFields(row);
                  const typeLabel = getTypeLabel(row);
                  const tdClass = "flex h-6 min-w-0 items-center overflow-hidden whitespace-nowrap px-0.5 align-middle [&>input]:block [&>select]:block";

                  return (
                    <tr key={row.id} className={`group grid w-full min-w-0 items-center ${rowGridClass}`}>
                      {/* Type */}
                      <td className={`${tdClass} border-r border-border`}>
                        {isOpen ? (
                          <span className="text-[10px] font-semibold text-primary px-1">Open</span>
                        ) : row.type === "repos" ? (
                          <span className="text-[10px] font-semibold text-muted-foreground px-1">Repos</span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                               className="form-select-sm flex h-6 w-full min-w-0 items-center justify-between px-1 text-[10px] capitalize"
                                title="Type / reorder"
                              >
                                <span>{typeLabel}</span>
                                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-[7rem]">
                              {[
                                { v: "load", l: "Load" },
                                { v: "disch", l: "Disch" },
                                { v: "bkrg", l: "Bkrg" },
                                { v: "pssg", l: "Pssg" },
                              ].map((opt) => (
                                <DropdownMenuItem
                                  key={opt.v}
                                  className={`text-[11px] cursor-pointer ${typeLabel === opt.v ? "bg-accent/60 font-semibold" : ""}`}
                                  onClick={() => handleTypeChange(row.id, opt.v)}
                                >
                                  {opt.l}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-[11px] cursor-pointer"
                                disabled={index <= 1}
                                onClick={() => moveRow(row.id, "up")}
                              >
                                <ArrowUp className="h-3 w-3 mr-1.5" />
                                Move Up
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-[11px] cursor-pointer"
                                disabled={index >= sequence.length - 1}
                                onClick={() => moveRow(row.id, "down")}
                              >
                                <ArrowDown className="h-3 w-3 mr-1.5" />
                                Move Down
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>

                       {/* Port */}
                       <td className={`${tdClass} border-r border-border`}>
                         {(() => { const portErr = getFieldError("sequence","port",row.id); return (
                           <div
                           id={getFieldId("sequence","port",row.id)}
                             className="flex min-w-0 flex-1 items-center overflow-hidden"
                           aria-invalid={!!portErr}
                           title={portErr || undefined}
                         >
                           <div className={`flex-1 min-w-0 ${portErr ? "ring-1 ring-destructive rounded" : ""}`}>
                             <PortSelect
                               value={row.port}
                               onChange={(port) => handlePortChange(row.id, port)}
                               placeholder="Select port..."
                             />
                           </div>
                         </div>
                         );})()}
                      </td>

                      {/* Cargo */}
                      <td className={tdClass}>
                        {hasQty && cargos.length > 0 ? (
                          <select
                             className="form-select-sm h-6 w-full min-w-0 px-0.5 text-center text-[10px]"
                            title="Assign one cargo to this port"
                            value={cargos.length === 1 ? String(cargos[0].id) : String((row.assignedCargoIds || [])[0] ?? "")}
                            disabled={cargos.length === 1}
                            onChange={(e) => {
                              const next = e.target.value ? [Number(e.target.value)] : [];
                              setSequence((prev) => prev.map((r) => r.id === row.id ? { ...r, assignedCargoIds: next } : r));
                            }}
                          >
                            {cargos.length > 1 && <option value="">—</option>}
                            {cargos.map((c, i) => <option key={c.id} value={c.id}>#{i + 1}</option>)}
                          </select>
                        ) : <span className="block text-center text-muted-foreground/40">—</span>}
                      </td>

                      {/* Distance + ECA */}
                      <td className={tdClass}>
                        {isOpen ? <span className="text-muted-foreground/40 px-1">—</span> : (
                          distanceLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground mx-auto" />
                          ) : (
                             <div className={pairedCellClass}>
                               <div className={contextRowClass}><SpeedContextPicker value={row.distanceSpeedContext} hasScrubber={!!vessel.hasScrubber} onChange={(v) => updateSequenceRow(row.id, "distanceSpeedContext", v)} />
                              {(() => { const err = getFieldError("sequence","distance",row.id); return (
                              <input id={getFieldId("sequence","distance",row.id)} aria-invalid={!!err} title={err}
                                type="number" className={`${sequenceNumericInputClass} ${errCls(err)}`}
                                value={row.distance || ""} onChange={(e) => updateSequenceRow(row.id, "distance", parseFloat(e.target.value) || 0)} placeholder="0" />
                              );})()}</div>
                                <span className={separatorClass}>&</span>
                              <div className={contextRowClass}><SpeedContextPicker value={row.ecaDistanceSpeedContext} hasScrubber={!!vessel.hasScrubber} onChange={(v) => updateSequenceRow(row.id, "ecaDistanceSpeedContext", v)} />
                            {(() => { const err = getFieldError("sequence","ecaDistance",row.id); return (
                            <input id={getFieldId("sequence","ecaDistance",row.id)} aria-invalid={!!err} title={err}
                                 type="number" className={`${sequenceNumericInputClass} ${errCls(err)}`}
                              value={row.ecaDistance || ""} onChange={(e) => updateSequenceRow(row.id, "ecaDistance", parseFloat(e.target.value) || 0)} placeholder="0" />
                              );})()}</div>
                          </div>
                        ))}
                      </td>

                      {/* Sea Time + Weather Delay / Sea Margin */}
                      <td className={tdClass}>
                        {isOpen ? <span className="text-muted-foreground/40 px-1">—</span> : (
                            <div className={pairedCellClass}>
                             <div className={pairedRowClass}><span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-muted-foreground" title="Sea time is calculated from distance, speed and sea margin">
                            {row.timeOverride !== undefined
                              ? formatTime(row.timeOverride)
                              : row.totalLegTime > 0
                                ? formatTime(row.totalLegTime)
                                : "0.00"}
                             </span></div><span className={separatorClass}>&</span>
                            <div className={pairedRowClass}>
                            {(autoDistanceEnabled && !row.weatherDelayFailed && row.weatherDelayHours !== undefined) ? (
                           <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-muted-foreground" title="Weather delay from distance API (h)">
                            {Math.abs(row.weatherDelayHours).toFixed(1)}
                          </span>
                        ) : (
                          <input
                            type="number" min="0" max="100" step="0.5"
                             className={`${sequenceNumericInputClass} ${row.weatherDelayFailed ? "border-warning/60" : ""}`}
                            value={row.seaMargin || ""}
                            onChange={(e) => updateSequenceRow(row.id, "seaMargin", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            title={row.weatherDelayFailed ? "Weather delay unavailable — enter sea margin % manually" : "Sea margin %"}
                          />
                        )}</div>
                          </div>
                        )}
                      </td>

                      {/* Port Fuel */}
                      <td className={tdClass}>
                        {!isOpen && isPort ? (
                           <select className="form-select-sm h-6 w-full min-w-0 px-1 text-[10px]" value={row.portFuelType || "vlsfo"}
                            onChange={(e) => updateSequenceRow(row.id, "portFuelType", e.target.value)}>
                            {vessel.hasScrubber && <option value="hsfo">HSFO</option>}
                            <option value="vlsfo">VLSFO</option>
                            <option value="lsmgo">LSMGO</option>
                          </select>
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Quantity */}
                      <td className={tdClass}>
                        {hasQty ? (() => {
                          // Simple draft check: does the vessel's draft at this port exceed the port max draft?
                          const qtyExceedsDraft = row.operation === 'discharging' && row.portMaxDraft > 0 && row.draft > row.portMaxDraft;
                          return (
                             <div className="flex h-6 w-full min-w-0 items-center overflow-hidden whitespace-nowrap">
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                     {(() => { const err = getFieldError("sequence","quantity",row.id); return (
                                     <input id={getFieldId("sequence","quantity",row.id)} aria-invalid={!!err} title={err || (qtyExceedsDraft ? "Draft exceeds limit" : undefined)}
                                       type="number" className={`${sequenceNumericInputClass} ${qtyExceedsDraft ? 'bg-destructive/20 text-destructive border-destructive' : ''} ${errCls(err)}`}
                                       value={row.quantity || ""}
                                       onChange={(e) => {
                                         let val = parseFloat(e.target.value) || 0;
                                         if (isTanker && row.operation === "loading" && vessel?.dwt > 0) {
                                           const otherLoading = sequence
                                             .filter((r) => r.id !== row.id && r.operation === "loading")
                                             .reduce((s, r) => s + (r.quantity || 0), 0);
                                           const allowed = Math.max(0, vessel.dwt - otherLoading);
                                           if (val > allowed) val = allowed;
                                         }
                                         updateSequenceRow(row.id, "quantity", val);
                                       }} placeholder="0"
                                       onDoubleClick={() => { if (!isTanker) setIntakeRowId(row.id); }} />
                                     );})()}
                                   </TooltipTrigger>
                                   {!isTanker && (
                                     <TooltipContent side="top" className="text-[10px]">
                                       <p>Double-click to open Intake Calculator</p>
                                     </TooltipContent>
                                   )}
                                </Tooltip>
                               </TooltipProvider>
                               {qtyExceedsDraft && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[220px] text-[10px]">
                                      <p className="font-semibold">Draft Restriction</p>
                                      <p>Vessel draft {row.draft?.toFixed(2)}m exceeds port limit {row.portMaxDraft}m</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                )}
                            </div>
                          );
                        })() : hasBunkering ? (
                          <span className="text-[10px] text-muted-foreground px-1">bkr</span>
                        ) : (
                          <span className="text-muted-foreground/40 px-1">—</span>
                        )}
                      </td>

                      {/* Productivity / laytime */}
                      <td className={tdClass}>
                        {hasQty ? (
                          <input type="number" className={sequenceNumericInputClass}
                            value={(isTanker ? row.layTime : row.productivity) || ""}
                            onChange={(e) => updateSequenceRow(row.id, isTanker ? "layTime" : "productivity", parseFloat(e.target.value) || 0)} placeholder="0" />
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {!isTanker && (
                      <>
                      {/* Terms */}
                      <td className={tdClass}>
                        {hasQty ? (
                           <select className="form-select-sm h-6 w-full min-w-0 px-1 text-[10px]" 
                            value={row.terms === "custom" ? `custom:${row.customTermsName}` : (row.terms || "shinc")}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "__new_custom__") {
                                setCustomTermsRowId(row.id);
                              } else if (val.startsWith("custom:")) {
                                const cName = val.replace("custom:", "");
                                const found = savedCustomTerms.find(t => t.name === cName);
                                updateSequenceRow(row.id, "terms", "custom");
                                updateSequenceRow(row.id, "customTermsName", cName);
                                updateSequenceRow(row.id, "coefficientFactor", found?.coefficient || 1.0);
                              } else {
                                updateSequenceRow(row.id, "terms", val);
                                const dc = val === "sshex" ? 1.5555 : val === "shex" ? 1.2727 : val === "satpm" ? 1.3333 : 1.0;
                                updateSequenceRow(row.id, "coefficientFactor", dc);
                                updateSequenceRow(row.id, "customTermsName", "");
                              }
                            }}>
                            {termsOptions.filter(o => o.value !== "custom").map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            {savedCustomTerms.map(ct => (
                              <option key={`custom:${ct.name}`} value={`custom:${ct.name}`}>{ct.name}</option>
                            ))}
                            <option value="__new_custom__">＋ custom</option>
                          </select>
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Coefficient */}
                      <td className={tdClass}>
                        {hasQty ? (
                          <input
                            type="text"
                            inputMode="decimal"
                             className={sequenceNumericInputClass}
                            value={
                              coeffDrafts[row.id] !== undefined
                                ? coeffDrafts[row.id]
                                : formatCoefficient(row.coefficientFactor || 1)
                            }
                            onFocus={() =>
                              setCoeffDrafts((p) => ({
                                ...p,
                                [row.id]: String(row.coefficientFactor || ""),
                              }))
                            }
                            onChange={(e) => {
                              let v = e.target.value.replace(/,/g, ".");
                              if (v.startsWith(".")) v = `0${v}`;
                              if (!/^\d*\.?\d*$/.test(v)) return;
                              setCoeffDrafts((p) => ({ ...p, [row.id]: v }));
                              const num = parseFloat(v);
                              if (!isNaN(num)) updateSequenceRow(row.id, "coefficientFactor", num);
                            }}
                            onBlur={() => {
                              setCoeffDrafts((p) => {
                                const n = { ...p };
                                delete n[row.id];
                                return n;
                              });
                            }}
                            placeholder="1.0000"
                          />
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>
                      </>
                      )}

                      {/* Turn Time */}
                      <td className={tdClass}>
                        {!isOpen && isPort ? (
                          (() => { const err = getFieldError("sequence","turnExtra",row.id); return (
                          <input id={getFieldId("sequence","turnTime",row.id)} aria-invalid={!!err} title={err}
                             type="number" step="0.01" className={`${sequenceNumericInputClass} ${errCls(err)}`}
                            value={row.turnTime || ""} onChange={(e) => updateSequenceRow(row.id, "turnTime", parseFloat(e.target.value) || 0)} placeholder="0" />
                          );})()
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Extra Time */}
                      <td className={tdClass}>
                        {!isOpen && isPort ? (
                          (() => { const err = getFieldError("sequence","turnExtra",row.id); return (
                          <input id={getFieldId("sequence","extraTime",row.id)} aria-invalid={!!err} title={err}
                             type="number" className={`${sequenceNumericInputClass} ${errCls(err)}`}
                            value={row.extraTime || ""} onChange={(e) => updateSequenceRow(row.id, "extraTime", parseFloat(e.target.value) || 0)} placeholder="0" />
                          );})()
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Draft (m) */}
                      <td className={tdClass}>
                        {hasQty ? (() => {
                          const showWarning = row.portMaxDraft > 0 && row.draft > row.portMaxDraft;
                          return (
                            <input type="number" step="0.01"
                               className={`${sequenceNumericInputClass} ${showWarning ? 'bg-destructive/20 text-destructive border-destructive' : ''}`}
                              value={row.draft || ""} 
                              onChange={(e) => updateSequenceRow(row.id, "draft", parseFloat(e.target.value) || 0)} 
                              placeholder="0"
                              title={showWarning ? `Draft ${row.draft}m exceeds limit${row.portMaxDraft > 0 ? ` (max ${row.portMaxDraft}m)` : ''}` : 'Vessel draft at this port (m)'}
                            />
                          );
                        })() : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Exp DA */}
                      <td className={tdClass}>
                        {isOpen ? <span className="text-muted-foreground/40 px-1">—</span> : (
                          (() => { const err = getFieldError("sequence","expDa",row.id); return (
                           <div className="flex w-full min-w-0 items-center gap-0.5">
                            {(() => {
                              // Tanker: cell shows total DA (Charterer + Owner); only the
                              // Owner's Acct. amount (expDa) feeds the calculation.
                              const ownerAmt = row.daOwnerAcct ?? row.expDa ?? 0;
                              const totalDa = ownerAmt + (row.daChartererAcct ?? 0);
                              return (
                            <input id={getFieldId("sequence","expDa",row.id)} aria-invalid={!!err}
                              title={err || (isTanker ? `Total DA = Charterer's Acct. + Owner's Acct. — only Owner's Acct. ($${ownerAmt.toLocaleString()}) is used in calculations. Use the pencil to split; double-click for DA history.` : "Double-click to view port DA history")}
                              onDoubleClick={() => { if (row.port) setDaPort({ rowId: row.id, port: row.port }); }}
                               type="number" className={`${sequenceNumericInputClass} ${errCls(err)} ${isTanker ? "bg-muted/40 cursor-default" : ""}`}
                              value={isTanker ? (totalDa || "") : (row.expDa || "")}
                              readOnly={isTanker}
                              onChange={(e) => {
                                if (isTanker) return;
                                updateSequenceRow(row.id, "expDa", parseFloat(e.target.value) || 0);
                              }}
                              placeholder="0" />
                              );
                            })()}
                            {isTanker && (
                              <button
                                type="button"
                                className="touch-icon-sm rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Split DA accounts"
                                title="Split DA into Charterer's Acct. and Owner's Acct."
                                onClick={() => setDaSplitRowId(row.id)}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          );})()
                        )}
                      </td>


                      {/* Actions */}
                      <td className={tdClass}>
                        {!isOpen && (
                          <button
                            type="button"
                            className="touch-icon-sm rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove port"
                            aria-label={`Remove ${row.port || "port"}`}
                            onClick={() => removeSequence(row.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action buttons + inline summary toggle */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5 mt-0.5 border-t border-border">
            <button onClick={() => addPort("loading")} className="btn-secondary flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add
            </button>
            <button onClick={addRepositioning} className="btn-secondary">Repos</button>
            <div className="flex items-center gap-1.5">
              <Checkbox id="auto-dist" checked={autoDistanceEnabled} onCheckedChange={(checked) => setAutoDistanceEnabled(checked === true)} className="h-3.5 w-3.5" />
              <label htmlFor="auto-dist" className="text-[10px] text-muted-foreground cursor-pointer">Auto dist</label>
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-muted-foreground">Dep:</label>
              <input
                type="datetime-local"
                className="form-input-sm text-[10px] font-mono w-36"
                value={departureUtc}
                onChange={(e) => setDepartureUtc(e.target.value)}
              />
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="flex shrink-0 items-center gap-2 rounded px-1 py-0.5 text-[10px] font-mono tabular-nums hover:bg-muted/30"
              title="Sequence summary"
            >
              <span className="text-muted-foreground">Sea: <span className="text-foreground font-medium">{results.totalSeaDays.toFixed(2)}d</span></span>
              <span className="text-muted-foreground">Port: <span className="text-foreground font-medium">{results.totalPortDays.toFixed(2)}d</span></span>
              <span className="text-muted-foreground">Total: <span className="text-primary font-bold">{results.totalVoyageDays.toFixed(2)}d</span></span>
              <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${summaryExpanded ? "" : "-rotate-90"}`} />
            </button>
          </div>

          <SequenceSummary expanded={summaryExpanded} />
        </div>
      )}

      {/* Intake Calculator Popup */}
      {intakeRowId !== null && !isTanker && (() => {
        const row = sequence.find(r => r.id === intakeRowId);
        if (!row) return null;
        const sf = row.stowageFactor > 0 ? row.stowageFactor * 35.3147 : globalStowageFactor * 35.3147;

        return (
          <IntakeCalculator
            open={true}
            onClose={() => setIntakeRowId(null)}
            vessel={vessel}
            targetPortId={intakeRowId}
            ports={sequence.map((r) => ({
              id: r.id,
              name: r.port,
              draft: r.portMaxDraft || r.draft || 0,
              operation: r.operation,
              kind: r.type,
            }))}
            stowageFactor={Math.round(sf)}
            onApply={(qty, portResults) => {
              updateSequenceRow(intakeRowId, "quantity", qty);
              portResults.forEach((p) => {
                updateSequenceRow(p.id, "portMaxDraft", p.draft);
                updateSequenceRow(p.id, "draft", p.draft);
              });
              setIntakeRowId(null);
            }}
          />
        );
      })()}

      {/* Custom Terms Dialog */}
      {customTermsRowId !== null && (() => {
        const row = sequence.find(r => r.id === customTermsRowId);
        return (
          <CustomTermsDialog
            open={true}
            onClose={() => setCustomTermsRowId(null)}
            onSave={(name, coefficient) => {
              // Add to saved list if not already there
              setSavedCustomTerms(prev => {
                const exists = prev.find(t => t.name === name);
                if (exists) return prev.map(t => t.name === name ? { name, coefficient } : t);
                return [...prev, { name, coefficient }];
              });
              updateSequenceRow(customTermsRowId, "terms", "custom");
              updateSequenceRow(customTermsRowId, "customTermsName", name);
              updateSequenceRow(customTermsRowId, "coefficientFactor", coefficient);
              setCustomTermsRowId(null);
            }}
            initialName={row?.customTermsName || ""}
            initialCoefficient={row?.coefficientFactor || 1.0}
          />
        );
      })()}

      <PortDaDialog
        open={daPort !== null}
        onOpenChange={(v) => { if (!v) setDaPort(null); }}
        port={daPort?.port || ""}
        onSelect={(amount) => {
          if (!daPort) return;
          updateSequenceRow(daPort.rowId, "expDa", amount);
          if (isTanker) {
            // DA from API defaults to the owner's account; user can split later.
            updateSequenceRow(daPort.rowId, "daOwnerAcct", amount);
            updateSequenceRow(daPort.rowId, "daChartererAcct", 0);
          }
        }}
      />

      {/* Tanker DA split popup (Charterer's Acct. + Owner's Acct.) */}
      {daSplitRowId !== null && (() => {
        const row = sequence.find(r => r.id === daSplitRowId);
        if (!row) return null;
        return (
          <DaSplitDialog
            open={true}
            onOpenChange={(v) => { if (!v) setDaSplitRowId(null); }}
            port={row.port}
            ownerAmount={row.daOwnerAcct ?? row.expDa ?? 0}
            chartererAmount={row.daChartererAcct ?? 0}
            onSave={(owner, charterer) => {
              // Owner's account drives the calculation; charterer's is reference-only.
              updateSequenceRow(daSplitRowId, "daOwnerAcct", owner);
              updateSequenceRow(daSplitRowId, "daChartererAcct", charterer);
              updateSequenceRow(daSplitRowId, "expDa", owner);
              setDaSplitRowId(null);
            }}
          />
        );
      })()}



    </div>
  );
}
