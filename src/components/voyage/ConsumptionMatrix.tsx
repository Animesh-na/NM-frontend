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

  return (
    <div className="space-y-1">
      {/* Header row with profile selector and checkbox */}
      <div className="flex items-center gap-4">
        <select
          className="form-select text-xs w-40"
          value={speedProfile}
          onChange={(e) => onSpeedProfileChange(e.target.value as SpeedProfile)}
        >
          <option value="eco">Eco Speed&amp;Cons</option>
          <option value="full">Full Speed&amp;Cons</option>
        </select>
        
        <div className="flex items-center gap-1.5 ml-auto">
          <Checkbox
            id="loadDischIdle"
            checked={loadDischIdleSame}
            onCheckedChange={(checked) => onLoadDischIdleChange(checked === true)}
            className="h-3 w-3"
          />
          <label htmlFor="loadDischIdle" className="text-[10px] text-muted-foreground cursor-pointer">
            Load = Disch = Idle
          </label>
        </div>
        
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>x</span>
          <input
            type="number"
            className="form-input-sm w-10 font-mono tabular-nums text-center text-xs"
            value={miscMultiplier || ""}
            onChange={(e) => onMiscMultiplierChange(parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Consumption Matrix Table */}
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
                  const value = consumptionMatrix[row.key][col.key];
                  
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
