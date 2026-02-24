import { type SpeedProfile, type ConsumptionMatrix as ConsumptionMatrixType } from "@/data/vessels";
import { Checkbox } from "@/components/ui/checkbox";
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
  { key: "speed", label: "Spd (kts)", tooltip: { formula: "Speed (knots) = Nautical Miles / Hour", description: "Speed is measured in knots (nautical miles per hour)." } },
  { key: "hsfo", label: "HSFO cons.", tooltip: { formula: "Consumption (MT/day) at selected speed", description: "Fuel consumption values are calculated per day (MT/day) at the selected speed." } },
  { key: "vlsfo", label: "VLSFO cons.", tooltip: { formula: "Consumption (MT/day) at selected speed", description: "Fuel consumption values are calculated per day (MT/day) at the selected speed." } },
  { key: "lsmgo", label: "LSMGO cons.", tooltip: { formula: "Consumption (MT/day) at selected speed", description: "Fuel consumption values are calculated per day (MT/day) at the selected speed." } },
  { key: "ae", label: "AE cons.", tooltip: { formula: "AE Consumption (MT/day)", description: "Auxiliary engine fuel consumption per day (MT/day)." } },
  { key: "aeScrubber", label: "AE + scrubber cons.", tooltip: { formula: "AE + Scrubber Consumption (MT/day)", description: "Auxiliary engine with scrubber fuel consumption per day (MT/day)." } },
];

type ColumnKey = keyof ConsumptionMatrixType["speed"];

interface Column {
  key: ColumnKey;
  label: string;
  ecoLabel: string;
}

const columns: Column[] = [
  { key: "ballast", label: "Ballast", ecoLabel: "Eco Ballast" },
  { key: "laden", label: "Laden", ecoLabel: "Eco Laden" },
  { key: "canal", label: "Canal", ecoLabel: "Canal" },
  { key: "load", label: "Load", ecoLabel: "Load" },
  { key: "discharge", label: "Disch", ecoLabel: "Disch" },
  { key: "idle", label: "Idle", ecoLabel: "Idle" },
  { key: "misc1", label: "Misc (1)", ecoLabel: "Misc (1)" },
  { key: "misc2", label: "Misc (2)", ecoLabel: "Misc (2)" },
];

export function ConsumptionMatrix({
  speedProfile,
  consumptionMatrix,
  loadDischIdleSame,
  miscMultiplier,
  onSpeedProfileChange,
  onConsumptionChange,
  onLoadDischIdleChange,
  onMiscMultiplierChange,
}: ConsumptionMatrixProps) {
  const isEco = speedProfile === "eco";

  // Speed row only applies to ballast and laden
  const speedOnlyColumns: ColumnKey[] = ["ballast", "laden"];

  return (
    <div className="space-y-1">
      {/* Consumption Matrix Table - no header controls, moved to VesselPanel row 2 */}
      <div className="overflow-x-auto">
        <table className="data-table w-full text-[10px]">
          <thead>
            <tr>
              <th className="w-24 text-left"></th>
              {columns.map(col => (
                <th key={col.key} className="w-16 text-center font-medium">
                  {isEco && (col.key === "ballast" || col.key === "laden") ? col.ecoLabel : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixRows.map((row) => (
              <tr key={row.key}>
                <td className="font-medium text-left whitespace-nowrap">
                  <span className="inline-flex items-center">
                    {row.label}
                    {row.tooltip && <InfoTooltip formula={row.tooltip.formula} description={row.tooltip.description} />}
                  </span>
                </td>
                {columns.map(col => {
                  const isDisabled = loadDischIdleSame && (col.key === "discharge" || col.key === "idle");
                  // Speed row: only ballast and laden are editable
                  const isSpeedNA = row.key === "speed" && !speedOnlyColumns.includes(col.key);
                  const value = consumptionMatrix[row.key][col.key];
                  
                  if (isSpeedNA) {
                    return (
                      <td key={col.key} className="p-0 text-center text-muted-foreground/40">
                        —
                      </td>
                    );
                  }

                  return (
                    <td key={col.key} className="p-0">
                      <input
                        type="number"
                        step={row.key === "speed" ? "0.1" : "0.01"}
                        className={`w-full bg-transparent font-mono tabular-nums text-right text-[10px] px-1 py-0 h-5
                          focus:outline-none focus:bg-background focus:ring-1 focus:ring-ring
                          ${isDisabled ? "bg-muted/50 text-muted-foreground" : ""}`}
                        value={value || ""}
                        onChange={(e) => onConsumptionChange(row.key, col.key, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        disabled={isDisabled}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
