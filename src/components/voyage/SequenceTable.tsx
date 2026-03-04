import { ChevronDown, Plus, Trash2, Ship, RefreshCw, Loader2, Anchor } from "lucide-react";
import { useState, useMemo } from "react";
import { PortSelect, type Port } from "./PortSelect";
import { useVoyageContext, type SequenceRowUI, type PortOperation, type Season, type SpeedContext, type WdaysUnit } from "@/context/VoyageContext";
import { SequenceSummary } from "./SequenceSummary";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateDraftRestriction, estimateCubicFromDwt, type DraftCheckResult } from "@/utils/draftRestriction";

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
];

const wdaysUnitOptions: { value: WdaysUnit; label: string }[] = [
  { value: "VL", label: "VL" },
  { value: "%", label: "%" },
];

// Speed context options for distance (V = Outside ECA)
const distanceSpeedContextOptions: { value: SpeedContext; label: string }[] = [
  { value: "EV", label: "EV" },
  { value: "FV", label: "FV" },
];

// Speed context options for ECA distance (L = Inside ECA)
const ecaDistanceSpeedContextOptions: { value: SpeedContext; label: string }[] = [
  { value: "EL", label: "EL" },
  { value: "FL", label: "FL" },
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
    distanceLoading,
    vessel,
  } = useVoyageContext();
  
  const [isExpanded, setIsExpanded] = useState(true);

  // Get global stowage factor from first cargo entry
  const { cargos = [] } = useVoyageContext();
  const globalStowageFactor = cargos[0]?.stowageFactor || 1.4;

  // Compute draft check results for loading/discharging ports with portMaxDraft set
  const draftCheckResults = useMemo(() => {
    const results: Record<number, DraftCheckResult> = {};
    for (const row of sequence) {
      if (row.type !== "port") continue;
      if (row.portMaxDraft <= 0) continue;
      if (row.operation !== "loading" && row.operation !== "discharging") continue;
      
      const cubicCapacity = vessel.cubic > 0 ? vessel.cubic : estimateCubicFromDwt(vessel.dwt);
      const sf = row.stowageFactor > 0 ? row.stowageFactor : globalStowageFactor;
      
      results[row.id] = calculateDraftRestriction({
        currentDraftM: vessel.draft,
        dwtMt: vessel.dwt,
        tpcMtPerCm: vessel.tpcTpi,
        shipCubicCapacityM3: cubicCapacity,
        portName: row.port,
        portMaxDraftM: row.portMaxDraft,
        ukcPercent: 0,
        stowageFactorM3PerMt: sf,
        requestedCargoMt: row.quantity,
      });
    }
    return results;
  }, [sequence, vessel, globalStowageFactor]);

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
    // Distance recalculation is triggered automatically via the portUnlocsKey effect in VoyageContext
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

  // Get the time display value (either override or calculated)
  const getTimeValue = (row: SequenceRowUI): number => {
    if (row.timeOverride !== undefined && row.timeOverride > 0) {
      return row.timeOverride;
    }
    return row.totalLegTime;
  };

  // Determine speed context label prefix based on vessel profile
  const getSpeedPrefix = (): string => {
    return vessel.speedProfile === "eco" ? "E" : "F";
  };

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Ship className="h-3.5 w-3.5" />
          <span>Sequence</span>
          <span className={`text-[9px] font-normal px-1.5 py-0.5 rounded ${
            vessel.speedProfile === "eco" 
              ? "bg-green-100/50 text-green-700 dark:bg-green-900/20 dark:text-green-400" 
              : "bg-orange-100/50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
          }`}>
            {vessel.speedProfile === "eco" ? "Eco" : "Full"}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-1.5">
          {/* AXS Marine style table - compact */}
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-1 py-0.5 text-left font-medium text-muted-foreground border border-border w-14">Type</th>
                  <th className="px-1 py-0.5 text-left font-medium text-muted-foreground border border-border w-32">Port</th>
                  <th className="px-1 py-0.5 text-left font-medium text-muted-foreground border border-border w-12">Cgo</th>
                  <th className="px-1 py-0.5 text-center font-medium text-muted-foreground border border-border w-44">
                    Distance (V) & ECA (L)
                  </th>
                  <th className="px-1 py-0.5 text-center font-medium text-muted-foreground border border-border w-36" title="Sea Time: Base / +Margin / Total">
                    Sea Time (d)
                  </th>
                  <th className="px-1 py-0.5 text-center font-medium text-muted-foreground border border-border w-20" title="Port Max Draft (m) - Draft restriction check">Port Draft</th>
                  <th className="px-1 py-0.5 text-center font-medium text-muted-foreground border border-border w-10" title="Number of Cranes">Crn</th>
                  <th className="px-1 py-0.5 text-center font-medium text-muted-foreground border border-border w-12" title="Sea Margin % - Increases sailing time for weather/routing buffer">SM%</th>
                  <th className="px-1 py-0.5 text-left font-medium text-muted-foreground border border-border w-20">Quantity</th>
                  <th className="px-1 py-0.5 text-left font-medium text-muted-foreground border border-border w-36">Terms</th>
                  <th className="px-1 py-0.5 text-center font-medium text-muted-foreground border border-border w-14" title="Port Fuel Type">P.Fuel</th>
                  <th className="px-1 py-0.5 text-center font-medium text-muted-foreground border border-border w-12">Tt (h)</th>
                  <th className="px-1 py-0.5 text-center font-medium text-muted-foreground border border-border w-12">Et (h)</th>
                  <th className="px-1 py-0.5 text-right font-medium text-muted-foreground border border-border w-16">Exp/DA</th>
                  <th className="px-1 py-0.5 border border-border w-6"></th>
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
                          <option value="pssg">pssg</option>
                        </select>
                      )}
                    </td>

                    {/* Port with Season - Open row gets full width port, season on next line */}
                    <td className="px-0.5 py-0.5 border border-border">
                      {row.type === "open" ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="w-full">
                            <PortSelect
                              value={row.port}
                              onChange={(port) => handlePortChange(row.id, port)}
                              placeholder="Select port..."
                            />
                          </div>
                          <select
                            className="h-5 text-[10px] border border-border rounded bg-input-bg px-0.5 w-full"
                            value={row.season || "summer"}
                            onChange={(e) => updateSequenceRow(row.id, "season", e.target.value as Season)}
                          >
                            {seasonOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <PortSelect
                            value={row.port}
                            onChange={(port) => handlePortChange(row.id, port)}
                            placeholder="Select..."
                          />
                        </div>
                      )}
                    </td>

                    {/* Cargo # - shows #1 for load/disch */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {showQuantityFields(row) ? (
                        <span className="text-[10px] font-medium text-primary">#1</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Distance (V) & ECA (L) - Dual distance inputs with unit selectors */}
                    <td className="px-1 py-0.5 border border-border">
                      {row.type !== "open" ? (
                        distanceLoading ? (
                          <div className="flex items-center justify-center gap-1 py-1">
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground">Calculating...</span>
                          </div>
                        ) : (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-0.5">
                            {/* V = Outside ECA (Non-ECA distance) with speed context selector */}
                            <select
                              className="h-5 w-9 text-[9px] font-medium border border-border rounded bg-input-bg px-0.5"
                              value={row.distanceSpeedContext}
                              onChange={(e) => updateSequenceRow(row.id, "distanceSpeedContext", e.target.value as SpeedContext)}
                              title="Speed context for Outside ECA distance"
                            >
                              {distanceSpeedContextOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              className="w-14 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                              value={row.distance || ""}
                              onChange={(e) => updateSequenceRow(row.id, "distance", parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              title="Outside ECA Distance (nm)"
                            />
                            <span className="text-[10px] text-muted-foreground">&</span>
                            {/* L = Inside ECA with speed context selector */}
                            <select
                              className="h-5 w-8 text-[9px] font-medium border border-border rounded bg-background px-0.5"
                              value={row.ecaDistanceSpeedContext}
                              onChange={(e) => updateSequenceRow(row.id, "ecaDistanceSpeedContext", e.target.value as SpeedContext)}
                              title="Speed context for Inside ECA distance"
                            >
                              {ecaDistanceSpeedContextOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              className="w-12 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                              value={row.ecaDistance || ""}
                              onChange={(e) => updateSequenceRow(row.id, "ecaDistance", parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              title="Inside ECA Distance (nm)"
                            />
                          </div>
                          {/* Warning if coordinates missing for this leg */}
                          {index > 0 && autoDistanceEnabled && row.port && (
                            !row.coordinates || (row.coordinates[0] === 0 && row.coordinates[1] === 0)
                          ) && (
                            <span className="text-[8px] text-destructive leading-tight" title="Port coordinates not available. Distance cannot be calculated.">
                              ⚠ No coords – distance unavailable
                            </span>
                          )}
                        </div>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Sea Time - shows Base / +Margin / Total breakdown */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {row.type !== "open" ? (
                        <div className="flex flex-col gap-0.5">
                          {/* Row 1: Base and +SM% */}
                          <div className="flex items-center justify-center gap-1 text-[9px]">
                            <span className="text-muted-foreground" title="Base Sea Time = Distance ÷ Speed">
                              {row.baseSeaTime > 0 ? row.baseSeaTime.toFixed(2) : "0.00"}
                            </span>
                            {row.seaMarginTime > 0 && (
                              <span className="text-amber-600 dark:text-amber-400" title={`+${row.seaMargin}% Sea Margin`}>
                                +{row.seaMarginTime.toFixed(2)}
                              </span>
                            )}
                          </div>
                          {/* Row 2: Total (editable) */}
                          <input
                            type="number"
                            step="0.01"
                            className="w-full h-5 text-[11px] font-mono text-center border border-border rounded bg-background px-0.5 font-medium"
                            value={row.timeOverride !== undefined ? row.timeOverride : (row.totalLegTime > 0 ? formatTime(row.totalLegTime) : "")}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateSequenceRow(row.id, "timeOverride", val > 0 ? val : undefined as unknown as number);
                            }}
                            placeholder={row.totalLegTime > 0 ? formatTime(row.totalLegTime) : "0"}
                            title="Total Sea Time (Base + Sea Margin) - editable override"
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Port Draft Restriction - Max Draft input + Status */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {showQuantityFields(row) ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-0.5 justify-center">
                            <input
                              type="number"
                              step="0.1"
                              className="w-12 h-5 text-[10px] font-mono text-center border border-border rounded bg-background px-0.5"
                              value={row.portMaxDraft || ""}
                              onChange={(e) => updateSequenceRow(row.id, "portMaxDraft", parseFloat(e.target.value) || 0)}
                              placeholder="Max m"
                              title="Port maximum draft (m)"
                            />
                            <span className="text-[8px] text-muted-foreground">m</span>
                          </div>
                          {draftCheckResults[row.id] && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`text-[8px] font-bold px-1 py-0.5 rounded cursor-help ${
                                    draftCheckResults[row.id].status === "ACCESSIBLE"
                                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                  }`}>
                                    {draftCheckResults[row.id].status === "ACCESSIBLE" ? "✓ OK" : "✗ RESTRICTED"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-[10px] max-w-xs">
                                  <DraftCheckTooltip result={draftCheckResults[row.id]} />
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Cranes - editable, defaults from vessel */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {showQuantityFields(row) ? (
                        <input
                          type="number"
                          min="0"
                          max="10"
                          className="w-8 h-5 text-[11px] font-mono text-center border border-border rounded bg-background px-0.5"
                          value={row.cranes || ""}
                          onChange={(e) => updateSequenceRow(row.id, "cranes", parseInt(e.target.value) || 0)}
                          placeholder="0"
                          title="Number of cranes available at berth"
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* SM% - Sea Margin percentage (applies to sailing time only) */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {row.type !== "open" ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          className="w-10 h-5 text-[11px] font-mono text-center border border-border rounded bg-background px-0.5"
                          value={row.seaMargin || ""}
                          onChange={(e) => updateSequenceRow(row.id, "seaMargin", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          title="Sea Margin % - Increases sailing time for weather/routing buffer"
                        />
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
                          <span className="text-[9px] text-muted-foreground">mt</span>
                        </div>
                      ) : showBunkeringFields(row) ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-0.5">
                            <span className="text-[8px] text-muted-foreground w-8">HSFO:</span>
                            <input
                              type="number"
                              className="w-10 h-4 text-[10px] font-mono text-right border border-border rounded bg-background px-0.5"
                              value={row.bunkeringHsfo || ""}
                              onChange={(e) => updateSequenceRow(row.id, "bunkeringHsfo", parseFloat(e.target.value) || 0)}
                              placeholder="0"
                            />
                            <span className="text-[8px] text-muted-foreground">t</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-[8px] text-muted-foreground w-8">VLSFO:</span>
                            <input
                              type="number"
                              className="w-10 h-4 text-[10px] font-mono text-right border border-border rounded bg-background px-0.5"
                              value={row.bunkeringVlsfo || ""}
                              onChange={(e) => updateSequenceRow(row.id, "bunkeringVlsfo", parseFloat(e.target.value) || 0)}
                              placeholder="0"
                            />
                            <span className="text-[8px] text-muted-foreground">t</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-[8px] text-muted-foreground w-8">LSMGO:</span>
                            <input
                              type="number"
                              className="w-10 h-4 text-[10px] font-mono text-right border border-border rounded bg-background px-0.5"
                              value={row.bunkeringLsmgo || ""}
                              onChange={(e) => updateSequenceRow(row.id, "bunkeringLsmgo", parseFloat(e.target.value) || 0)}
                              placeholder="0"
                            />
                            <span className="text-[8px] text-muted-foreground">t</span>
                          </div>
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
                            className="w-11 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                            value={row.productivity || ""}
                            onChange={(e) => updateSequenceRow(row.id, "productivity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-[9px] text-muted-foreground">mt/d</span>
                          <select
                            className="h-5 text-[10px] border border-border rounded bg-background px-0.5"
                            value={row.terms || "shinc"}
                            onChange={(e) => {
                              updateSequenceRow(row.id, "terms", e.target.value);
                              // Auto-set coefficient factor based on terms
                              const defaultCoeff = e.target.value === "sshex" ? 1.5 : e.target.value === "fhex" ? 1.25 : e.target.value === "satpn" ? 1.33 : 1.0;
                              updateSequenceRow(row.id, "coefficientFactor", defaultCoeff);
                            }}
                          >
                            {termsOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            className="w-9 h-5 text-[10px] font-mono text-center border border-border rounded bg-background px-0.5"
                            value={row.coefficientFactor || ""}
                            onChange={(e) => updateSequenceRow(row.id, "coefficientFactor", parseFloat(e.target.value) || 0)}
                            placeholder="1.0"
                            title="Coefficient factor for terms (shinc=1.0, sshex=1.5, fhex=1.25, satpn=1.33)"
                          />
                        </div>
                      ) : showBunkeringFields(row) ? (
                        <span className="text-[10px] text-muted-foreground">bunker ops</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Port Fuel Type */}
                    <td className="px-1 py-0.5 border border-border text-center">
                      {row.type === "port" ? (
                        <select
                          className="h-5 w-14 text-[9px] border border-border rounded bg-background px-0.5"
                          value={row.portFuelType || "vlsfo"}
                          onChange={(e) => updateSequenceRow(row.id, "portFuelType", e.target.value)}
                          title="Fuel type used during port operations"
                        >
                          {vessel.hasScrubber && <option value="hsfo">HSFO</option>}
                          <option value="vlsfo">VLSFO</option>
                          <option value="lsmgo">LSMGO</option>
                        </select>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Turn Time (displayed in days) */}
                    <td className="px-1 py-0.5 border border-border">
                      {row.type === "port" ? (
                        <div className="flex items-center justify-center">
                          <input
                            type="number"
                            step="0.01"
                            className="w-10 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                            value={row.turnTime || ""}
                            onChange={(e) => updateSequenceRow(row.id, "turnTime", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            title="Turn time in hours"
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-center block">—</span>
                      )}
                    </td>

                    {/* Extra Time (in hours) */}
                    <td className="px-1 py-0.5 border border-border">
                      {row.type === "port" ? (
                        <div className="flex items-center gap-0.5 justify-center">
                          <input
                            type="number"
                            className="w-8 h-5 text-[11px] font-mono text-right border border-border rounded bg-background px-0.5"
                            value={row.extraTime || ""}
                            onChange={(e) => updateSequenceRow(row.id, "extraTime", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
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
              className="px-2 py-1 text-[10px] font-medium border border-border rounded hover:bg-muted flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              Add sequence
            </button>
            <button 
              onClick={addRepositioning} 
              className="px-2 py-1 text-[10px] font-medium border border-border rounded hover:bg-muted"
            >
              Repos
            </button>
            <div className="flex-1" />
            
            <div className="flex items-center gap-1.5">
              <Checkbox 
                id="auto-dist"
                checked={autoDistanceEnabled}
                onCheckedChange={(checked) => setAutoDistanceEnabled(checked === true)}
                className="h-3 w-3"
              />
              <label htmlFor="auto-dist" className="text-[10px] text-muted-foreground cursor-pointer">
                Auto dist.
              </label>
            </div>
            
            <button 
              onClick={recalculateDistances}
              className="px-2 py-1 text-[10px] font-medium border border-border rounded hover:bg-muted flex items-center gap-1"
              disabled={autoDistanceEnabled}
              title="Recalculate distances between ports"
            >
              <RefreshCw className="h-3 w-3" />
              Get distances
            </button>
          </div>

          {/* Sequence Summary */}
          <SequenceSummary />
        </div>
      )}
    </div>
  );
}

// Draft Check Tooltip component
function DraftCheckTooltip({ result }: { result: DraftCheckResult }) {
  return (
    <div className="space-y-1">
      <div className="font-semibold">{result.portName} — {result.status}</div>
      {result.error && <div className="text-destructive">{result.error}</div>}
      {result.effectiveDraft !== undefined && (
        <div>Effective Draft: {result.effectiveDraft.toFixed(2)} m</div>
      )}
      {result.availableDraft !== undefined && (
        <div>Available Draft: {result.availableDraft.toFixed(2)} m</div>
      )}
      {result.maxWeightDraft !== undefined && (
        <div>Max by Draft: {result.maxWeightDraft.toLocaleString()} mt</div>
      )}
      {result.maxWeightVolume !== undefined && result.maxWeightVolume !== Infinity && (
        <div>Max by Volume: {result.maxWeightVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} mt</div>
      )}
      {result.maxWeightDwt !== undefined && (
        <div>Max by DWT: {result.maxWeightDwt.toLocaleString()} mt</div>
      )}
      {result.maxLoadableCargo !== undefined && (
        <div className="font-medium">Max Loadable: {result.maxLoadableCargo.toLocaleString()} mt ({result.limitingFactor})</div>
      )}
      {result.newDraft !== undefined && (
        <div>New Draft: {result.newDraft.toFixed(2)} m</div>
      )}
      {result.reasons && result.reasons.length > 0 && (
        <div className="text-destructive">
          {result.reasons.map((r, i) => <div key={i}>⚠ {r}</div>)}
        </div>
      )}
    </div>
  );
}
