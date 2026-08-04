import type { SequenceRowUI } from "@/context/VoyageContext";
import type { VesselData } from "@/data/vessels";

/**
 * Shared per-leg / per-port fuel breakdown.
 *
 * These helpers mirror the logic in `useVoyageCalculation` exactly so that the
 * Sequence Summary and the Calculation Breakdown page always agree with the
 * engine totals.
 */

export type FuelKey = "hsfo" | "vlsfo" | "lsmgo";

export interface LegSeaFuelRow {
  id: string | number;
  from: string;
  to: string;
  isLaden: boolean;
  nonEcaDays: number;
  ecaDays: number;
  totalSeaDays: number;
  meHsfo: number;
  meVlsfo: number;
  meLsmgoEca: number;
  aeLsmgo: number;
  total: number;
}

export interface PortFuelRow {
  id: string | number;
  port: string;
  operation: string;
  workingDays: number;
  turnDays: number;
  extraDays: number;
  idleDays: number;
  workingMode: "load" | "discharge" | "idle" | "none";
  meFuel: FuelKey | "none";
  meHsfo: number;
  meVlsfo: number;
  meLsmgo: number;
  aeLsmgo: number;
  total: number;
}

const norm = (op?: string) => (op || "").toLowerCase();
const isLoadOp = (op: string) => op === "load" || op === "loading";
const isDischOp = (op: string) => op === "disch" || op === "discharging";

function getProfiles(vessel: VesselData) {
  const profile =
    vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
  const hasScrubber = vessel.hasScrubber === true;
  const aeProfile = hasScrubber ? profile.aeScrubber : profile.ae;
  return { profile, hasScrubber, aeProfile };
}

/** Sea fuel per leg — matches engine Step 4 (non-ECA ME, ECA LSMGO, AE, reward factor). */
export function computeLegSeaFuel(
  sequence: SequenceRowUI[],
  vessel: VesselData,
  rewardFactor = 1,
): LegSeaFuelRow[] {
  const { profile, hasScrubber, aeProfile } = getProfiles(vessel);
  const rf = rewardFactor || 1;

  let cargoOnBoard = 0;
  let prevPort = "—";
  const rows: LegSeaFuelRow[] = [];

  sequence.forEach((r) => {
    if (r.type === "open") {
      prevPort = r.port || "Open";
      return;
    }
    const isLaden = cargoOnBoard > 0;
    const totalSeaDays = r.totalLegTime || 0;
    const ecaDays = r.ecaTime || 0;
    // UI field `seaTime` is the NON-ECA portion (with margin) — same mapping the
    // engine receives as `nonEcaTime`.
    const nonEcaDays = r.seaTime ?? Math.max(0, totalSeaDays - ecaDays);

    let meHsfo = 0;
    let meVlsfo = 0;
    if (hasScrubber) {
      meHsfo = nonEcaDays * (isLaden ? profile.hsfo.laden || 0 : profile.hsfo.ballast || 0) * rf;
    } else {
      meVlsfo = nonEcaDays * (isLaden ? profile.vlsfo.laden || 0 : profile.vlsfo.ballast || 0) * rf;
    }
    const meLsmgoEca =
      ecaDays * (isLaden ? profile.lsmgo.laden || 0 : profile.lsmgo.ballast || 0) * rf;
    const aeLsmgo =
      (nonEcaDays + ecaDays) * (isLaden ? aeProfile.laden || 0 : aeProfile.ballast || 0) * rf;

    rows.push({
      id: r.id,
      from: prevPort,
      to: r.port || "(unset)",
      isLaden,
      nonEcaDays,
      ecaDays,
      totalSeaDays,
      meHsfo,
      meVlsfo,
      meLsmgoEca,
      aeLsmgo,
      total: meHsfo + meVlsfo + meLsmgoEca + aeLsmgo,
    });

    const op = norm(r.operation);
    const qty = Math.max(0, Number(r.quantity) || 0);
    if (isLoadOp(op)) cargoOnBoard += qty;
    else if (isDischOp(op)) cargoOnBoard = Math.max(0, cargoOnBoard - qty);
    prevPort = r.port || prevPort;
  });

  return rows;
}

/**
 * Port fuel per leg — matches the engine:
 *  - Load/Discharge ports: working + turn + extra time ALL burn at the
 *    load/discharge rate of the selected P.Fuel (AE at the matching AE rate).
 *  - Bunkering / waiting / other ports with port time: the FULL port time burns
 *    at the idle rate.
 */
