import { ChevronDown, Plus, Trash2, Ship, Clock } from "lucide-react";
import { useState } from "react";
import { PortSelect } from "./PortSelect";
import type { Port } from "@/data/ports";
import { useVoyageContext, type SequenceRowUI, type PortOperation, type Season } from "@/context/VoyageContext";
import { SequenceSummary } from "./SequenceSummary";

const operationOptions: { value: PortOperation; label: string }[] = [
  { value: "loading", label: "Load" },
  { value: "discharging", label: "Disch" },
  { value: "waiting", label: "Wait" },
  { value: "bunkering", label: "Bkrg" },
];

const seasonOptions: { value: Season; label: string }[] = [
  { value: "summer", label: "Summer" },
  { value: "winter", label: "Winter" },
  { value: "tropical", label: "Tropical" },
  { value: "eca", label: "ECA" },
];

const termsOptions = [
  { value: "", label: "-" },
  { value: "shinc", label: "shinc" },
  { value: "sshex", label: "sshex" },
  { value: "fhex", label: "fhex" },
];

export function SequenceTable() {
  const { 
    sequence, 
    setSequence, 
    updateSequenceRow, 
    addPort, 
    addRepositioning, 
    removeSequence,
    recalculateDistances, 
    autoDistanceEnabled, 
    setAutoDistanceEnabled 
  } = useVoyageContext();
  
  const [isExpanded, setIsExpanded] = useState(true);

  const handlePortChange = (id: number, port: Port | null) => {
    setSequence(prev => prev.map(row => 
      row.id === id ? { 
        ...row, 
        port: port?.name || "", 
        portUnloc: port?.unloc || "" 
      } : row
    ));
  };

  const getRowLabel = (row: SequenceRowUI): string => {
    if (row.type === "open") return "Open";
    if (row.type === "repos") return "Repos";
    if (row.operation === "loading") return "Load";
    if (row.operation === "discharging") return "Disch";
    if (row.operation === "bunkering") return "Bkrg";
    if (row.operation === "waiting") return "Wait";
    return "Port";
  };

  const getRowClassName = (row: SequenceRowUI): string => {
    if (row.type === "open") return "bg-muted/30";
    if (row.type === "repos") return "bg-amber-500/10";
    if (row.operation === "loading") return "bg-emerald-500/10";
    if (row.operation === "discharging") return "bg-blue-500/10";
    if (row.operation === "bunkering") return "bg-purple-500/10";
    if (row.operation === "waiting") return "bg-orange-500/10";
    return "";
  };

  const showQuantityFields = (row: SequenceRowUI) => 
    row.type === "port" && (row.operation === "loading" || row.operation === "discharging");

  const showBunkeringFields = (row: SequenceRowUI) =>
    row.type === "port" && row.operation === "bunkering";

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Ship className="h-4 w-4" />
          <span>Sequence</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3">
          <div className="overflow-x-auto">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th className="w-16">Type</th>
                  <th className="w-32">Port</th>
                  <th className="w-20">Season/Op</th>
                  <th className="w-16 text-right">Dist (nm)</th>
                  <th className="w-16 text-right">ECA</th>
                  <th className="w-20 text-right">Qty (mt)</th>
                  <th className="w-20 text-right">Rate (mt/d)</th>
                  <th className="w-16">Terms</th>
                  <th className="w-14 text-right">Tt (h)</th>
                  <th className="w-14 text-right">Et (h)</th>
                  <th className="w-16 text-right">Days</th>
                  <th className="w-20 text-right">Exp/DA</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sequence.map((row) => (
                  <tr key={row.id} className={getRowClassName(row)}>
                    {/* Type */}
                    <td>
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted">
                        {getRowLabel(row)}
                      </span>
                    </td>

                    {/* Port */}
                    <td className="p-0.5">
                      <PortSelect
                        value={row.port}
                        onChange={(port) => handlePortChange(row.id, port)}
                        placeholder="Select..."
                      />
                    </td>

                    {/* Season (for Open) or Operation (for Port) */}
                    <td>
                      {row.type === "open" ? (
                        <select
                          className="form-select w-full text-xs"
                          value={row.season || "summer"}
                          onChange={(e) => updateSequenceRow(row.id, "season", e.target.value as Season)}
                        >
                          {seasonOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : row.type === "port" ? (
                        <select
                          className="form-select w-full text-xs"
                          value={row.operation || "loading"}
                          onChange={(e) => updateSequenceRow(row.id, "operation", e.target.value as PortOperation)}
                        >
                          {operationOptions.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground px-1">—</span>
                      )}
                    </td>

                    {/* Distance (editable) */}
                    <td className="text-right">
                      {row.type !== "open" ? (
                        <input
                          type="number"
                          className="form-input-sm w-full font-mono text-xs text-right tabular-nums"
                          value={row.distance || ""}
                          onChange={(e) => updateSequenceRow(row.id, "distance", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* ECA Distance (read-only) */}
                    <td className="text-right">
                      {row.type !== "open" ? (
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {row.ecaDistance > 0 ? row.ecaDistance.toFixed(0) : "0"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td>
                      {showQuantityFields(row) ? (
                        <input
                          type="number"
                          className="form-input-sm w-full font-mono text-xs text-right tabular-nums"
                          value={row.quantity || ""}
                          onChange={(e) => updateSequenceRow(row.id, "quantity", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                      ) : showBunkeringFields(row) ? (
                        <div className="text-[10px] text-muted-foreground space-y-0.5">
                          <div>HSFO: {row.bunkeringHsfo || 0}t</div>
                          <div>VLSFO: {row.bunkeringVlsfo || 0}t</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Productivity (Rate) */}
                    <td>
                      {showQuantityFields(row) ? (
                        <input
                          type="number"
                          className="form-input-sm w-full font-mono text-xs text-right tabular-nums"
                          value={row.productivity || ""}
                          onChange={(e) => updateSequenceRow(row.id, "productivity", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                      ) : showBunkeringFields(row) ? (
                        <div className="text-[10px] text-muted-foreground">
                          LSMGO: {row.bunkeringLsmgo || 0}t
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Terms */}
                    <td>
                      {showQuantityFields(row) ? (
                        <select
                          className="form-select text-xs w-full"
                          value={row.terms}
                          onChange={(e) => updateSequenceRow(row.id, "terms", e.target.value)}
                        >
                          {termsOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Turn Time */}
                    <td>
                      {row.type === "port" ? (
                        <input
                          type="number"
                          className="form-input-sm w-full font-mono text-xs text-right tabular-nums"
                          value={row.turnTime || ""}
                          onChange={(e) => updateSequenceRow(row.id, "turnTime", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Extra Time */}
                    <td>
                      {row.type === "port" ? (
                        <input
                          type="number"
                          className="form-input-sm w-full font-mono text-xs text-right tabular-nums"
                          value={row.extraTime || ""}
                          onChange={(e) => updateSequenceRow(row.id, "extraTime", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Calculated Port Days (read-only) */}
                    <td className="text-right">
                      {row.type === "port" ? (
                        <span className="font-mono text-xs tabular-nums font-medium text-primary">
                          {row.calculatedPortDays.toFixed(2)}d
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Expected DA */}
                    <td>
                      <input
                        type="number"
                        className="form-input-sm w-full font-mono text-xs text-right tabular-nums"
                        value={row.expDa || ""}
                        onChange={(e) => updateSequenceRow(row.id, "expDa", parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        disabled={row.type === "open"}
                      />
                    </td>

                    {/* Delete */}
                    <td>
                      {row.type !== "open" && (
                        <button
                          onClick={() => removeSequence(row.id)}
                          className="p-1 hover:bg-destructive/10 rounded-sm text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3 border-t pt-3">
            <button onClick={() => addPort("loading")} className="btn-success flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add Load
            </button>
            <button onClick={() => addPort("discharging")} className="btn-primary flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add Disch
            </button>
            <button onClick={() => addPort("bunkering")} className="btn-secondary flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add Bkrg
            </button>
            <button onClick={() => addPort("waiting")} className="btn-secondary flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Add Wait
            </button>
            <button onClick={addRepositioning} className="btn-secondary flex items-center gap-1">
              <Ship className="h-3 w-3" />
              Add Repos
            </button>
            <div className="flex-1" />
            <button onClick={recalculateDistances} className="btn-primary">
              Get distances
            </button>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="rounded"
                checked={autoDistanceEnabled}
                onChange={(e) => setAutoDistanceEnabled(e.target.checked)}
              />
              Auto dist.
            </label>
          </div>

          {/* Sequence Summary */}
          <SequenceSummary />
        </div>
      )}
    </div>
  );
}
