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
  } = useVoyageContext();
  
  const [isExpanded, setIsExpanded] = useState(true);
  const { cargos = [] } = useVoyageContext();
  const globalStowageFactor = cargos[0]?.stowageFactor || 1.4;

  const draftCheckResults = useMemo(() => {
    const results: Record<number, DraftCheckResult> = {};
    for (const row of sequence) {
      if (row.type !== "port") continue;
      if (row.portMaxDraft <= 0) continue;
      if (row.operation !== "loading" && row.operation !== "discharging") continue;
      const cubicCapacity = vessel.cubic > 0 ? vessel.cubic : estimateCubicFromDwt(vessel.dwt);
      const sf = row.stowageFactor > 0 ? row.stowageFactor : globalStowageFactor;
      results[row.id] = calculateDraftRestriction({
        currentDraftM: vessel.draft, dwtMt: vessel.dwt, tpcMtPerCm: vessel.tpcTpi,
        shipCubicCapacityM3: cubicCapacity, portName: row.port, portMaxDraftM: row.portMaxDraft,
        ukcPercent: 0, stowageFactorM3PerMt: sf, requestedCargoMt: row.quantity,
      });
    }
    return results;
  }, [sequence, vessel, globalStowageFactor]);

  const handlePortChange = (id: number, port: Port | null) => {
    setSequence(prev => prev.map(row => 
      row.id === id ? { ...row, port: port?.name || "", portUnloc: port?.unloc || "", portId: port?.id, coordinates: port?.coordinates } : row
    ));
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

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Ship className="h-4 w-4" />
          <span>Sequence</span>
          <span className={`text-[10px] font-normal px-2 py-0.5 rounded-full ${
            vessel.speedProfile === "eco" 
              ? "bg-success/10 text-success" 
              : "bg-warning/10 text-warning"
          }`}>
            {vessel.speedProfile === "eco" ? "Eco" : "Full"}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
      </button>

      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* Sequence Entries - Card based */}
          {sequence.map((row, index) => (
            <SequenceCard
              key={row.id}
              row={row}
              index={index}
              vessel={vessel}
              distanceLoading={distanceLoading}
              autoDistanceEnabled={autoDistanceEnabled}
              draftCheckResult={draftCheckResults[row.id]}
              showQuantityFields={showQuantityFields(row)}
              showBunkeringFields={showBunkeringFields(row)}
              getTypeLabel={getTypeLabel(row)}
              onPortChange={(port) => handlePortChange(row.id, port)}
              onTypeChange={(value) => handleTypeChange(row.id, value)}
              onFieldChange={(field: keyof SequenceRowUI, value: any) => updateSequenceRow(row.id, field, value)}
              onRemove={() => removeSequence(row.id)}
              formatTime={formatTime}
            />
          ))}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <button 
              onClick={() => addPort("loading")} 
              className="btn-secondary flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Sequence
            </button>
            <button 
              onClick={addRepositioning} 
              className="btn-secondary"
            >
              Repos
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Checkbox 
                id="auto-dist"
                checked={autoDistanceEnabled}
                onCheckedChange={(checked) => setAutoDistanceEnabled(checked === true)}
                className="h-4 w-4"
              />
              <label htmlFor="auto-dist" className="text-xs text-muted-foreground cursor-pointer">
                Auto distance
              </label>
            </div>
            <button 
              onClick={recalculateDistances}
              className="btn-secondary flex items-center gap-1.5"
              disabled={autoDistanceEnabled}
              title="Recalculate distances between ports"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Get Distances
            </button>
          </div>

          <SequenceSummary />
        </div>
      )}
    </div>
  );
}

// ─── Sequence Card Component ───────────────────────────────────────

interface SequenceCardProps {
  row: SequenceRowUI;
  index: number;
  vessel: any;
  distanceLoading: boolean;
  autoDistanceEnabled: boolean;
  draftCheckResult?: DraftCheckResult;
  showQuantityFields: boolean;
  showBunkeringFields: boolean;
  getTypeLabel: string;
  onPortChange: (port: Port | null) => void;
  onTypeChange: (value: string) => void;
  onFieldChange: (field: keyof SequenceRowUI, value: any) => void;
  onRemove: () => void;
  formatTime: (days: number) => string;
}