export function computePortFuel(
  sequence: SequenceRowUI[],
  vessel: VesselData,
  portDaysOf?: (row: SequenceRowUI) => number,
): PortFuelRow[] {
  const { profile, hasScrubber, aeProfile } = getProfiles(vessel);

  return sequence
    .filter((r) => r.type !== "open" && r.type !== "repos")
    .map((r) => {
      const totalPortDays = portDaysOf
        ? portDaysOf(r)
        : r.wdaysPortOverride ?? r.calculatedPortDays ?? 0;
      const turnDays = (r.turnTime || 0) / 24;
      const extraDays = (r.extraTime || 0) / 24;
      const turnExtraDays = turnDays + extraDays;
      const workingDays = Math.max(0, totalPortDays - turnExtraDays);

      const fuel: FuelKey = (r.portFuelType as FuelKey) || (hasScrubber ? "hsfo" : "vlsfo");
      const meRateAt = (mode: "load" | "discharge" | "idle") => {
        if (fuel === "hsfo") return profile.hsfo[mode] || 0;
        if (fuel === "vlsfo") return profile.vlsfo[mode] || 0;
        return profile.lsmgo[mode] || 0;
      };

      const op = norm(r.operation);
      let workingMode: PortFuelRow["workingMode"] = "none";
      let meTotal = 0;
      let aeLsmgo = 0;
      let idleDays = 0;

      if (isLoadOp(op)) {
        workingMode = "load";
        const days = workingDays + turnExtraDays;
        meTotal = days * meRateAt("load");
        aeLsmgo = days * (aeProfile.load || 0);
      } else if (isDischOp(op)) {
        workingMode = "discharge";
        const days = workingDays + turnExtraDays;
        meTotal = days * meRateAt("discharge");
        aeLsmgo = days * (aeProfile.discharge || 0);
      } else if (totalPortDays > 0) {
        workingMode = "idle";
        idleDays = totalPortDays;
        meTotal = totalPortDays * meRateAt("idle");
        aeLsmgo = totalPortDays * (aeProfile.idle || 0);
      }

      const meHsfo = fuel === "hsfo" ? meTotal : 0;
      const meVlsfo = fuel === "vlsfo" ? meTotal : 0;
      const meLsmgo = fuel === "lsmgo" ? meTotal : 0;

      return {
        id: r.id,
        port: r.port || "(unset)",
        operation: r.operation || "-",
        workingDays: workingMode === "idle" ? 0 : workingDays,
        turnDays,
        extraDays,
        idleDays,
        workingMode,
        meFuel: workingMode === "none" ? "none" : fuel,
        meHsfo,
        meVlsfo,
        meLsmgo,
        aeLsmgo,
        total: meHsfo + meVlsfo + meLsmgo + aeLsmgo,
      };
    });
}

/**
 * Row shape accepted by `computeFifoCoverage` — deliberately loose so both the
 * engine's `SequenceRow` and the UI's `SequenceRowUI` can be passed directly.
 */
export interface FifoCoverageRow {
  type?: string;
  operation?: string;
  portUnloc?: string;
  port?: string;
  seaTime?: number;
  ecaTime?: number;
  nonEcaTime?: number;
  totalLegTime?: number;
  portDays?: number;
  calculatedPortDays?: number;
  wdaysPortOverride?: number | null;
  turnTimeHours?: number;
  extraTimeHours?: number;
  turnTime?: number;
  extraTime?: number;
  portFuelType?: FuelKey;
  quantity?: number;
}

/** Reference to a bunker price lot (a stem taken at a bunkering port). */
export interface BunkerLotRef {
  portUnloc?: string;
  portName?: string;
  port?: string;
}

const lotKey = (l: string | BunkerLotRef) =>
  typeof l === "string" ? l : l.portUnloc || "";
const lotName = (l: string | BunkerLotRef) =>
  typeof l === "string" ? "" : (l.portName || l.port || "");
const clean = (s?: string) => (s || "").trim().toLowerCase();

/**
 * Match a bunkering sequence row against the pending price lots.
 * Tries UN/LOCODE, then port name, then falls back to the next pending lot so
 * a missing/blank UN/LOCODE never collapses FIFO onto the BOB price.
 */
function matchLotIndex(
  row: { portUnloc?: string; port?: string },
  pending: Array<string | BunkerLotRef>,
): number {
  if (pending.length === 0) return -1;
  const u = clean(row.portUnloc);
  if (u) {
    const i = pending.findIndex((l) => clean(lotKey(l)) === u);
    if (i >= 0) return i;
  }
  const n = clean(row.port);
  if (n) {
    const i = pending.findIndex((l) => clean(lotName(l)) === n);
    if (i >= 0) return i;
  }
  return 0; // positional fallback: stems apply in voyage order
}

