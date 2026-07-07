import type { VesselData } from "@/data/vessels";
import type { CargoEntry } from "@/context/VoyageContext";

// Sequence row shape we depend on (loose typed to avoid circular import widening).
export interface SequenceRowForValidation {
  id: number;
  type: "open" | "port" | "repos";
  operation?: string;
  port?: string;
  portId?: number;
  portUnloc?: string;
  distance?: number;
  ecaDistance?: number;
  turnTime?: number;
  extraTime?: number;
  expDa?: number;
  quantity?: number;
}

export type ValidationSection = "vessel" | "sequence" | "cargo";

export interface ValidationIssue {
  section: ValidationSection;
  field: string;
  rowId?: number | string;
  message: string;
  /** DOM id of the input the error refers to (matches `getFieldId`). */
  elementId: string;
  /** Friendly label used in summary text. */
  label: string;
}

export interface NumericFieldConfig {
  label: string;
  min: number;
  max: number;
  required?: boolean;
  /** Speed fields enforce > 0 (not just >= min). */
  speed?: boolean;
  /** When true, a value of 0 is treated as missing (required check fails). */
  nonZero?: boolean;
}

export const VESSEL_FIELDS: Record<string, NumericFieldConfig> = {
  dwt: { label: "DWT (mt)", min: 0, max: 600_000, required: true },
  gt: { label: "GT", min: 0, max: 600_000, required: true },
  cubic: { label: "Cubic (m³)", min: 0, max: 1_000_000, required: true },
  draft: { label: "Draft (m)", min: 0, max: 50, required: true },
  tpcTpi: { label: "TPC (t/cm)", min: 0, max: 500, required: true },
  speedBallast: { label: "Speed Ballast (kn)", min: 0.1, max: 90, required: true, speed: true },
  speedLaden: { label: "Speed Laden (kn)", min: 0.1, max: 90, required: true, speed: true },
  hsfo: { label: "HSFO", min: 0, max: 500, required: true },
  vlsfo: { label: "VLSFO", min: 0, max: 500, required: true },
  lsmgo: { label: "LSMGO", min: 0, max: 100, required: true },
  ae: { label: "AE", min: 0, max: 100, required: true },
  aeScrubber: { label: "AE + Scrubber", min: 0, max: 100, required: true },
};

/** Range/required rules for each consumption-matrix row. */
export const MATRIX_ROW_RULES: Record<
  string,
  { label: string; min: number; max: number; speed?: boolean }
> = {
  speed: { label: "Speed (kn)", min: 0.1, max: 90, speed: true },
  hsfo: { label: "HSFO (mt/d)", min: 0, max: 500 },
  vlsfo: { label: "VLSFO (mt/d)", min: 0, max: 500 },
  lsmgo: { label: "LSMGO (mt/d)", min: 0, max: 100 },
  ae: { label: "AE (mt/d)", min: 0, max: 100 },
  aeScrubber: { label: "AE+Scrubber (mt/d)", min: 0, max: 100 },
};

const COL_LABELS: Record<string, string> = {
  ballast: "Ballast",
  laden: "Laden",
  canal: "Canal",
  load: "Load",
  discharge: "Discharge",
  idle: "Idle",
};

/** Field id used for each matrix cell — `matrix_<row>_<col>`. */
export function matrixFieldKey(row: string, col: string): string {
  return `matrix_${row}_${col}`;
}

export const SEQUENCE_FIELDS: Record<string, NumericFieldConfig> = {
  distance: { label: "Distance", min: 0, max: 30_000 },
  ecaDistance: { label: "ECA Distance", min: 0, max: 30_000 },
  turnExtra: { label: "Turn + Extra (h)", min: 0, max: 1000 },
  expDa: { label: "Exp DA", min: 0, max: 10_000_000, required: true, nonZero: true },
  quantity: { label: "Quantity (MT)", min: 0, max: 550_000, required: true },
};

