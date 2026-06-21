import { useState } from "react";
import { type SpeedProfile, type ConsumptionMatrix as ConsumptionMatrixType } from "@/data/vessels";

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
];

export function ConsumptionMatrix({
  speedProfile,
  consumptionMatrix,
  loadDischIdleSame,
  onConsumptionChange,
}: ConsumptionMatrixProps) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const speedOnlyColumns: ColumnKey[] = ["ballast", "laden"];
  const thClass = "px-0.5 py-0 text-[9px] font-semibold text-foreground text-center bg-table-header";

  const getUnit = (rowKey: string): string => {
    if (rowKey === "speed") return "kn";
    if (rowKey === "ae" || rowKey === "aeScrubber") return "mt/d";
    return "mt/d";
  };

  const getCellKey = (rowKey: keyof ConsumptionMatrixType, colKey: ColumnKey) => `${rowKey}:${colKey}`;

  const getDisplayValue = (
    rowKey: keyof ConsumptionMatrixType,
    colKey: ColumnKey,
    numericValue: number,
  ): string => {
    const draftValue = draftValues[getCellKey(rowKey, colKey)];
    if (draftValue !== undefined) return draftValue;
    if (numericValue === 0) return "";
    // Display max 2 decimals (truncated). Underlying value keeps full precision.
    const truncated = Math.trunc(numericValue * 100) / 100;
    // Drop trailing zeros for cleaner display (e.g. 12 not 12.00, 12.5 not 12.50).
    return String(truncated);
  };

  const handleInputFocus = (
    rowKey: keyof ConsumptionMatrixType,
    colKey: ColumnKey,
    numericValue: number,
  ) => {
    setDraftValues((prev) => ({
      ...prev,
      [getCellKey(rowKey, colKey)]: numericValue === 0 ? "" : String(numericValue),
    }));
  };

  const handleInputChange = (
    rowKey: keyof ConsumptionMatrixType,
    colKey: ColumnKey,
    rawValue: string,
  ) => {
    let nextValue = rawValue.replace(/,/g, ".");

    if (nextValue.startsWith(".")) {
      nextValue = `0${nextValue}`;
    }

    if (!/^\d*\.?\d*$/.test(nextValue)) {
      return;
    }

    setDraftValues((prev) => ({
      ...prev,
      [getCellKey(rowKey, colKey)]: nextValue,
    }));

    onConsumptionChange(rowKey, colKey, parseFloat(nextValue) || 0);
  };

  const handleInputBlur = (
    rowKey: keyof ConsumptionMatrixType,
    colKey: ColumnKey,
  ) => {
    const key = getCellKey(rowKey, colKey);
    const rawValue = draftValues[key] ?? "";
    const normalizedValue = rawValue.endsWith(".") ? rawValue.slice(0, -1) : rawValue;

    setDraftValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    onConsumptionChange(rowKey, colKey, parseFloat(normalizedValue) || 0);
  };

  return (
    <div className="overflow-x-auto w-full">
      <table className="text-[10px] border-collapse w-full">
        <thead>
          <tr>
            <th className={`${thClass} text-left w-12`}>{speedProfile === "eco" ? "Eco" : "Full"}</th>
            {columns.map(col => (
              <th key={col.key} className={`${thClass} px-1`}>{col.label}</th>
            ))}
            <th className={`${thClass} w-8`}>Unit</th>
          </tr>
        </thead>
        <tbody>
          {matrixRows.map((row) => (
            <tr key={row.key}>
              <td className="px-1 py-0 text-[10px] font-bold text-foreground bg-subsection-header">{row.label}</td>
              {columns.map(col => {
                const isDisabled = loadDischIdleSame && (col.key === "discharge" || col.key === "idle");
                const isSpeedNA = row.key === "speed" && !speedOnlyColumns.includes(col.key);
                const value = consumptionMatrix[row.key][col.key];
                
                return (
                  <td key={col.key} className="px-1 py-0">
                    {isSpeedNA ? (
                      <div className="h-4 flex items-center justify-center text-[9px] text-muted-foreground/40">—</div>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`form-input-sm w-14 max-w-full ml-auto block font-mono tabular-nums text-right h-4 text-[9px] px-1.5 ${isDisabled ? "opacity-50" : ""}`}
                        value={getDisplayValue(row.key, col.key, value)}
                        onChange={(e) => handleInputChange(row.key, col.key, e.target.value)}
                        onFocus={() => handleInputFocus(row.key, col.key, value)}
                        onBlur={() => handleInputBlur(row.key, col.key)}
                        placeholder="0"
                        disabled={isDisabled}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-1 py-0 text-[8px] text-muted-foreground text-center">{getUnit(row.key)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
