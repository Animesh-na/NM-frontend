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
