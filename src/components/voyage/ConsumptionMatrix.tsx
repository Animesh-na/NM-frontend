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
};

const matrixRows: MatrixRow[] = [
  { key: "speed", label: "Speed" },
  { key: "hsfo", label: "HSFO" },
  { key: "vlsfo", label: "VLSFO" },
  { key: "lsmgo", label: "LSMGO" },
  { key: "ae", label: "AE" },
  { key: "aeScrubber", label: "AE+Scr" },
];

type ColumnKey = keyof ConsumptionMatrixType["speed"];

const columns: { key: ColumnKey; label: string }[] = [
  { key: "ballast", label: "Bal" },
  { key: "laden", label: "Ldn" },
  { key: "canal", label: "Cnl" },
  { key: "load", label: "Ld" },
  { key: "discharge", label: "Dis" },
  { key: "idle", label: "Idl" },
  { key: "misc1", label: "M1" },
  { key: "misc2", label: "M2" },
];

export function ConsumptionMatrix({
  speedProfile,
  consumptionMatrix,
  loadDischIdleSame,
  onConsumptionChange,
}: ConsumptionMatrixProps) {
  const speedOnlyColumns: ColumnKey[] = ["ballast", "laden"];
  const thClass = "px-1 py-0.5 text-[9px] font-semibold text-section-header-foreground text-center bg-table-header";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr>
            <th className={`${thClass} text-left w-14`}>{speedProfile === "eco" ? "Eco" : "Full"}</th>
            {columns.map(col => (
              <th key={col.key} className={thClass}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrixRows.map((row) => (
            <tr key={row.key}>
              <td className="px-1 py-0.5 text-[10px] font-medium text-muted-foreground bg-subsection-header">{row.label}</td>
              {columns.map(col => {
                const isDisabled = loadDischIdleSame && (col.key === "discharge" || col.key === "idle");
                const isSpeedNA = row.key === "speed" && !speedOnlyColumns.includes(col.key);
                const value = consumptionMatrix[row.key][col.key];
                
                return (
                  <td key={col.key} className="px-0.5 py-0.5">
                    {isSpeedNA ? (
                      <div className="h-5 flex items-center justify-center text-[10px] text-muted-foreground/40">—</div>
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
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}