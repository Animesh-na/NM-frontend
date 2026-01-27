import { ChevronDown, Plus, Trash2, Anchor, Ship, MapPin } from "lucide-react";
import { useState } from "react";
import { PortSelect } from "./PortSelect";
import type { Port } from "@/data/ports";
import { useVoyageContext, type SequenceRowUI, type SequenceType, type PortOperation } from "@/context/VoyageContext";

const portOperationOptions: { value: PortOperation; label: string }[] = [
  { value: "loading", label: "Loading" },
  { value: "discharging", label: "Discharging" },
  { value: "waiting", label: "Waiting" },
  { value: "bunkering", label: "Bunkering" },
];

export function SequenceTable() {
  const { sequence, setSequence, updateSequenceRow, recalculateDistances, autoDistanceEnabled, setAutoDistanceEnabled } = useVoyageContext();
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

  const createNewRow = (sequenceType: SequenceType, operation: PortOperation | "" = ""): SequenceRowUI => {
    const newId = Math.max(...sequence.map((s) => s.id), 0) + 1;
    return {
      id: newId,
      sequenceType,
      operation,
      port: "",
      portUnloc: "",
      cgo: sequenceType === "port" && (operation === "loading" || operation === "discharging") ? "" : "",
      distanceEca: "0",
      time: "0 nm EV",
      wdaysPort: "0d",
      draft: "5 % VL",
      c: "0 m",
      quantity: "",
      quantityUnit: "mt",
      terms: sequenceType === "port" ? "sshex" : "",
      tt: "1.0000",
      et: "0h",
      expDa: 0,
    };
  };

  const addLoadingPort = () => {
    const newRow = createNewRow("port", "loading");
    // Insert before any repos at the end
    setSequence(prev => {
      const reposRows = prev.filter(r => r.sequenceType === "repos");
      const nonReposRows = prev.filter(r => r.sequenceType !== "repos");
      return [...nonReposRows, newRow, ...reposRows];
    });
  };

  const addDischargingPort = () => {
    const newRow = createNewRow("port", "discharging");
    setSequence(prev => {
      const reposRows = prev.filter(r => r.sequenceType === "repos");
      const nonReposRows = prev.filter(r => r.sequenceType !== "repos");
      return [...nonReposRows, newRow, ...reposRows];
    });
  };

  const addRepositioning = () => {
    const newRow = createNewRow("repos");
    // Always add repos at the end
    setSequence(prev => [...prev, newRow]);
  };

  const removeSequence = (id: number) => {
    // Don't allow removing the Open port
    const row = sequence.find(s => s.id === id);
    if (row?.sequenceType === "open") return;
    setSequence(prev => prev.filter((s) => s.id !== id));
  };

  const getRowLabel = (row: SequenceRowUI): string => {
    if (row.sequenceType === "open") return "Open";
    if (row.sequenceType === "repos") return "Repos";
    return row.operation ? row.operation.charAt(0).toUpperCase() + row.operation.slice(1, 4) : "Port";
  };

  const getRowClassName = (row: SequenceRowUI): string => {
    if (row.sequenceType === "open") return "bg-muted/30";
    if (row.sequenceType === "repos") return "bg-amber-500/10";
    if (row.operation === "loading") return "bg-emerald-500/10";
    if (row.operation === "discharging") return "bg-blue-500/10";
    if (row.operation === "bunkering") return "bg-purple-500/10";
    return "";
  };

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Anchor className="h-4 w-4" />
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
                  <th className="w-20">Type</th>
                  <th className="w-24">Operation</th>
                  <th className="w-32">Port</th>
                  <th className="w-12">Cgo</th>
                  <th className="w-20">Distance (nm)</th>
                  <th className="w-16">Port Days</th>
                  <th className="w-16">Draft</th>
                  <th className="w-24">Quantity</th>
                  <th className="w-20">Terms</th>
                  <th className="w-20">Exp/DA ($)</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sequence.map((row) => (
                  <tr key={row.id} className={getRowClassName(row)}>
                    <td>
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted">
                        {getRowLabel(row)}
                      </span>
                    </td>
                    <td>
                      {row.sequenceType === "port" ? (
                        <select
                          className="form-select w-full text-xs"
                          value={row.operation}
                          onChange={(e) => updateSequenceRow(row.id, "operation", e.target.value as PortOperation)}
                        >
                          {portOperationOptions.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground px-1">
                          {row.sequenceType === "open" ? "—" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="p-0.5">
                      <PortSelect
                        value={row.port}
                        onChange={(port) => handlePortChange(row.id, port)}
                        placeholder="Select port..."
                      />
                    </td>
                    <td>
                      {row.sequenceType === "port" && (row.operation === "loading" || row.operation === "discharging") ? (
                        <input
                          type="text"
                          className="form-input-sm w-full text-center font-mono"
                          value={row.cgo}
                          onChange={(e) => updateSequenceRow(row.id, "cgo", e.target.value)}
                          placeholder="#1"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs text-right"
                        value={row.distanceEca}
                        onChange={(e) => updateSequenceRow(row.id, "distanceEca", e.target.value)}
                        placeholder="0"
                        disabled={row.sequenceType === "open"}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs text-right"
                        value={row.wdaysPort}
                        onChange={(e) => updateSequenceRow(row.id, "wdaysPort", e.target.value)}
                        placeholder="0d"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs"
                        value={row.draft}
                        onChange={(e) => updateSequenceRow(row.id, "draft", e.target.value)}
                      />
                    </td>
                    <td>
                      {row.sequenceType === "port" && (row.operation === "loading" || row.operation === "discharging") ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            className="form-input-sm w-16 font-mono text-right"
                            value={row.quantity}
                            onChange={(e) => updateSequenceRow(row.id, "quantity", e.target.value)}
                            placeholder="0"
                          />
                          <select
                            className="form-select text-[10px] w-10 p-0.5"
                            value={row.quantityUnit}
                            onChange={(e) => updateSequenceRow(row.id, "quantityUnit", e.target.value)}
                          >
                            <option value="mt">mt</option>
                            <option value="cbm">cbm</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      {row.sequenceType === "port" ? (
                        <select 
                          className="form-select text-xs w-full" 
                          value={row.terms}
                          onChange={(e) => updateSequenceRow(row.id, "terms", e.target.value)}
                        >
                          <option value="">-</option>
                          <option value="sshex">sshex</option>
                          <option value="shinc">shinc</option>
                          <option value="fhex">fhex</option>
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-input-sm w-full font-mono text-xs text-right tabular-nums"
                        value={row.expDa || ""}
                        onChange={(e) => updateSequenceRow(row.id, "expDa", parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </td>
                    <td>
                      {row.sequenceType !== "open" && (
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

          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={addLoadingPort} className="btn-success flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add Loading
            </button>
            <button onClick={addDischargingPort} className="btn-primary flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add Discharging
            </button>
            <button onClick={addRepositioning} className="btn-secondary flex items-center gap-1">
              <Ship className="h-3 w-3" />
              Add Repos
            </button>
            <div className="flex-1" />
            <button onClick={recalculateDistances} className="btn-primary">Get distances</button>
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
        </div>
      )}
    </div>
  );
}