export const CARGO_FIELDS: Record<string, NumericFieldConfig> = {
  rate: { label: "Rate", min: 0, max: 100_000, required: true },
  demurrageRate: { label: "Demurrage ($)", min: 0, max: 1_000_000, required: true },
  despatchRate: { label: "Despatch ($)", min: 0, max: 1_000_000, required: true },
  gtc: { label: "GTC", min: 0, max: 500_000, required: true, nonZero: true },
  grossBB: { label: "Gross BB ($)", min: 0, max: 100_000_000, required: true },
  voyageCommission: { label: "Voyage Comm (%)", min: 0, max: 50, required: true },
  tcCommission: { label: "TC Comm (%)", min: 0, max: 50, required: true },
};

export const MAX_CARGOS = 5;
export const MAX_SEQUENCE_PORTS = 30;

export function getFieldId(
  section: ValidationSection,
  field: string,
  rowId?: number | string,
): string {
  return `v-${section}-${field}-${rowId ?? "_"}`;
}

/** Validate a single numeric input value. Returns null when valid. */
export function validateNumeric(
  rawValue: unknown,
  cfg: NumericFieldConfig,
): string | null {
  // Treat empty / null / undefined as empty.
  const isEmpty =
    rawValue === null ||
    rawValue === undefined ||
    (typeof rawValue === "string" && rawValue.trim() === "");

  if (isEmpty) {
    return cfg.required ? "This field is required" : null;
  }

  const trimmed = typeof rawValue === "string" ? rawValue.trim() : rawValue;
  const num = typeof trimmed === "number" ? trimmed : Number(trimmed);

  if (typeof trimmed === "string" && !/^-?\d*\.?\d+$/.test(trimmed)) {
    return "Only numeric values are allowed";
  }
  if (!Number.isFinite(num)) {
    return "Only numeric values are allowed";
  }
  if (cfg.nonZero && cfg.required && num === 0) {
    return "This field is required";
  }
  if (cfg.speed && num <= 0) {
    return "Speed must be greater than 0";
  }
  if (num < cfg.min || num > cfg.max) {
    return `Value must be between ${cfg.min} and ${cfg.max}`;
  }
  return null;
}

function pushIssue(
  out: ValidationIssue[],
  section: ValidationSection,
  field: string,
  cfg: NumericFieldConfig,
  value: unknown,
  rowId?: number | string,
) {
  const msg = validateNumeric(value, cfg);
  if (msg) {
    out.push({
      section,
      field,
      rowId,
      message: msg,
      label: cfg.label,
      elementId: getFieldId(section, field, rowId),
    });
  }
}

export function validateVessel(vessel: VesselData): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const profile = vessel.speedProfile === "full" ? vessel.fullConsumption : vessel.ecoConsumption;

  pushIssue(out, "vessel", "dwt", VESSEL_FIELDS.dwt, vessel.dwt);
  pushIssue(out, "vessel", "gt", VESSEL_FIELDS.gt, vessel.gt);
  pushIssue(out, "vessel", "cubic", VESSEL_FIELDS.cubic, vessel.cubic);
  pushIssue(out, "vessel", "draft", VESSEL_FIELDS.draft, vessel.draft);
  pushIssue(out, "vessel", "tpcTpi", VESSEL_FIELDS.tpcTpi, vessel.tpcTpi);

  if (profile) {
    const speedCols: Array<"ballast" | "laden"> = ["ballast", "laden"];
    const allCols: Array<"ballast" | "laden" | "canal" | "load" | "discharge" | "idle"> = [
      "ballast", "laden", "canal", "load", "discharge", "idle",
    ];
    const lds = !!vessel.loadDischIdleSame;

    Object.entries(MATRIX_ROW_RULES).forEach(([rowKey, rule]) => {
      const cols = rowKey === "speed" ? speedCols : allCols;
      cols.forEach((col) => {
        // When L=D=I is on, discharge & idle mirror load — skip duplicate errors.
        if (lds && (col === "discharge" || col === "idle")) return;
        const profileRec = profile as unknown as Record<string, Record<string, number | undefined>>;
        const value = profileRec[rowKey]?.[col];
        const cfg: NumericFieldConfig = {
          label: `${rule.label} · ${COL_LABELS[col]}`,
          min: rule.min,
          max: rule.max,
          required: true,
          speed: rule.speed,
        };
        pushIssue(out, "vessel", matrixFieldKey(rowKey, col), cfg, value);
      });
    });
  }
  return out;
}

