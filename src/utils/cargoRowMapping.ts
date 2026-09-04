/**
 * Cargo ↔ Sequence row mapping helpers.
 *
 * Single source of truth for figuring out which loading/discharging sequence
 * rows "belong" to which cargo. Used by:
 *   - VoyageContext (cargo qty aggregation + CP override resolution)
 *   - CargoSection UI (rendering the per-cargo CP block)
 *   - useVoyageCalculation (per-cargo gross-rate breakdown — indirectly
 *     via the overridden sequence quantities)
 *
 * Mapping rules (must mirror the calculation hook):
 *   - If ANY row has assignedCargoIds[], use that explicit mapping.
 *   - Otherwise auto-map by order: 1st load row → cargo #1, 2nd → cargo #2,
 *     etc.; same for discharge rows.
 */

export interface CargoLike {
  id: number;
}

export interface SeqRowLike {
  id: number;
  operation?: string;
  assignedCargoIds?: number[];
}

/** Returns Map<sequenceRowId, cargoId[]> for load + discharge rows. */
export function getCargoRowMap(
  cargos: CargoLike[],
  sequence: SeqRowLike[],
): Map<number, number[]> {
  const map = new Map<number, number[]>();

  // Single cargo: every load/discharge row belongs to that cargo by default,
  // regardless of explicit chip assignment.
  if (cargos.length === 1) {
    const only = cargos[0].id;
    sequence.forEach((r) => {
      const op = (r.operation || "").toLowerCase();
      if (op.startsWith("load") || op.startsWith("disch")) map.set(r.id, [only]);
    });
    return map;
  }

  const usesExplicit = sequence.some(
    (r) => (r.assignedCargoIds || []).length > 0,
  );

  if (usesExplicit) {
    sequence.forEach((r) => {
      const ids = r.assignedCargoIds || [];
      if (ids.length > 0) map.set(r.id, ids);
    });
    return map;
  }

  // Auto-map by sequence order.
  const loadRows: SeqRowLike[] = [];
  const dischRows: SeqRowLike[] = [];
  sequence.forEach((r) => {
    const op = (r.operation || "").toLowerCase();
    if (op.startsWith("load")) loadRows.push(r);
    else if (op.startsWith("disch")) dischRows.push(r);
  });

  cargos.forEach((c, ci) => {
    if (loadRows[ci]) map.set(loadRows[ci].id, [c.id]);
    if (dischRows[ci]) map.set(dischRows[ci].id, [c.id]);
  });
  return map;
}

/** Rows (load + discharge, in sequence order) assigned to a single cargo. */
export function getRowsForCargo<T extends SeqRowLike>(
  cargoId: number,
  cargos: CargoLike[],
  sequence: T[],
): T[] {
  const map = getCargoRowMap(cargos, sequence);
  return sequence.filter((r) => (map.get(r.id) || []).includes(cargoId));
}

/** Returns true if the row is assigned to the given cargo. */
export function rowHasCargo(
  row: SeqRowLike,
  cargoId: number,
  cargos: CargoLike[],
): boolean {
  const ids = row.assignedCargoIds || [];
  if (cargos.length === 1) return true;
  if (ids.length > 0) return ids.includes(cargoId);
  return false;
}