function SequenceCard({
  row, index, vessel, distanceLoading, autoDistanceEnabled,
  draftCheckResult, showQuantityFields, showBunkeringFields, getTypeLabel,
  onPortChange, onTypeChange, onFieldChange, onRemove, formatTime,
}: SequenceCardProps) {
  const isOpen = row.type === "open";

  return (
    <div className="bg-card border border-border rounded-md p-4 space-y-3 relative">
      {/* Remove button */}
      {!isOpen && (
        <button
          onClick={onRemove}
          className="absolute top-3 right-3 p-1 hover:bg-destructive/10 rounded text-destructive/60 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Row 1: Type + Port + Season (for open) */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="form-field w-24">
          <label className="form-label">Type</label>
          {isOpen ? (
            <div className="h-7 flex items-center text-xs font-semibold text-primary">Open</div>
          ) : row.type === "repos" ? (
            <div className="h-7 flex items-center text-xs font-semibold text-muted-foreground">Repos</div>
          ) : (
            <select
              className="form-select-sm w-full"
              value={getTypeLabel}
              onChange={(e) => onTypeChange(e.target.value)}
            >
              <option value="load">Load</option>
              <option value="disch">Discharge</option>
              <option value="bkrg">Bunkering</option>
              <option value="pssg">Passage</option>
            </select>
          )}
        </div>

        <div className="form-field flex-1 min-w-[180px]">
          <label className="form-label">Port</label>
          <PortSelect
            value={row.port}
            onChange={onPortChange}
            placeholder="Select port..."
          />
        </div>

        {isOpen && (
          <div className="form-field w-28">
            <label className="form-label">Season</label>
            <select
              className="form-select-sm w-full"
              value={row.season || "summer"}
              onChange={(e) => onFieldChange("season", e.target.value as Season)}
            >
              {seasonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {showQuantityFields && (
          <div className="form-field w-20">
            <label className="form-label">Cargo</label>
            <div className="h-7 flex items-center text-xs font-semibold text-primary">#1</div>
          </div>
        )}
      </div>

      {/* Row 2: Distance, Sea Time, Sea Margin (non-open rows) */}
      {!isOpen && (
        <div className="flex flex-wrap gap-4 items-end">
          {/* Distance */}
          <div className="form-field w-36">
            <label className="form-label">Distance (V)</label>
            {distanceLoading ? (
              <div className="h-7 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Calculating...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <select
                  className="form-select-sm w-14"
                  value={row.distanceSpeedContext}
                  onChange={(e) => onFieldChange("distanceSpeedContext", e.target.value)}
                >
                  {distanceSpeedContextOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="form-input-sm flex-1 font-mono text-right"
                  value={row.distance || ""}
                  onChange={(e) => onFieldChange("distance", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  title="Outside ECA Distance (nm)"
                />
              </div>
            )}
          </div>

          <div className="form-field w-32">
            <label className="form-label">ECA Distance (L)</label>
            <div className="flex items-center gap-1">
              <select
                className="form-select-sm w-14"
                value={row.ecaDistanceSpeedContext}
                onChange={(e) => onFieldChange("ecaDistanceSpeedContext", e.target.value)}
              >
                {ecaDistanceSpeedContextOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <input
                type="number"
                className="form-input-sm flex-1 font-mono text-right"
                value={row.ecaDistance || ""}
                onChange={(e) => onFieldChange("ecaDistance", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Sea Time */}
          <div className="form-field w-28">
            <label className="form-label">
              Sea Time (d)
              {row.baseSeaTime > 0 && (
                <span className="ml-1 text-muted-foreground/60 font-normal">
                  base: {row.baseSeaTime.toFixed(2)}
                  {row.seaMarginTime > 0 && <span className="text-warning"> +{row.seaMarginTime.toFixed(2)}</span>}
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              className="form-input-sm w-full font-mono text-right"
              value={row.timeOverride !== undefined ? row.timeOverride : (row.totalLegTime > 0 ? formatTime(row.totalLegTime) : "")}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onFieldChange("timeOverride", val > 0 ? val : undefined);
              }}
              placeholder={row.totalLegTime > 0 ? formatTime(row.totalLegTime) : "0"}
              title="Total Sea Time (editable override)"
            />
          </div>

          {/* Sea Margin */}
          <div className="form-field w-20">
            <label className="form-label">SM%</label>
            <input
              type="number"
              min="0" max="100" step="0.5"
              className="form-input-sm w-full font-mono text-right"
              value={row.seaMargin || ""}
              onChange={(e) => onFieldChange("seaMargin", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          {/* Expected DA */}
          <div className="form-field w-24">
            <label className="form-label">Exp DA ($)</label>
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={row.expDa || ""}
              onChange={(e) => onFieldChange("expDa", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
        </div>
      )}

      {/* Row 3: Quantity, Terms, Port-specific fields (for load/disch) */}
      {showQuantityFields && (
        <div className="flex flex-wrap gap-4 items-end">
          <div className="form-field w-28">
            <label className="form-label">Quantity (mt)</label>
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={row.quantity || ""}
              onChange={(e) => onFieldChange("quantity", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          <div className="form-field w-28">
            <label className="form-label">Productivity</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                className="form-input-sm flex-1 font-mono text-right"
                value={row.productivity || ""}
                onChange={(e) => onFieldChange("productivity", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
              <span className="text-xs text-muted-foreground">mt/d</span>
            </div>
          </div>

          <div className="form-field w-24">
            <label className="form-label">Terms</label>
            <select
              className="form-select-sm w-full"
              value={row.terms || "shinc"}
              onChange={(e) => {
                onFieldChange("terms", e.target.value);
                const defaultCoeff = e.target.value === "sshex" ? 1.5 : e.target.value === "fhex" ? 1.25 : e.target.value === "satpn" ? 1.33 : 1.0;
                onFieldChange("coefficientFactor", defaultCoeff);
              }}
            >
              {termsOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field w-20">
            <label className="form-label">Coeff</label>
            <input
              type="number"
              step="0.01"
              className="form-input-sm w-full font-mono text-center"
              value={row.coefficientFactor || ""}
              onChange={(e) => onFieldChange("coefficientFactor", parseFloat(e.target.value) || 0)}
              placeholder="1.0"
            />
          </div>

          <div className="form-field w-20">
            <label className="form-label">Cranes</label>
            <input
              type="number"
              min="0" max="10"
              className="form-input-sm w-full font-mono text-center"
              value={row.cranes || ""}
              onChange={(e) => onFieldChange("cranes", parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          <div className="form-field w-24">
            <label className="form-label">Port Draft (m)</label>
            <input
              type="number"
              step="0.1"
              className="form-input-sm w-full font-mono text-right"
              value={row.portMaxDraft || ""}
              onChange={(e) => onFieldChange("portMaxDraft", parseFloat(e.target.value) || 0)}
              placeholder="Max"
            />
            {draftCheckResult && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block cursor-help ${
                      draftCheckResult.status === "ACCESSIBLE"
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive"
                    }`}>
                      {draftCheckResult.status === "ACCESSIBLE" ? "✓ OK" : "✗ RESTRICTED"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-xs">
                    <DraftCheckTooltip result={draftCheckResult} />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      )}

      {/* Bunkering fields */}
      {showBunkeringFields && (
        <div className="flex flex-wrap gap-4 items-end">
          <div className="form-field w-24">
            <label className="form-label">HSFO (t)</label>
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={row.bunkeringHsfo || ""}
              onChange={(e) => onFieldChange("bunkeringHsfo", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <div className="form-field w-24">
            <label className="form-label">VLSFO (t)</label>
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={row.bunkeringVlsfo || ""}
              onChange={(e) => onFieldChange("bunkeringVlsfo", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <div className="form-field w-24">
            <label className="form-label">LSMGO (t)</label>
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={row.bunkeringLsmgo || ""}
              onChange={(e) => onFieldChange("bunkeringLsmgo", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
        </div>
      )}

      {/* Row 4: Port operation fields (turn time, extra time, fuel type) */}
      {!isOpen && row.type === "port" && (
        <div className="flex flex-wrap gap-4 items-end">
          <div className="form-field w-24">
            <label className="form-label">Turn Time (h)</label>
            <input
              type="number"
              step="0.01"
              className="form-input-sm w-full font-mono text-right"
              value={row.turnTime || ""}
              onChange={(e) => onFieldChange("turnTime", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <div className="form-field w-24">
            <label className="form-label">Extra Time (h)</label>
            <input
              type="number"
              className="form-input-sm w-full font-mono text-right"
              value={row.extraTime || ""}
              onChange={(e) => onFieldChange("extraTime", parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <div className="form-field w-24">
            <label className="form-label">Port Fuel</label>
            <select
              className="form-select-sm w-full"
              value={row.portFuelType || "vlsfo"}
              onChange={(e) => onFieldChange("portFuelType", e.target.value)}
            >
              {vessel.hasScrubber && <option value="hsfo">HSFO</option>}
              <option value="vlsfo">VLSFO</option>
              <option value="lsmgo">LSMGO</option>
            </select>
          </div>
        </div>
      )}

      {/* Coordinate warning */}
      {!isOpen && index > 0 && autoDistanceEnabled && row.port && (
        !row.coordinates || (row.coordinates[0] === 0 && row.coordinates[1] === 0)
      ) && (
        <p className="text-[10px] text-destructive">
          ⚠ No coordinates – distance unavailable
        </p>
      )}
    </div>
  );
}

// ─── Draft Check Tooltip ───────────────────────────────────────────

function DraftCheckTooltip({ result }: { result: DraftCheckResult }) {
  return (
    <div className="space-y-1">
      <div className="font-semibold">{result.portName} — {result.status}</div>
      {result.error && <div className="text-destructive">{result.error}</div>}
      {result.effectiveDraft !== undefined && <div>Effective Draft: {result.effectiveDraft.toFixed(2)} m</div>}
      {result.availableDraft !== undefined && <div>Available Draft: {result.availableDraft.toFixed(2)} m</div>}
      {result.maxWeightDraft !== undefined && <div>Max by Draft: {result.maxWeightDraft.toLocaleString()} mt</div>}
      {result.maxWeightVolume !== undefined && result.maxWeightVolume !== Infinity && (
        <div>Max by Volume: {result.maxWeightVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} mt</div>
      )}
      {result.maxWeightDwt !== undefined && <div>Max by DWT: {result.maxWeightDwt.toLocaleString()} mt</div>}
      {result.maxLoadableCargo !== undefined && (
        <div className="font-medium">Max Loadable: {result.maxLoadableCargo.toLocaleString()} mt ({result.limitingFactor})</div>
      )}
      {result.newDraft !== undefined && <div>New Draft: {result.newDraft.toFixed(2)} m</div>}
      {result.reasons && result.reasons.length > 0 && (
        <div className="text-destructive">
          {result.reasons.map((r, i) => <div key={i}>⚠ {r}</div>)}
        </div>
      )}
    </div>
  );
}
