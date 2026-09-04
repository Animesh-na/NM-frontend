import type { CargoEntry, SequenceRowUI } from "@/context/VoyageContext";
import { getCargoRowMap } from "@/utils/cargoRowMapping";

export interface CargoValidationError {
  cargoId: number;
  cargoLabel: string;
  message: string;
  loaded: number;
  discharged: number;
}

export interface CargoValidationResult {
  errors: CargoValidationError[];
  hasErrors: boolean;
  /** True when at least one row uses explicit cargo assignment. */
  usesExplicitMapping: boolean;
}

const EPS = 0.001; // 1 kg tolerance on MT

function sumQty(
  rows: SequenceRowUI[],
  op: "loading" | "discharging",
  cargoId: number,
  rowMap: Map<number, number[]>,
): number {
  return rows
    .filter((r) => r.operation === op && (rowMap.get(r.id) || []).includes(cargoId))
    .reduce((s, r) => s + (r.quantity || 0), 0);
}

export function validateCargoAssignments(
  cargos: CargoEntry[],
  sequence: SequenceRowUI[],
): CargoValidationResult {
  const usesExplicitMapping =
    cargos.length === 1 ||
    sequence.some((r) => Array.isArray(r.assignedCargoIds) && r.assignedCargoIds.length > 0);
  const rowMap = getCargoRowMap(cargos, sequence);

  const errors: CargoValidationError[] = [];
  if (!usesExplicitMapping) {
    return { errors, hasErrors: false, usesExplicitMapping };
  }

  cargos.forEach((cargo, idx) => {
    const label = `Cargo #${idx + 1}`;
    const loaded = sumQty(sequence, "loading", cargo.id, rowMap);
    const discharged = sumQty(sequence, "discharging", cargo.id, rowMap);

    if (loaded === 0 && discharged === 0) {
      // Cargo not assigned anywhere — skip validation (treated as unused).
      return;
    }

    if (loaded > 0 && discharged === 0) {
      errors.push({
        cargoId: cargo.id,
        cargoLabel: label,
        message: `${label} loaded ${loaded.toLocaleString()} MT but has no assigned discharge port.`,
        loaded,
        discharged,
      });
      return;
    }

    if (loaded === 0 && discharged > 0) {
      errors.push({
        cargoId: cargo.id,
        cargoLabel: label,
        message: `${label} has discharge assignments but no load port.`,
        loaded,
        discharged,
      });
      return;
    }

    const diff = discharged - loaded;
    if (Math.abs(diff) > EPS) {
      const verb = diff > 0 ? "over-discharge" : "under-discharge";
      errors.push({
        cargoId: cargo.id,
        cargoLabel: label,
        message: `${label} discharge quantity must equal loaded quantity (loaded ${loaded.toLocaleString()} MT, discharged ${discharged.toLocaleString()} MT — ${verb} by ${Math.abs(diff).toLocaleString()} MT).`,
        loaded,
        discharged,
      });
    }
  });

  return { errors, hasErrors: errors.length > 0, usesExplicitMapping };
}

/** Per-cargo loaded qty across all assigned load ports. Falls back to sequence total split equally when no assignments. */
export function getCargoLoadedQuantities(
  cargos: CargoEntry[],
  sequence: SequenceRowUI[],
): Map<number, number> {
  const map = new Map<number, number>();
  const usesMapping =
    cargos.length === 1 || sequence.some((r) => (r.assignedCargoIds || []).length > 0);
  const rowMap = getCargoRowMap(cargos, sequence);

  if (usesMapping) {
    cargos.forEach((c) => map.set(c.id, sumQty(sequence, "loading", c.id, rowMap)));
    return map;
  }

  // Fallback: split total load qty evenly across cargos (legacy behaviour).
  const total = sequence
    .filter((r) => r.operation === "loading")
    .reduce((s, r) => s + (r.quantity || 0), 0);
  const share = cargos.length > 0 ? total / cargos.length : 0;
  cargos.forEach((c) => map.set(c.id, share));
  return map;
}