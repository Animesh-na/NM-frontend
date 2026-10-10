import type { SequenceRowUI } from "@/context/VoyageContext";
import type { VesselData } from "@/data/vessels";
import { contextFuel } from "@/utils/speedContext";

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

/** Terms coefficient (SHINC = 1.0, SSHEX = 1.5555, …). Never below 1. */
export function termsFactorOf(row: { coefficientFactor?: number | null; terms?: string | null }): number {
  const explicit = Number(row?.coefficientFactor);
  const t = (row?.terms || "").toLowerCase();
  const fallback = t === "sshex" ? 1.5555 : t === "shex" ? 1.2727 : t === "satpm" ? 1.3333 : 1.0;
  const f = explicit > 0 ? explicit : fallback;
  return f < 1 ? 1 : f;
}

/**
 * Split a port stay into the days that burn at the load/discharge rate and the
 * days that burn at the IDLE rate.
 *
 * - Pure cargo work = (quantity / mt-per-day) → the terms factor 1.0 portion.
 * - Anything the terms coefficient adds on top (e.g. SSHEX 1.5555 → 0.5555)
 *   is non-working time and burns at the idle rate.
 * - Turn time and extra time always burn at the idle rate.
 */
export function splitPortStay(
  totalPortDays: number,
  turnDays: number,
  extraDays: number,
  factor: number,
): { workingDays: number; idleDays: number } {
  const total = Math.max(0, totalPortDays || 0);
  const turnExtra = Math.max(0, (turnDays || 0) + (extraDays || 0));
  const grossWorking = Math.max(0, total - turnExtra);
  const f = factor > 0 ? factor : 1;
  const pureWorking = grossWorking / f;
  return {
    workingDays: pureWorking,
    idleDays: (grossWorking - pureWorking) + turnExtra,
  };
}

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
    let meLsmgoEca = 0;
    const rateFor = (f: FuelKey) => (isLaden ? profile[f].laden || 0 : profile[f].ballast || 0);
    const addSea = (f: FuelKey, days: number) => {
      const mt = days * rateFor(f) * rf;
      if (f === "hsfo") meHsfo += mt;
      else if (f === "vlsfo") meVlsfo += mt;
      else meLsmgoEca += mt;
    };
    addSea(contextFuel(r.distanceSpeedContext, hasScrubber ? "hsfo" : "vlsfo"), nonEcaDays);
    addSea(contextFuel(r.ecaDistanceSpeedContext, "lsmgo"), ecaDays);
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
 *  - Load/Discharge ports: only the pure cargo-work portion
 *    (quantity / mt-per-day, i.e. terms factor 1.0) burns at the
 *    load/discharge rate of the selected P.Fuel. The terms surcharge portion
 *    plus turn time and extra time burn at the IDLE rate.
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
      const split = splitPortStay(totalPortDays, turnDays, extraDays, termsFactorOf(r));
      const workingDays = split.workingDays;

      const fuel: FuelKey = (r.portFuelType as FuelKey) || (hasScrubber ? "hsfo" : "vlsfo");
      const meRateAt = (mode: "load" | "discharge" | "idle" | "canal") => {
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
        idleDays = split.idleDays;
        meTotal = workingDays * meRateAt("load") + idleDays * meRateAt("idle");
        aeLsmgo = workingDays * (aeProfile.load || 0) + idleDays * (aeProfile.idle || 0);
      } else if (isDischOp(op)) {
        workingMode = "discharge";
        idleDays = split.idleDays;
        meTotal = workingDays * meRateAt("discharge") + idleDays * meRateAt("idle");
        aeLsmgo = workingDays * (aeProfile.discharge || 0) + idleDays * (aeProfile.idle || 0);
      } else if ((op === "pssg" || op === "passage") && totalPortDays > 0) {
        // Passing port: turn + extra time burn at the CANAL rate (ME + AE)
        workingMode = "idle";
        idleDays = totalPortDays;
        meTotal = totalPortDays * meRateAt("canal");
        aeLsmgo = totalPortDays * (aeProfile.canal || 0);
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
  distanceSpeedContext?: string;
  ecaDistanceSpeedContext?: string;
  terms?: string | null;
  coefficientFactor?: number | null;
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

/** A bunkering call of the voyage that needs a price lot. */
export interface BunkerCall {
  portUnloc: string;
  port: string;
}

/**
 * One price lot per bunkering call (D-065). Pairs each call, in voyage order,
 * with the first unused lot of the same port (UN/LOCODE, else port name) — the
 * same pairing the engine uses — keeps the paired lots with their prices,
 * creates a lot for each unpaired call and drops lots no call uses (including
 * duplicates). Unlike matchLotIndex there is no positional fallback: a call at
 * a new port never inherits another port's prices.
 *
 * Returns the input array itself when nothing changes, so callers can bail out.
 */
export function syncBunkerLots<T extends BunkerLotRef>(
  calls: BunkerCall[],
  lots: T[],
  create: (call: BunkerCall) => T,
): T[] {
  const pending = [...lots];
  const next = calls.map((call) => {
    const u = clean(call.portUnloc);
    const n = clean(call.port);
    let idx = u ? pending.findIndex((l) => clean(lotKey(l)) === u) : -1;
    if (idx < 0 && n) idx = pending.findIndex((l) => !(u && clean(lotKey(l))) && clean(lotName(l)) === n);
    return idx >= 0 ? pending.splice(idx, 1)[0] : create(call);
  });
  const unchanged = next.length === lots.length && next.every((l, i) => l === lots[i]);
  return unchanged ? lots : next;
}

/** Display label of each lot: the port name, plus "(call n)" when the port has several calls. */
export function bunkerLotLabels(lots: BunkerLotRef[]): string[] {
  const key = (l: BunkerLotRef) => clean(lotKey(l)) || clean(lotName(l));
  const total = new Map<string, number>();
  lots.forEach((l) => total.set(key(l), (total.get(key(l)) || 0) + 1));
  const seen = new Map<string, number>();
  return lots.map((l) => {
    const k = key(l);
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    return (total.get(k) || 0) > 1 ? `${lotName(l)} (call ${n})` : lotName(l);
  });
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

      const addSeg = (f: FuelKey, days: number) => {
        coverage[f][seg] += days * (isLaden ? profile[f].laden || 0 : profile[f].ballast || 0) * rf;
      };
      addSeg(contextFuel(r.distanceSpeedContext, hasScrubber ? "hsfo" : "vlsfo"), nonEcaDays);
      addSeg(contextFuel(r.ecaDistanceSpeedContext, "lsmgo"), ecaDays);
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
        const meRateAt = (mode: "load" | "discharge" | "idle" | "canal") =>
          (fuel === "hsfo" ? profile.hsfo[mode] : fuel === "vlsfo" ? profile.vlsfo[mode] : profile.lsmgo[mode]) || 0;

        let mode: "load" | "discharge" | "idle" = "idle";
        if (isLoadOp(op)) mode = "load";
        else if (isDischOp(op)) mode = "discharge";

        const isPassing = op === "pssg" || op === "passage";
        if (isPassing) {
          // Passing port: canal rate for both ME and AE
          coverage[fuel][seg] += totalPortDays * meRateAt("canal");
          coverage.lsmgo[seg] += totalPortDays * (aeProfile.canal || 0);
        } else if (mode === "idle") {
          coverage[fuel][seg] += totalPortDays * meRateAt("idle");
          coverage.lsmgo[seg] += totalPortDays * (aeProfile.idle || 0);
        } else {
          const turnDays = ((r.turnTimeHours ?? r.turnTime) || 0) / 24;
          const extraDays = ((r.extraTimeHours ?? r.extraTime) || 0) / 24;
          const { workingDays, idleDays } = splitPortStay(totalPortDays, turnDays, extraDays, termsFactorOf(r));
          coverage[fuel][seg] += workingDays * meRateAt(mode) + idleDays * meRateAt("idle");
          coverage.lsmgo[seg] += workingDays * (aeProfile[mode] || 0) + idleDays * (aeProfile.idle || 0);
        }
      }
    }

    const qty = Math.max(0, Number(r.quantity) || 0);
    if (isLoadOp(op)) cargoOnBoard += qty;
    else if (isDischOp(op)) cargoOnBoard = Math.max(0, cargoOnBoard - qty);

  });

  return coverage;
}