export function validateSequence(rows: SequenceRowForValidation[]): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const portRows = rows.filter((r) => r.type !== "open");

  if (portRows.length > MAX_SEQUENCE_PORTS) {
    out.push({
      section: "sequence",
      field: "_count",
      message: `Maximum ${MAX_SEQUENCE_PORTS} ports/legs allowed`,
      label: "Sequence",
      elementId: "v-sequence-_count-_",
    });
  }

  // Identify the first non-open leg and decide whether its distance is exempt.
  // Rule: if Open Port is not entered, OR Open Port == first port after it,
  // then default Distance/ECA Distance to 0 and don't flag missing distance.
  const openRow = rows.find((r) => r.type === "open");
  const firstLegId = (() => {
    if (!openRow) return null;
    const openIdx = rows.indexOf(openRow);
    for (let i = openIdx + 1; i < rows.length; i++) {
      if (rows[i].type !== "open") return rows[i].id;
    }
    return null;
  })();
  const openPortEmpty = !openRow || !(openRow.port && openRow.port.trim());
  const firstLeg = rows.find((r) => r.id === firstLegId);
  const sameAsOpen = (() => {
    if (!openRow || !firstLeg) return false;
    // Prefer UNLOC match; only truthy non-empty strings count.
    if (openRow.portUnloc && firstLeg.portUnloc) {
      return openRow.portUnloc === firstLeg.portUnloc;
    }
    // Numeric portId, only if both are truthy (>0) and equal.
    if (openRow.portId && firstLeg.portId) {
      return openRow.portId === firstLeg.portId;
    }
    // Name fallback.
    if (openRow.port && firstLeg.port) {
      return openRow.port.trim().toLowerCase() === firstLeg.port.trim().toLowerCase();
    }
    return false;
  })();
  const exemptFirstLegDistance = firstLegId !== null && (openPortEmpty || sameAsOpen);

  // Build a map of legs exempt from the distance requirement because the
  // previous row is the same port (back-to-back same-port → 0 distance by
  // definition). Applies regardless of auto-distance mode.
  const samePortExempt = new Set<number>();
  const orderedNonOpen = rows.filter((r) => r.type !== "open");
  for (let i = 1; i < orderedNonOpen.length; i++) {
    const prev = orderedNonOpen[i - 1];
    const curr = orderedNonOpen[i];
    const sameUnloc = !!prev.portUnloc && !!curr.portUnloc && prev.portUnloc === curr.portUnloc;
    const samePortName =
      !prev.portUnloc && !curr.portUnloc &&
      !!prev.port && !!curr.port &&
      prev.port.trim().toLowerCase() === curr.port.trim().toLowerCase();
    if (sameUnloc || samePortName) samePortExempt.add(curr.id);
  }

  rows.forEach((r) => {
    if (r.type === "open") return;
    // Port must be selected for every non-open row.
    if (!r.port || !r.port.trim()) {
      out.push({
        section: "sequence",
        field: "port",
        rowId: r.id,
        message: "Port is required",
        label: "Port",
        elementId: getFieldId("sequence", "port", r.id),
      });
    }
    // Either Distance or ECA Distance is required, both must be non-negative.
    const dist = Number(r.distance) || 0;
    const eca = Number(r.ecaDistance) || 0;
    const isExempt =
      (exemptFirstLegDistance && r.id === firstLegId) || samePortExempt.has(r.id);
    if (dist === 0 && eca === 0 && !isExempt) {
      const isFirstLegDiffFromOpen =
        firstLegId !== null && r.id === firstLegId && !exemptFirstLegDistance && !!openRow;
      const msg = isFirstLegDiffFromOpen
        ? `Distance is required between open port (${openRow?.port ?? ""}) and ${r.port ?? "first port"}`
        : "Either Distance or ECA Distance is required";
      out.push({
        section: "sequence",
        field: "distance",
        rowId: r.id,
        message: msg,
        label: "Distance / ECA",
        elementId: getFieldId("sequence", "distance", r.id),
      });
    } else {
      if (dist !== 0)
        pushIssue(out, "sequence", "distance", SEQUENCE_FIELDS.distance, r.distance, r.id);
      if (eca !== 0)
        pushIssue(out, "sequence", "ecaDistance", SEQUENCE_FIELDS.ecaDistance, r.ecaDistance, r.id);
    }

    // Turn + Extra combined check
    const turnExtra = (Number(r.turnTime) || 0) + (Number(r.extraTime) || 0);
    if (turnExtra > SEQUENCE_FIELDS.turnExtra.max) {
      out.push({
        section: "sequence",
        field: "turnExtra",
        rowId: r.id,
        message: `Value must be between ${SEQUENCE_FIELDS.turnExtra.min} and ${SEQUENCE_FIELDS.turnExtra.max}`,
        label: SEQUENCE_FIELDS.turnExtra.label,
        elementId: getFieldId("sequence", "turnExtra", r.id),
      });
    }
    if ((Number(r.turnTime) || 0) < 0 || (Number(r.extraTime) || 0) < 0) {
      out.push({
        section: "sequence",
        field: "turnExtra",
        rowId: r.id,
        message: "Value must be between 0 and 1000",
        label: SEQUENCE_FIELDS.turnExtra.label,
        elementId: getFieldId("sequence", "turnExtra", r.id),
      });
    }

    pushIssue(out, "sequence", "expDa", SEQUENCE_FIELDS.expDa, r.expDa, r.id);

    if (r.operation === "loading" || r.operation === "discharging") {
      pushIssue(out, "sequence", "quantity", SEQUENCE_FIELDS.quantity, r.quantity, r.id);
    }
  });

  return out;
}

