import { ChevronDown, Plus, Trash2, Ship, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { PortSelect, type Port } from "./PortSelect";
import { useVoyageContext, type SequenceRowUI, type PortOperation, type Season, type SpeedContext, type WdaysUnit } from "@/context/VoyageContext";
import { SequenceSummary } from "./SequenceSummary";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { estimateCubicFromDwt } from "@/utils/draftRestriction";
import { IntakeCalculator } from "./IntakeCalculator";
import { CustomTermsDialog } from "./CustomTermsDialog";

const seasonOptions: { value: Season; label: string }[] = [
  { value: "summer", label: "Summer" },
  { value: "winter", label: "Winter" },
  { value: "tropical", label: "Tropical" },
  { value: "eca", label: "ECA" },
];

const termsOptions = [
  { value: "shinc", label: "shinc" },
  { value: "sshex", label: "sshex" },
  { value: "fhex", label: "fhex" },
  { value: "satpn", label: "satpn" },
  { value: "custom", label: "custom" },
];

const distanceSpeedContextOptions: { value: SpeedContext; label: string }[] = [
  { value: "EV", label: "EV" },
  { value: "FV", label: "FV" },
];

const ecaDistanceSpeedContextOptions: { value: SpeedContext; label: string }[] = [
  { value: "EL", label: "EL" },
  { value: "FL", label: "FL" },
];

export function SequenceTable() {
  const { 
    sequence, setSequence, updateSequenceRow, addPort, addRepositioning, removeSequence,
    recalculateDistances, autoDistanceEnabled, setAutoDistanceEnabled, distanceLoading, vessel,
    departureUtc, setDepartureUtc,
  } = useVoyageContext();
  
  const [isExpanded, setIsExpanded] = useState(true);
  const [intakeRowId, setIntakeRowId] = useState<number | null>(null);
  const [customTermsRowId, setCustomTermsRowId] = useState<number | null>(null);
  const [savedCustomTerms, setSavedCustomTerms] = useState<{ name: string; coefficient: number }[]>([]);
  
  const { cargos = [] } = useVoyageContext();
  const globalStowageFactor = cargos[0]?.stowageFactor || 1.4;


  const handlePortChange = (id: number, port: Port | null) => {
    setSequence(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, port: port?.name || "", portUnloc: port?.unloc || "", portId: port?.id, coordinates: port?.coordinates, isEuEea: port?.isEuEea, portCountry: port?.country };
      // Auto-set port fuel to LSMGO if port is in ECA zone
      if (port?.ecaZone) {
        updated.portFuelType = "lsmgo";
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

  const thClass = "px-0 py-0.5 text-[8px] font-semibold text-foreground whitespace-nowrap text-center bg-table-header";

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Ship className="h-3.5 w-3.5" />
          <span>Sequence</span>
          <span className={`text-[10px] font-normal px-2 py-0.5 rounded-full ${
            vessel.speedProfile === "eco" 
              ? "bg-success/10 text-success" 
              : "bg-warning/10 text-warning"
          }`}>
            {vessel.speedProfile === "eco" ? "Eco" : "Full"}
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
      </button>

      {isExpanded && (
        <div className="p-1">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr>
                  <th className={thClass}>Type</th>
                  <th className={`${thClass} text-left min-w-[120px]`}>Port</th>
                  <th className={thClass}>Dist nm</th>
                  <th className={thClass}>ECA nm</th>
                  <th className={thClass}>Sea (d)</th>
                  <th className={thClass}>{autoDistanceEnabled ? "WD h" : "SM %"}</th>
                  <th className={thClass}>Qty mt</th>
                  <th className={thClass}>mt/d</th>
                  <th className={thClass}>Terms</th>
                  <th className={thClass}>Coeff</th>
                  <th className={thClass}>Turn h</th>
                  <th className={thClass}>Extra h</th>
                  <th className={thClass}>Draft m</th>
                  <th className={thClass}>Port Fuel</th>
                  <th className={thClass}>DA $</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>
                {sequence.map((row, index) => {
                  const isOpen = row.type === "open";
                  const isPort = row.type === "port";
                  const hasQty = showQuantityFields(row);
                  const hasBunkering = showBunkeringFields(row);
                  const typeLabel = getTypeLabel(row);
                  const tdClass = "px-0 py-0";

                  return (
                    <tr key={row.id} className="group">
                      {/* Type */}
                      <td className={tdClass}>
                        {isOpen ? (
                          <span className="text-[10px] font-semibold text-primary px-1">Open</span>
                        ) : row.type === "repos" ? (
                          <span className="text-[10px] font-semibold text-muted-foreground px-1">Repos</span>
                        ) : (
                          <select
                            className="form-select-sm w-14 text-[10px]"
                            value={typeLabel}
                            onChange={(e) => handleTypeChange(row.id, e.target.value)}
                          >
                            <option value="load">Load</option>
                            <option value="disch">Disch</option>
                            <option value="bkrg">Bkrg</option>
                            <option value="pssg">Pssg</option>
                          </select>
                        )}
                      </td>

                      {/* Port */}
                      <td className={tdClass}>
                        <PortSelect
                          value={row.port}
                          onChange={(port) => handlePortChange(row.id, port)}
                          placeholder="Select port..."
                        />
                        {(row.legDepartureUtc || row.legArrivalUtc) && (
                          <div className="flex gap-1.5 px-1 text-[8px] text-muted-foreground font-mono leading-tight">
                            {row.legArrivalUtc && <span title="Arrival">A:{row.legArrivalUtc.replace("T"," ")}</span>}
                            {row.legDepartureUtc && row.type !== "open" && row.calculatedPortDays > 0 && (
                              <span title="Departure after port ops">D:{fmtDTShort(row.legArrivalUtc || row.legDepartureUtc, row.calculatedPortDays)}</span>
                            )}
                            {row.type === "open" && row.legDepartureUtc && <span title="Departure">D:{row.legDepartureUtc.replace("T"," ")}</span>}
                          </div>
                        )}
                      </td>

                      {/* Distance (V) */}
                      <td className={tdClass}>
                        {isOpen ? <span className="text-muted-foreground/40 px-1">—</span> : (
                          distanceLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground mx-auto" />
                          ) : (
                            <div className="flex items-center gap-0.5">
                              <select
                                className="form-select-sm w-10 text-[10px]"
                                value={row.distanceSpeedContext}
                                onChange={(e) => updateSequenceRow(row.id, "distanceSpeedContext", e.target.value)}
                              >
                                {distanceSpeedContextOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              <input type="number" className="form-input-sm w-14 font-mono text-right text-[10px]"
                                value={row.distance || ""} onChange={(e) => updateSequenceRow(row.id, "distance", parseFloat(e.target.value) || 0)} placeholder="0" />
                            </div>
                          )
                        )}
                      </td>

                      {/* ECA Distance */}
                      <td className={tdClass}>
                        {isOpen ? <span className="text-muted-foreground/40 px-1">—</span> : (
                          <div className="flex items-center gap-0.5">
                            <select className="form-select-sm w-10 text-[10px]" value={row.ecaDistanceSpeedContext}
                              onChange={(e) => updateSequenceRow(row.id, "ecaDistanceSpeedContext", e.target.value)}>
                              {ecaDistanceSpeedContextOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <input type="number" className="form-input-sm w-12 font-mono text-right text-[10px]"
                              value={row.ecaDistance || ""} onChange={(e) => updateSequenceRow(row.id, "ecaDistance", parseFloat(e.target.value) || 0)} placeholder="0" />
                          </div>
                        )}
                      </td>

                      {/* Sea Time */}
                      <td className={tdClass}>
                        {isOpen ? <span className="text-muted-foreground/40 px-1">—</span> : (
                          <input type="number" step="0.01" className="form-input-sm w-14 font-mono text-right text-[10px]"
                            value={row.timeOverride !== undefined ? row.timeOverride : (row.totalLegTime > 0 ? formatTime(row.totalLegTime) : "")}
                            onChange={(e) => { const val = parseFloat(e.target.value); updateSequenceRow(row.id, "timeOverride", val > 0 ? val : undefined); }}
                            placeholder={row.totalLegTime > 0 ? formatTime(row.totalLegTime) : "0"} />
                        )}
                      </td>

                      {/* Sea Margin */}
                      <td className={tdClass}>
                        {isOpen ? <span className="text-muted-foreground/40 px-1">—</span> : autoDistanceEnabled ? (
                          <span className="text-[10px] font-mono text-right w-12 inline-block px-1 text-muted-foreground">
                            {row.weatherDelayHours !== undefined ? Math.max(0, row.weatherDelayHours).toFixed(1) : "—"}
                          </span>
                        ) : (
                          <input type="number" min="0" max="100" step="0.5" className="form-input-sm w-12 font-mono text-right text-[10px]"
                            value={row.seaMargin || ""} onChange={(e) => updateSequenceRow(row.id, "seaMargin", parseFloat(e.target.value) || 0)} placeholder="0" />
                        )}
                      </td>

                      {/* Quantity */}
                      <td className={tdClass}>
                        {hasQty ? (() => {
                          // Simple draft check: does the vessel's draft at this port exceed the port max draft?
                          const qtyExceedsDraft = row.operation === 'discharging' && row.portMaxDraft > 0 && row.draft > row.portMaxDraft;
                          return (
                            <div className="flex items-center gap-0.5">
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <input type="number" className={`form-input-sm w-14 font-mono text-right text-[10px] ${qtyExceedsDraft ? 'bg-destructive/20 text-destructive border-destructive' : ''}`}
                                      value={row.quantity || ""} onChange={(e) => updateSequenceRow(row.id, "quantity", parseFloat(e.target.value) || 0)} placeholder="0"
                                      onDoubleClick={() => setIntakeRowId(row.id)} />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-[10px]">
                                    <p>Double-click to open Intake Calculator</p>
                                  </TooltipContent>
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

                      {/* Productivity */}
                      <td className={tdClass}>
                        {hasQty ? (
                          <input type="number" className="form-input-sm w-12 font-mono text-right text-[10px]"
                            value={row.productivity || ""} onChange={(e) => updateSequenceRow(row.id, "productivity", parseFloat(e.target.value) || 0)} placeholder="0" />
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Terms */}
                      <td className={tdClass}>
                        {hasQty ? (
                          <select className="form-select-sm w-14 text-[10px]" 
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
                                const dc = val === "sshex" ? 1.5555 : val === "fhex" ? 1.25 : val === "satpn" ? 1.33 : 1.0;
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
                          <input type="number" step="0.01" className="form-input-sm w-12 font-mono text-center text-[10px]"
                            value={row.coefficientFactor || ""} onChange={(e) => updateSequenceRow(row.id, "coefficientFactor", parseFloat(e.target.value) || 0)} placeholder="1.0" />
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Turn Time */}
                      <td className={tdClass}>
                        {!isOpen && isPort ? (
                          <input type="number" step="0.01" className="form-input-sm w-12 font-mono text-right text-[10px]"
                            value={row.turnTime || ""} onChange={(e) => updateSequenceRow(row.id, "turnTime", parseFloat(e.target.value) || 0)} placeholder="0" />
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Extra Time */}
                      <td className={tdClass}>
                        {!isOpen && isPort ? (
                          <input type="number" className="form-input-sm w-12 font-mono text-right text-[10px]"
                            value={row.extraTime || ""} onChange={(e) => updateSequenceRow(row.id, "extraTime", parseFloat(e.target.value) || 0)} placeholder="0" />
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Draft (m) */}
                      <td className={tdClass}>
                        {hasQty ? (() => {
                          const showWarning = row.portMaxDraft > 0 && row.draft > row.portMaxDraft;
                          return (
                            <input type="number" step="0.01"
                              className={`form-input-sm w-14 font-mono text-right text-[10px] ${showWarning ? 'bg-destructive/20 text-destructive border-destructive' : ''}`}
                              value={row.draft || ""} 
                              onChange={(e) => updateSequenceRow(row.id, "draft", parseFloat(e.target.value) || 0)} 
                              placeholder="0"
                              title={showWarning ? `Draft ${row.draft}m exceeds limit${row.portMaxDraft > 0 ? ` (max ${row.portMaxDraft}m)` : ''}` : 'Vessel draft at this port (m)'}
                            />
                          );
                        })() : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Port Fuel */}
                      <td className={tdClass}>
                        {!isOpen && isPort ? (
                          <select className="form-select-sm w-14 text-[10px]" value={row.portFuelType || "vlsfo"}
                            onChange={(e) => updateSequenceRow(row.id, "portFuelType", e.target.value)}>
                            {vessel.hasScrubber && <option value="hsfo">HSFO</option>}
                            <option value="vlsfo">VLSFO</option>
                            <option value="lsmgo">LSMGO</option>
                          </select>
                        ) : <span className="text-muted-foreground/40 px-1">—</span>}
                      </td>

                      {/* Exp DA */}
                      <td className={tdClass}>
                        {isOpen ? <span className="text-muted-foreground/40 px-1">—</span> : (
                          <input type="number" className="form-input-sm w-14 font-mono text-right text-[10px]"
                            value={row.expDa || ""} onChange={(e) => updateSequenceRow(row.id, "expDa", parseFloat(e.target.value) || 0)} placeholder="0" />
                        )}
                      </td>

                      {/* Actions */}
                      <td className={tdClass}>
                        {!isOpen && (
                          <button onClick={() => removeSequence(row.id)}
                            className="p-0.5 hover:bg-destructive/10 rounded text-destructive/50 hover:text-destructive transition-colors"
                            title="Delete row">
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

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1 mt-1 border-t border-border">
            <button onClick={() => addPort("loading")} className="btn-secondary flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add
            </button>
            <button onClick={addRepositioning} className="btn-secondary">Repos</button>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5">
              <Checkbox id="auto-dist" checked={autoDistanceEnabled} onCheckedChange={(checked) => setAutoDistanceEnabled(checked === true)} className="h-3.5 w-3.5" />
              <label htmlFor="auto-dist" className="text-[10px] text-muted-foreground cursor-pointer">Auto dist</label>
            </div>
            {autoDistanceEnabled && (
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground">Dep:</label>
                <input
                  type="datetime-local"
                  className="form-input-sm text-[10px] font-mono w-36"
                  value={departureUtc}
                  onChange={(e) => setDepartureUtc(e.target.value)}
                />
              </div>
            )}
            <button onClick={recalculateDistances} className="btn-secondary flex items-center gap-1" disabled={autoDistanceEnabled}>
              <RefreshCw className="h-3 w-3" /> Distances
            </button>
          </div>

          <SequenceSummary />
        </div>
      )}

      {/* Intake Calculator Popup */}
      {intakeRowId !== null && (() => {
        const row = sequence.find(r => r.id === intakeRowId);
        if (!row) return null;
        const sf = row.stowageFactor > 0 ? row.stowageFactor * 35.3147 : globalStowageFactor * 35.3147;
        
          const validateAndApply = (qty: number, draft: number | undefined) => {
            // The intake calculator already properly calculates max loadable cargo
            // accounting for draft, volume, and DWT limits — just apply directly
            updateSequenceRow(intakeRowId, "quantity", qty);
            if (draft !== undefined) {
              updateSequenceRow(intakeRowId, "portMaxDraft", draft);
              updateSequenceRow(intakeRowId, "draft", draft);
            }
            setIntakeRowId(null);
          };

        return (
          <IntakeCalculator
            open={true}
            onClose={() => setIntakeRowId(null)}
            onApply={(qty, draft) => validateAndApply(qty, draft)}
            vessel={vessel}
            portName={row.port}
            portDraft={row.portMaxDraft || row.draft || 0}
            currentQuantity={row.quantity}
            stowageFactor={Math.round(sf)}
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

    </div>
  );
}
