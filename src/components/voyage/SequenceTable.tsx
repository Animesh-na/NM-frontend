import { ChevronDown, Plus, Trash2, Ship, RefreshCw } from "lucide-react";
import { useState } from "react";
import { PortSelect, type Port } from "./PortSelect";
import { useVoyageContext, type SequenceRowUI, type PortOperation, type Season } from "@/context/VoyageContext";
import { SequenceSummary } from "./SequenceSummary";
import { Checkbox } from "@/components/ui/checkbox";

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
    setAutoDistanceEnabled,
    vessel,
  } = useVoyageContext();
  
  const [isExpanded, setIsExpanded] = useState(true);

  const handlePortChange = (id: number, port: Port | null) => {
    setSequence(prev => prev.map(row => 
      row.id === id ? { 
        ...row, 
        port: port?.name || "", 
        portUnloc: port?.unloc || "",
        portId: port?.id,
        coordinates: port?.coordinates,
      } : row
    ));
  };

  const getTypeLabel = (row: SequenceRowUI): string => {
    if (row.type === "open") return "Open";
    if (row.type === "repos") return "Repos";
    if (row.operation === "loading") return "load";
    if (row.operation === "discharging") return "disch";
    if (row.operation === "bunkering") return "bkrg";
    if (row.operation === "waiting") return "wait";
    return "port";
  };

  const handleTypeChange = (id: number, value: string) => {
    if (value === "load") updateSequenceRow(id, "operation", "loading");
    else if (value === "disch") updateSequenceRow(id, "operation", "discharging");
    else if (value === "bkrg") updateSequenceRow(id, "operation", "bunkering");
    else if (value === "wait") updateSequenceRow(id, "operation", "waiting");
  };

  const showQuantityFields = (row: SequenceRowUI) => 
    row.type === "port" && (row.operation === "loading" || row.operation === "discharging");

  const showBunkeringFields = (row: SequenceRowUI) =>
    row.type === "port" && row.operation === "bunkering";

  const formatTime = (days: number): string => {
    if (days === 0) return "0d";
    return `${days.toFixed(1)}d`;
  };

  // Get speed context label from vessel profile
  const getSpeedContext = (): string => {
    return vessel.speedProfile === "eco" ? "EV" : "FV";
  };

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
        <div className="p-2">
          {/* AXS Marine style table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-1 py-1 text-left font-medium text-muted-foreground border border-border w-16">Type</th>
                  <th className="px-1 py-1 text-left font-medium text-muted-foreground border border-border w-28">Port</th>
                  <th className="px-1 py-1 text-left font-medium text-muted-foreground border border-border w-16">Cgo</th>
                  <th className="px-1 py-1 text-left font-medium text-muted-foreground border border-border w-24">Distance & ECA</th>
                  <th className="px-1 py-1 text-center font-medium text-muted-foreground border border-border w-12">Time</th>
                  <th className="px-1 py-1 text-center font-medium text-muted-foreground border border-border w-16">Wdays Port</th>
                  <th className="px-1 py-1 text-center font-medium text-muted-foreground border border-border w-14">Draft</th>
                  <th className="px-1 py-1 text-center font-medium text-muted-foreground border border-border w-10">C</th>
                  <th className="px-1 py-1 text-left font-medium text-muted-foreground border border-border w-24">Quantity</th>
                  <th className="px-1 py-1 text-left font-medium text-muted-foreground border border-border w-28">Terms</th>
                  <th className="px-1 py-1 text-center font-medium text-muted-foreground border border-border w-14">Tt</th>
                  <th className="px-1 py-1 text-center font-medium text-muted-foreground border border-border w-12">Et</th>
                  <th className="px-1 py-1 text-right font-medium text-muted-foreground border border-border w-16">Exp/DA</th>
                  <th className="px-1 py-1 border border-border w-6"></th>
                </tr>
              </thead>
              <tbody>
                {sequence.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    {/* Type - dropdown for port rows, static for open/repos */}
                    <td className="px-1 py-0.5 border border-border">
                      {row.type === "open" ? (
                        <span className="text-xs font-medium">Open</span>
                      ) : row.type === "repos" ? (
                        <span className="text-xs font-medium">Repos</span>
                      ) : (
                        <select
                          className="w-full h-5 text-[11px] border-0 bg-transparent focus:ring-0 p-0"
                          value={getTypeLabel(row)}
                          onChange={(e) => handleTypeChange(row.id, e.target.value)}
                        >
                          <option value="load">load</option>
                          <option value="disch">disch</option>
                          <option value="bkrg">bkrg</option>
                          <option value="wait">wait</option>
                        </select>
                      )}
                    </td>

                    {/* Port with Season dropdown for Open row */}
                    <td className="px-0.5 py-0.5 border border-border">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 min-w-0">
                          <PortSelect
                            value={row.port}
                            onChange={(port) => handlePortChange(row.id, port)}
                            placeholder="Select..."
                          />
                        </div>
                        {row.type === "open" && (
                          <select
                            className="h-5 text-[10px] border border-border rounded bg-background px-0.5 w-16"
                            value={row.season || "summer"}
                            onChange={(e) => updateSequenceRow(row.id, "season", e.target.value as Season)}
                          >
                            {seasonOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>

                    {/* Cargo # - shows #1 for load/disch */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {showQuantityFields(row) ? (
                        <span className="text-[10px] font-medium text-primary">#1</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Distance & ECA - combined AXS style */}
                    <td className="px-1 py-0.5 border border-border">
                      {row.type !== "open" ? (
                        <div className="flex items-center gap-0.5">
                          <span className="text-[10px] text-muted-foreground">{getSpeedContext()}</span>
                          <input
                            type="number"
                            className="w-12 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                            value={row.distance || ""}
                            onChange={(e) => updateSequenceRow(row.id, "distance", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-[10px] text-muted-foreground">&</span>
                          <input
                            type="number"
                            className="w-8 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                            value={row.ecaDistance || ""}
                            onChange={(e) => updateSequenceRow(row.id, "ecaDistance", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Time - calculated */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {row.type !== "open" ? (
                        <span className="font-mono text-[11px] tabular-nums">
                          {formatTime(row.totalLegTime)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Wdays Port - port days */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {row.type === "port" ? (
                        <span className="font-mono text-[11px] tabular-nums font-medium text-primary">
                          {row.calculatedPortDays.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Draft */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {row.type !== "open" ? (
                        <span className="text-[10px] text-muted-foreground">
                          {row.operation === "loading" ? "VL" : row.operation === "discharging" ? "VL" : "—"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* C% - constant percentage */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {showQuantityFields(row) ? (
                        <span className="text-[10px] text-muted-foreground">5%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="px-1 py-0.5 border border-border">
                      {showQuantityFields(row) ? (
                        <div className="flex items-center gap-0.5">
                          <input
                            type="number"
                            className="w-14 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                            value={row.quantity || ""}
                            onChange={(e) => updateSequenceRow(row.id, "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-[10px] text-muted-foreground">mt</span>
                        </div>
                      ) : showBunkeringFields(row) ? (
                        <div className="text-[9px] text-muted-foreground leading-tight">
                          <div>HSFO: {row.bunkeringHsfo || 0}t</div>
                          <div>VLSFO: {row.bunkeringVlsfo || 0}t</div>
                          <div>LSMGO: {row.bunkeringLsmgo || 0}t</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Terms - rate + terms dropdown */}
                    <td className="px-1 py-0.5 border border-border">
                      {showQuantityFields(row) ? (
                        <div className="flex items-center gap-0.5">
                          <input
                            type="number"
                            className="w-12 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                            value={row.productivity || ""}
                            onChange={(e) => updateSequenceRow(row.id, "productivity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-[10px] text-muted-foreground">mt/d</span>
                          <select
                            className="h-5 text-[10px] border border-border rounded bg-background px-0.5"
                            value={row.terms || "shinc"}
                            onChange={(e) => updateSequenceRow(row.id, "terms", e.target.value)}
                          >
                            {termsOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      ) : showBunkeringFields(row) ? (
                        <span className="text-[10px] text-muted-foreground">bunker ops</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Turn Time */}
                    <td className="px-1 py-0.5 border border-border">
                      {row.type === "port" ? (
                        <div className="flex items-center justify-center">
                          <input
                            type="number"
                            step="0.1"
                            className="w-10 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                            value={row.turnTime ? (row.turnTime / 24).toFixed(4) : ""}
                            onChange={(e) => updateSequenceRow(row.id, "turnTime", (parseFloat(e.target.value) || 0) * 24)}
                            placeholder="0"
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-center block">—</span>
                      )}
                    </td>

                    {/* Extra Time */}
                    <td className="px-1 py-0.5 border border-border">
                      {row.type === "port" ? (
                        <div className="flex items-center gap-0.5">
                          <input
                            type="number"
                            className="w-8 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                            value={row.extraTime || ""}
                            onChange={(e) => updateSequenceRow(row.id, "extraTime", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-[9px] text-muted-foreground">h</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-center block">—</span>
                      )}
                    </td>

                    {/* Expected DA */}
                    <td className="px-1 py-0.5 border border-border text-right">
                      {row.type !== "open" ? (
                        <input
                          type="number"
                          className="w-14 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                          value={row.expDa || ""}
                          onChange={(e) => updateSequenceRow(row.id, "expDa", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Delete */}
                    <td className="px-0.5 py-0.5 border border-border text-center">
                      {row.type !== "open" && (
                        <button
                          onClick={() => removeSequence(row.id)}
                          className="p-0.5 hover:bg-destructive/10 rounded text-destructive"
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

          {/* Action buttons - AXS style */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
            <button 
              onClick={() => addPort("loading")} 
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-success/10 text-success border border-success/30 rounded hover:bg-success/20"
            >
              <Plus className="h-3 w-3" />
              Add sequence
            </button>
            <button 
              onClick={() => removeSequence(sequence[sequence.length - 1]?.id)} 
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-muted text-muted-foreground border border-border rounded hover:bg-muted/80"
              disabled={sequence.length <= 1}
            >
              Rem sequence
            </button>
            <button 
              onClick={recalculateDistances} 
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-primary/10 text-primary border border-primary/30 rounded hover:bg-primary/20"
            >
              <RefreshCw className="h-3 w-3" />
              Get distances
            </button>
            <label className="flex items-center gap-1.5 ml-2">
              <Checkbox
                checked={autoDistanceEnabled}
                onCheckedChange={(checked) => setAutoDistanceEnabled(checked === true)}
                className="h-3 w-3"
              />
              <span className="text-[11px] text-muted-foreground">Auto dist.</span>
            </label>
          </div>

          {/* Sequence Summary */}
          <SequenceSummary />
        </div>
      )}
    </div>
  );
}
