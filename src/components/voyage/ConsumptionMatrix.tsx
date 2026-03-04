import { type SpeedProfile, type ConsumptionMatrix as ConsumptionMatrixType } from "@/data/vessels";
import { InfoTooltip } from "./InfoTooltip";

interface ConsumptionMatrixProps {
  speedProfile: SpeedProfile;
  consumptionMatrix: ConsumptionMatrixType;
  loadDischIdleSame: boolean;
  miscMultiplier: number;
  onSpeedProfileChange: (profile: SpeedProfile) => void;
  onConsumptionChange: (
    row: keyof ConsumptionMatrixType,
    col: keyof ConsumptionMatrixType["speed"],
    value: number
  ) => void;
  onLoadDischIdleChange: (checked: boolean) => void;
  onMiscMultiplierChange: (value: number) => void;
}

type MatrixRow = {
  key: keyof ConsumptionMatrixType;
  label: string;
  tooltip?: { formula: string; description?: string };
};

const matrixRows: MatrixRow[] = [
  { key: "speed", label: "Speed (kts)", tooltip: { formula: "Speed (knots) = Nautical Miles / Hour", description: "Speed in knots." } },
  { key: "hsfo", label: "HSFO cons.", tooltip: { formula: "MT/day at selected speed", description: "HSFO consumption per day." } },
  { key: "vlsfo", label: "VLSFO cons.", tooltip: { formula: "MT/day at selected speed", description: "VLSFO consumption per day." } },
  { key: "lsmgo", label: "LSMGO cons.", tooltip: { formula: "MT/day at selected speed", description: "LSMGO consumption per day." } },
  { key: "ae", label: "AE cons.", tooltip: { formula: "AE MT/day", description: "Auxiliary engine consumption." } },
  { key: "aeScrubber", label: "AE + Scrubber", tooltip: { formula: "AE+Scrubber MT/day", description: "AE with scrubber consumption." } },
];

type ColumnKey = keyof ConsumptionMatrixType["speed"];

const columns: { key: ColumnKey; label: string }[] = [
  { key: "ballast", label: "Ballast" },
  { key: "laden", label: "Laden" },
  { key: "canal", label: "Canal" },
  { key: "load", label: "Load" },
  { key: "discharge", label: "Disch" },
  { key: "idle", label: "Idle" },
  { key: "misc1", label: "Misc 1" },
  { key: "misc2", label: "Misc 2" },
];

export function ConsumptionMatrix({
  speedProfile,
  consumptionMatrix,
  loadDischIdleSame,
  onConsumptionChange,
}: ConsumptionMatrixProps) {
  const speedOnlyColumns: ColumnKey[] = ["ballast", "laden"];

  return (
    <div>
      <div className="subsection-header mb-3 rounded-md text-xs font-medium">
        Speed & Consumption Matrix ({speedProfile === "eco" ? "Eco" : "Full"})
      </div>
      
      {/* Matrix rendered as form groups per row */}
      <div className="space-y-3">
        {matrixRows.map((row) => (
          <div key={row.key} className="flex flex-wrap gap-3 items-end">
            <div className="w-28 flex items-center gap-1 text-xs font-medium text-muted-foreground pb-1">
              {row.label}
              {row.tooltip && <InfoTooltip formula={row.tooltip.formula} description={row.tooltip.description} />}
            </div>
            {columns.map(col => {
              const isDisabled = loadDischIdleSame && (col.key === "discharge" || col.key === "idle");
              const isSpeedNA = row.key === "speed" && !speedOnlyColumns.includes(col.key);
              const value = consumptionMatrix[row.key][col.key];
              
              return (
                <div key={col.key} className="form-field w-20">
                  <label className="text-[10px] text-muted-foreground text-center block">{col.label}</label>
                  {isSpeedNA ? (
                    <div className="h-7 flex items-center justify-center text-xs text-muted-foreground/40">—</div>
                  ) : (
                    <input
                      type="number"
                      step={row.key === "speed" ? "0.1" : "0.01"}
                      className={`form-input-sm w-full font-mono tabular-nums text-right ${isDisabled ? "opacity-50" : ""}`}
                      value={value || ""}
                      onChange={(e) => onConsumptionChange(row.key, col.key, parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      disabled={isDisabled}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