export function validateCargos(
  cargos: CargoEntry[],
  loadedQtyByCargo?: Map<number, number>,
  dischargedQtyByCargo?: Map<number, number>,
): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  if (cargos.length > MAX_CARGOS) {
    out.push({
      section: "cargo",
      field: "_count",
      message: `Maximum ${MAX_CARGOS} cargoes are allowed per voyage`,
      label: "Cargo",
      elementId: "v-cargo-_count-_",
    });
  }

  cargos.forEach((c) => {
    const loadedForCargo = loadedQtyByCargo?.get(c.id) ?? 0;
    // Rate becomes mandatory (must be > 0) once a quantity has been loaded for this cargo.
    const rateCfg: NumericFieldConfig = loadedForCargo > 0
      ? { ...CARGO_FIELDS.rate, nonZero: true }
      : CARGO_FIELDS.rate;
    pushIssue(out, "cargo", "rate", rateCfg, c.rate, c.id);
    pushIssue(out, "cargo", "demurrageRate", CARGO_FIELDS.demurrageRate, c.demurrageRate, c.id);
    pushIssue(out, "cargo", "despatchRate", CARGO_FIELDS.despatchRate, c.despatchRate, c.id);
    pushIssue(out, "cargo", "voyageCommission", CARGO_FIELDS.voyageCommission, c.voyageCommission, c.id);
    pushIssue(out, "cargo", "tcCommission", CARGO_FIELDS.tcCommission, c.tcCommission, c.id);

    // GTC and Gross BB are derived from header inputs (not per-cargo), validated below.
  });

  // Cargo load vs discharge quantity balance
  if (loadedQtyByCargo && dischargedQtyByCargo) {
    cargos.forEach((c, idx) => {
      const loaded = loadedQtyByCargo.get(c.id) ?? 0;
      const disch = dischargedQtyByCargo.get(c.id) ?? 0;
      if (loaded === 0 && disch === 0) return;
      if (Math.abs(loaded - disch) > 0.001) {
        out.push({
          section: "cargo",
          field: "quantityBalance",
          rowId: c.id,
          message: `Cargo #${idx + 1} load (${loaded.toLocaleString()} MT) must equal discharge (${disch.toLocaleString()} MT)`,
          label: "Cargo Quantity Balance",
          elementId: getFieldId("cargo", "quantityBalance", c.id),
        });
      }
    });
  }

  return out;
}

/** Header-level cargo validations (GTC, Gross BB) — these live above per-cargo cards. */
export function validateCargoHeader(
  gtc: number | undefined,
  grossBB: number | undefined,
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  pushIssue(out, "cargo", "gtc", CARGO_FIELDS.gtc, gtc, "_header");
  pushIssue(out, "cargo", "grossBB", CARGO_FIELDS.grossBB, grossBB, "_header");
  return out;
}