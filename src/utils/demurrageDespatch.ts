import type { CargoEntry, SequenceRowUI } from "@/context/VoyageContext";
import { getRowsForCargo } from "@/utils/cargoRowMapping";
import { getApiMode } from "@/services/apiMode";

type CpOverride = {
  quantity?: number;
  productivity?: number;
  demurrage?: number;
  despatch?: number;
  turnTime?: number;
  extraTime?: number;
  terms?: string;
  coefficientFactor?: number;
  layTime?: number;
};
type OpOverride = {
  quantity?: number;
  productivity?: number;
  turnTime?: number;
  extraTime?: number;
  terms?: string;
  coefficientFactor?: number;
  layTime?: number;
};

export interface DemurrageDespatchRow {
  rowId: number;
  port: string;
  operation?: string;
  cpDays: number;
  opDays: number;
  diffDays: number;
  demurrageRate: number;
  despatchRate: number;
}

export interface DemurrageDespatchCargoResult {
  cargoId: number;
  rows: DemurrageDespatchRow[];
  totalExtraDays: number;
  demurrageAmount: number;
  despatchAmount: number;
}

function isCargoOperation(operation?: string): boolean {
  const op = (operation || "").toLowerCase();
  return op === "loading" || op === "load" || op === "discharging" || op === "disch";
}

export function calculatePortDaysForDemurrage(
  row: SequenceRowUI,
  override?: CpOverride | OpOverride,
): number {
  if (row.type === "open" || row.type === "repos") return 0;
  if (!isCargoOperation(row.operation)) return 0;

  const ov = (override || {}) as CpOverride & OpOverride;
  const turnTime = Number(ov.turnTime ?? row.turnTime) || 0;
  const extraTime = Number(ov.extraTime ?? row.extraTime) || 0;

  // Tanker sheets have no mt/day productivity or terms — port time is driven by
  // the agreed laytime (hours) plus turn/extra time.
  if (getApiMode() === "tanker") {
    const layTime = Number(ov.layTime ?? row.layTime) || 0;
    return (layTime + turnTime + extraTime) / 24;
  }

  const quantity = ov.quantity ?? row.quantity ?? 0;
  const productivity = ov.productivity ?? row.productivity ?? 0;
  if (productivity <= 0 || quantity <= 0) return (turnTime + extraTime) / 24;

  const terms = (ov.terms ?? row.terms) as string | undefined;
  const factor = ov.coefficientFactor ?? row.coefficientFactor;
  const termsMultiplier = factor || (terms === "sshex" ? 1.5555 : terms === "shex" ? 1.2727 : terms === "satpm" ? 1.3333 : 1.0);
  return (quantity / productivity) * termsMultiplier + (turnTime + extraTime) / 24;
}

export function calculateCargoDemurrageDespatchFromRows(
  cargo: CargoEntry,
  rows: SequenceRowUI[],
): DemurrageDespatchCargoResult {
  const isActive = (cargo.demurrageRate || 0) > 0 || (cargo.despatchRate || 0) > 0;
  const rowBreakdown = rows.filter((row) => isCargoOperation(row.operation)).map((row) => {
    const cpOverride = cargo.cpOverrides?.[row.id];
    const opOverride = isActive ? cargo.opOverrides?.[row.id] : undefined;
    // CP baseline = live Sequence row (rates only come from cpOverrides), so any
    // sequence edit immediately updates CP days and delta days.
    const cpDays = calculatePortDaysForDemurrage(row);

    // Operational = Cargo-section operational overrides only. The Sequence row
    // remains the CP baseline and must not be mutated by these edits.
    const opDays = calculatePortDaysForDemurrage(row, opOverride);
    const diffDays = Math.abs(cpDays - opDays) < 0.005 ? 0 : cpDays - opDays;
    const demurrageRate = isActive ? cpOverride?.demurrage ?? cargo.demurrageRate ?? 0 : 0;
    const despatchRate = isActive ? cpOverride?.despatch ?? cargo.despatchRate ?? 0 : 0;
    return {
      rowId: row.id,
      port: row.port,
      operation: row.operation,
      cpDays,
      opDays,
      diffDays,
      demurrageRate,
      despatchRate,
    };
  });

  const totalExtraDays = rowBreakdown.reduce((sum, row) => sum + row.diffDays, 0);
  const mode = cargo.laytimeMode ?? "average";

  if (mode === "cancelled") {
    return {
      cargoId: cargo.id,
      rows: rowBreakdown.map((r) => ({ ...r, demurrageRate: 0, despatchRate: 0 })),
      totalExtraDays,
      demurrageAmount: 0,
      despatchAmount: 0,
    };
  }

  if (mode === "non_reversible") {
    // Each port settles individually — a fast port never offsets a slow one.
    return {
      cargoId: cargo.id,
      rows: rowBreakdown,
      totalExtraDays,
      demurrageAmount: rowBreakdown.reduce(
        (sum, r) => sum + (r.diffDays < 0 ? Math.abs(r.diffDays) * r.demurrageRate : 0),
        0,
      ),
      despatchAmount: rowBreakdown.reduce(
        (sum, r) => sum + (r.diffDays > 0 ? r.diffDays * r.despatchRate : 0),
        0,
      ),
    };
  }

  const averageDemurrageRate = rowBreakdown.length > 0
    ? rowBreakdown.reduce((sum, row) => sum + row.demurrageRate, 0) / rowBreakdown.length
    : cargo.demurrageRate || 0;
  const averageDespatchRate = rowBreakdown.length > 0
    ? rowBreakdown.reduce((sum, row) => sum + row.despatchRate, 0) / rowBreakdown.length
    : cargo.despatchRate || 0;
  return {
    cargoId: cargo.id,
    rows: rowBreakdown,
    totalExtraDays,
    demurrageAmount: totalExtraDays < 0 ? Math.abs(totalExtraDays) * averageDemurrageRate : 0,
    despatchAmount: totalExtraDays > 0 ? totalExtraDays * averageDespatchRate : 0,
  };
}

export function calculateCargoDemurrageDespatch(
  cargo: CargoEntry,
  cargos: CargoEntry[],
  sequence: SequenceRowUI[],
): DemurrageDespatchCargoResult {
  return calculateCargoDemurrageDespatchFromRows(cargo, getRowsForCargo(cargo.id, cargos, sequence));
}

export function calculateDemurrageDespatchTotals(cargos: CargoEntry[], sequence: SequenceRowUI[]) {
  const cargoBreakdowns = cargos.map((cargo) => calculateCargoDemurrageDespatch(cargo, cargos, sequence));
  return {
    cargoBreakdowns,
    totalExtraDays: cargoBreakdowns.reduce((sum, cargo) => sum + cargo.totalExtraDays, 0),
    demurrageAmount: cargoBreakdowns.reduce((sum, cargo) => sum + cargo.demurrageAmount, 0),
    despatchAmount: cargoBreakdowns.reduce((sum, cargo) => sum + cargo.despatchAmount, 0),
  };
}