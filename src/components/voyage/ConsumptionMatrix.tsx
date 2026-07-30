import { useState } from "react";
import { type SpeedProfile, type ConsumptionMatrix as ConsumptionMatrixType } from "@/data/vessels";
import { useVoyageContext } from "@/context/VoyageContext";
import { getFieldId, matrixFieldKey } from "@/utils/validation";

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
  hasScrubber?: boolean;
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
  { key: "ballast", label: "Ballast" },
  { key: "laden", label: "Laden" },
  { key: "canal", label: "Canal" },
  { key: "load", label: "Load" },
  { key: "discharge", label: "Discharge" },
  { key: "idle", label: "Idle" },
];

export function ConsumptionMatrix({
  speedProfile,
  consumptionMatrix,
  loadDischIdleSame,
  onConsumptionChange,
  hasScrubber = false,
}: ConsumptionMatrixProps) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const { getFieldError } = useVoyageContext();
  const speedOnlyColumns: ColumnKey[] = ["ballast", "laden"];
  const thClass = "px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground text-center";
  const visibleRows = matrixRows.filter((row) => {
    if (row.key === "hsfo" || row.key === "aeScrubber") return hasScrubber;
    if (row.key === "vlsfo" || row.key === "ae") return !hasScrubber;
    return true;
  });

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
    <div className="overflow-x-auto w-full rounded-lg border border-[hsl(var(--dash-border))] bg-background">
      <table className="text-[10px] border-collapse table-fixed w-full min-w-[470px]">
        <thead>
          <tr className="bg-muted/60 border-b border-[hsl(var(--dash-border))]">
            <th className={`${thClass} text-left w-16 pl-2`}>{speedProfile === "eco" ? "Eco" : "Full"}</th>
            {columns.map(col => (
              <th key={col.key} className={`${thClass} w-[72px]`}>{col.label}</th>
            ))}
            <th className={`${thClass} w-12`}>Unit</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.key} className="border-b border-[hsl(var(--dash-border))]/60 last:border-0 hover:bg-muted/40 transition-colors">
              <td className="px-3 py-1 text-[10px] font-semibold text-foreground">{row.label}</td>
              {columns.map(col => {
                const isDisabled = loadDischIdleSame && (col.key === "discharge" || col.key === "idle");
                const isSpeedNA = row.key === "speed" && !speedOnlyColumns.includes(col.key);
                const value = consumptionMatrix[row.key][col.key];
                
                return (
                  <td key={col.key} className="px-1 py-1">
                    {isSpeedNA ? (
                      <div className="h-6 flex items-center justify-center text-[9px] text-muted-foreground/40">—</div>
                    ) : (
                      (() => {
                        const fieldKey = matrixFieldKey(row.key as string, col.key as string);
                        const err = !isDisabled ? getFieldError("vessel", fieldKey) : undefined;
                        return (
                      <input
                        id={getFieldId("vessel", fieldKey)}
                        aria-invalid={!!err}
                        title={err}
                        type="text"
                        inputMode="decimal"
                        className={`form-input-sm w-[62px] mx-auto block tabular-nums text-center h-6 text-[10px] px-1 ${isDisabled ? "opacity-50" : ""} ${err ? "border-destructive ring-1 ring-destructive" : ""}`}
                        value={getDisplayValue(row.key, col.key, value)}
                        onChange={(e) => handleInputChange(row.key, col.key, e.target.value)}
                        onFocus={() => handleInputFocus(row.key, col.key, value)}
                        onBlur={() => handleInputBlur(row.key, col.key)}
                        placeholder="0"
                        disabled={isDisabled}
                      />
                        );
                      })()
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-[9px] text-muted-foreground text-center">{getUnit(row.key)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
