// UK ETS (United Kingdom Emissions Trading Scheme) — Maritime
//
// Independent from EU ETS. Uses ONLY the port-API fields:
//   - uk_ets  : boolean — port participates in UK ETS
//   - uk_zone : "gb" | "ni" | null — regulatory zone
//
// Sea-leg coverage rules (based on origin & destination zones):
//   GB ↔ GB : 100%
//   NI ↔ NI : 100%
//   GB ↔ NI : 50%
//   UK ↔ non-UK (either origin or destination is UK) : 100%
//   non-UK ↔ non-UK : 0%
//
// Port-stay coverage: 100% if port.uk_ets === true, else 0%.

import { CO2_EMISSION_FACTORS } from "./emissionCalculations";

export type UkZone = "gb" | "ni" | null | undefined;

// UK ETS Maritime phase-in (mirrors published UK plan; adjust when finalized).
export const UK_ETS_PHASE_IN: Record<number, number> = {
  2026: 0.40,
  2027: 0.70,
  2028: 1.00,
  2029: 1.00,
  2030: 1.00,
};

export function getUkEtsPhaseIn(year?: number): number {
  const y = year || new Date().getFullYear();
  if (y < 2026) return 0;
  if (y >= 2028) return 1.0;
  return UK_ETS_PHASE_IN[y] ?? 1.0;
}

/** Coverage % for a sea leg between two ports (by uk_zone). */
export function getUkEtsSeaCoverage(originZone: UkZone, destZone: UkZone): number {
  if (!originZone || !destZone) return 0;
  const a = originZone.toLowerCase();
  const b = destZone.toLowerCase();
  if (a === "gb" && b === "gb") return 1.0;
  if (a === "ni" && b === "ni") return 1.0;
  if ((a === "gb" && b === "ni") || (a === "ni" && b === "gb")) return 0.5;
  return 0;
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