/**
 * Reorder bunker price lots to the order their bunkering calls occur in the
 * voyage. FIFO coverage is positional, so lots added out of order in the UI
 * must be aligned to the sequence before pricing.
 */
export function orderBunkerLots<T extends BunkerLotRef>(
  rows: FifoCoverageRow[],
  lots: T[],
): T[] {
  const pending = [...lots];
  const ordered: T[] = [];
  rows.forEach((r) => {
    if (norm(r.operation) !== "bunkering" || pending.length === 0) return;
    const idx = matchLotIndex(r, pending);
    if (idx >= 0) ordered.push(...pending.splice(idx, 1));
  });
  return [...ordered, ...pending];
}

/**
 * FIFO coverage: how much of each fuel is burnt under each successive bunker
 * price lot.
 *
 * Segment 0 is covered by the BOB price from voyage start through the sea leg
 * arriving at the first bunkering operation. The new bunker price starts at
 * that port stay and covers all subsequent consumption through arrival at the
 * next bunkering operation. The returned arrays have length
 * `bunkeringUnlocs.length + 1`.
 */
export function computeFifoCoverage(
  rows: FifoCoverageRow[],
  vessel: VesselData,
  bunkeringUnlocs: Array<string | BunkerLotRef>,
  rewardFactor = 1,
): Record<FuelKey, number[]> {
  const { profile, hasScrubber, aeProfile } = getProfiles(vessel);
  const rf = rewardFactor || 1;
  const segCount = bunkeringUnlocs.length + 1;
  const coverage: Record<FuelKey, number[]> = {
    hsfo: new Array(segCount).fill(0),
    vlsfo: new Array(segCount).fill(0),
    lsmgo: new Array(segCount).fill(0),
  };

  let seg = 0;
  let cargoOnBoard = 0;
  const pending = [...bunkeringUnlocs];

  rows.forEach((r) => {
    const op = norm(r.operation);

    if (r.type !== "open") {
      // --- Sea consumption for the leg arriving at this port ---
      const isLaden = cargoOnBoard > 0;
      const ecaDays = r.ecaTime || 0;
      const nonEcaDays =
        r.nonEcaTime ?? r.seaTime ?? Math.max(0, (r.totalLegTime || 0) - ecaDays);

      if (hasScrubber) {
        coverage.hsfo[seg] +=
          nonEcaDays * (isLaden ? profile.hsfo.laden || 0 : profile.hsfo.ballast || 0) * rf;
      } else {
        coverage.vlsfo[seg] +=
          nonEcaDays * (isLaden ? profile.vlsfo.laden || 0 : profile.vlsfo.ballast || 0) * rf;
      }
      coverage.lsmgo[seg] +=
        ecaDays * (isLaden ? profile.lsmgo.laden || 0 : profile.lsmgo.ballast || 0) * rf;
      coverage.lsmgo[seg] +=
        (nonEcaDays + ecaDays) *
        (isLaden ? aeProfile.laden || 0 : aeProfile.ballast || 0) *
        rf;
    }

    // Change price lots only at the actual bunkering operation, never merely
    // because an earlier row (commonly the open port) has the same UN/LOCODE.
    // The inbound sea leg above is still BOB/previous-lot consumption; fuel
    // consumed at this port and afterwards belongs to the newly stemmed lot.
    if (op === "bunkering") {
      const idx = matchLotIndex(r, pending);
      if (idx >= 0) {
        pending.splice(0, idx + 1);
        seg = Math.min(segCount - 1, seg + idx + 1);
      }
    }

    // --- Port consumption at this port ---
    if (r.type !== "open" && r.type !== "repos") {
      const totalPortDays =
        r.portDays ?? r.wdaysPortOverride ?? r.calculatedPortDays ?? 0;
      if (totalPortDays > 0) {
        const fuel: FuelKey = r.portFuelType || (hasScrubber ? "hsfo" : "vlsfo");
        const meRateAt = (mode: "load" | "discharge" | "idle") =>
          (fuel === "hsfo" ? profile.hsfo[mode] : fuel === "vlsfo" ? profile.vlsfo[mode] : profile.lsmgo[mode]) || 0;

        let mode: "load" | "discharge" | "idle" = "idle";
        if (isLoadOp(op)) mode = "load";
        else if (isDischOp(op)) mode = "discharge";

        coverage[fuel][seg] += totalPortDays * meRateAt(mode);
        coverage.lsmgo[seg] += totalPortDays * (aeProfile[mode] || 0);
      }
    }

    const qty = Math.max(0, Number(r.quantity) || 0);
    if (isLoadOp(op)) cargoOnBoard += qty;
    else if (isDischOp(op)) cargoOnBoard = Math.max(0, cargoOnBoard - qty);

  });

  return coverage;
}
