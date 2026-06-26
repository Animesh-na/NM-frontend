/**
 * Scenario builders for unit tests.
 *
 * Every test file in `src/test/unit/` should construct its inputs through
 * `buildInputs(overrides)` so adding a new test is just a matter of changing
 * one or two fields — never recreating the full object tree.
 *
 * Example:
 *   const inputs = buildInputs({ bunker: { ...mockBunker, hsfo: { price: 600, robStart: 500 } } });
 */
import type { VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "./mockVesselData";
import {
  mockSimpleSequence,
  mockEcaSequence,
  mockCargo,
  mockCargoLumpsum,
  mockBunker,
  mockMiscCosts,
  mockExtraTime,
} from "./mockSequenceData";

/** Default inputs used by every section's unit tests. */
export const defaultInputs: VoyageInputs = {
  vessel: mockVessel,
  sequence: mockSimpleSequence,
  cargo: mockCargo,
  bunker: mockBunker,
  hireRate: 15000,
  misc: mockMiscCosts,
  extraTime: mockExtraTime,
};

/** Build a VoyageInputs object by shallow-merging overrides into the defaults. */
export function buildInputs(overrides: Partial<VoyageInputs> = {}): VoyageInputs {
  return { ...defaultInputs, ...overrides };
}

export {
  mockVessel,
  mockSimpleSequence,
  mockEcaSequence,
  mockCargo,
  mockCargoLumpsum,
  mockBunker,
  mockMiscCosts,
  mockExtraTime,
};