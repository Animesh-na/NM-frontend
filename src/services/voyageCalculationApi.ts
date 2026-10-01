import { apiRequest } from "@/services/marineApi";
import type { CalculationInput, CalculationResponse } from "@/contracts/calc/types.generated";
import type { FieldDiff } from "@/contracts/calc/normalize";

/**
 * Calls the authenticated Go engine with a calc.v1 CalculationInput (the saved
 * sheet envelope). Used by shadow mode only: the UI keeps displaying its own
 * results until cutover (M10).
 */
export function calculateVoyageOnBackend(input: CalculationInput): Promise<CalculationResponse> {
  return apiRequest<CalculationResponse>("/calculations/voyage", undefined, { method: "POST", body: input });
}

/** Mismatch report: field paths and difference magnitudes only — never sheet contents or values. */
export interface ShadowReport {
  calculation_id: string;
  contract_version: "calc.v1";
  engine_version: string;
  segment: CalculationInput["segment"];
  working_sequence: number;
  compared_at: string;
  mismatches: Array<Pick<FieldDiff, "path" | "class" | "kind" | "abs_diff" | "rel_diff">>;
}

export function reportShadowMismatch(report: ShadowReport): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/calculations/shadow-report", undefined, { method: "POST", body: report });
}
