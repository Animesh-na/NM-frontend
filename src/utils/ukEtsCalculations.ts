// UK ETS (United Kingdom Emissions Trading Scheme) — Maritime
//
// Independent from EU ETS. Uses ONLY the port-API fields:
//   - uk_ets  : boolean — port participates in UK ETS
//   - uk_zone : "gb" | "ni" | null — regulatory zone
//
// Sea-leg coverage rules (based on origin & destination zones):
// UK ETS Maritime — Phase 1 (from 1 July 2026):
//   UK ↔ UK (GB↔GB, NI↔NI)       : 100%
//   GB ↔ NI (Irish Sea)          : 50%
//   UK ↔ non-UK                  : 0%   (out of scope in Phase 1)
//   UK ↔ Crown Dep / OT          : 0%   (Isle of Man, Jersey, Guernsey, Gibraltar, Bermuda, …)
//   non-UK ↔ non-UK              : 0%
//
// Port-stay coverage: 100% at UK ports, 0% at non-UK ports.
// No phase-in: 100% of covered emissions are chargeable from 1 Jul 2026.

import { CO2_EMISSION_FACTORS } from "./emissionCalculations";

export type UkZone = "gb" | "ni" | null | undefined;

// UK ETS Maritime phase-in (mirrors published UK plan; adjust when finalized).
// UK ETS Maritime has NO phase-in. Owners surrender 100% of covered
// emissions from the scheme start date (1 July 2026).
export const UK_ETS_START = new Date("2026-07-01T00:00:00Z");

export function getUkEtsPhaseIn(_year?: number): number {
  // Kept for API compatibility; UK ETS applies at 100% once the scheme is live.
  const now = new Date();
  return now >= UK_ETS_START ? 1.0 : 0.0;
}

/** Coverage % for a sea leg between two ports (by uk_zone). */
export function getUkEtsSeaCoverage(originZone: UkZone, destZone: UkZone): number {
  const a = originZone ? originZone.toLowerCase() : null;
  const b = destZone ? destZone.toLowerCase() : null;
  const aUk = a === "gb" || a === "ni";
  const bUk = b === "gb" || b === "ni";
  // Both ends must be UK for any coverage under Phase 1
  if (!aUk || !bUk) return 0;
  // GB ↔ NI (Irish Sea) → 50%
  if ((a === "gb" && b === "ni") || (a === "ni" && b === "gb")) return 0.5;
  // UK ↔ UK same-zone (GB↔GB, NI↔NI) → 100%
  return 1.0;
}

/** Coverage for the port stay itself. */
export function getUkEtsPortCoverage(ukEts?: boolean): number {
  return ukEts === true ? 1.0 : 0.0;
}

export interface UkEtsFuel { hsfo: number; vlsfo: number; lsmgo: number }

export interface UkEtsLegDetail {
  legIndex: number;
  originPort: string;
  originZone: UkZone;
  destPort: string;
  destZone: UkZone;
  seaCoveragePct: number;   // 0/50/100
  portCoveragePct: number;  // 0/100
  ukCoveredFuel: UkEtsFuel;
  ukCoveredCo2: number;
  chargeableCo2: number;    // after phase-in
}

export interface UkEtsResult {
  phaseIn: number;
  ukCoveredFuel: UkEtsFuel;
  ukCoveredCo2: number;         // pre-phase-in
  chargeableCo2: number;        // post-phase-in
  ukEtsCost: number;            // chargeable × price
  ukVoyageCoverage: number;     // weighted 0..1 (informational)
  legBreakdown: UkEtsLegDetail[];
}

/** Compute CO₂ tonnes from a fuel bag using shared IMO factors. */
export function ukCo2FromFuel(f: UkEtsFuel): number {
  return (
    f.hsfo * CO2_EMISSION_FACTORS.hsfo +
    f.vlsfo * CO2_EMISSION_FACTORS.vlsfo +
    f.lsmgo * CO2_EMISSION_FACTORS.lsmgo
  );
}

export function emptyUkEtsResult(): UkEtsResult {
  return {
    phaseIn: getUkEtsPhaseIn(),
    ukCoveredFuel: { hsfo: 0, vlsfo: 0, lsmgo: 0 },
    ukCoveredCo2: 0,
    chargeableCo2: 0,
    ukEtsCost: 0,
    ukVoyageCoverage: 0,
    legBreakdown: [],
  };
}
