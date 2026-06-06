import type { CargoEntry, SequenceRowUI } from "@/context/VoyageContext";
import { getRowsForCargo } from "@/utils/cargoRowMapping";

type CpOverride = { quantity?: number; productivity?: number };

export interface DemurrageDespatchRow {
  rowId: number;
  port: string;
  operation?: string;
  cpDays: number;
  opDays: number;
  diffDays: number;
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

export function calculatePortDaysForDemurrage(row: SequenceRowUI, override?: CpOverride): number {
  if (row.type === "open" || row.type === "repos") return 0;

  const turnTime = Number(row.turnTime) || 0;
  const extraTime = Number(row.extraTime) || 0;

  if (!isCargoOperation(row.operation)) return (turnTime + extraTime) / 24;

  const quantity = override?.quantity ?? row.quantity ?? 0;
  const productivity = override?.productivity ?? row.productivity ?? 0;
  if (productivity <= 0 || quantity <= 0) return (turnTime + extraTime) / 24;

  const termsMultiplier = row.coefficientFactor || (row.terms === "sshex" ? 1.5555 : row.terms === "fhex" ? 1.25 : row.terms === "satpn" ? 1.33 : 1.0);
  return (quantity / productivity) * termsMultiplier + (turnTime + extraTime) / 24;
}

export function calculateCargoDemurrageDespatchFromRows(
  cargo: CargoEntry,
  rows: SequenceRowUI[],
): DemurrageDespatchCargoResult {
  const rowBreakdown = rows.filter((row) => isCargoOperation(row.operation)).map((row) => {
    const cpOverride = cargo.cpOverrides?.[row.id];
    const cpDays = calculatePortDaysForDemurrage(row, cpOverride);
    const opDays = calculatePortDaysForDemurrage(row);
    return {
      rowId: row.id,
      port: row.port,
      operation: row.operation,
      cpDays,
      opDays,
      diffDays: cpDays - opDays,
    };
  });

  const totalExtraDays = rowBreakdown.reduce((sum, row) => sum + row.diffDays, 0);
  return {
    cargoId: cargo.id,
    rows: rowBreakdown,
    totalExtraDays,
    demurrageAmount: totalExtraDays < 0 ? Math.abs(totalExtraDays) * (cargo.demurrageRate || 0) : 0,
    despatchAmount: totalExtraDays > 0 ? totalExtraDays * (cargo.despatchRate || 0) : 0,
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