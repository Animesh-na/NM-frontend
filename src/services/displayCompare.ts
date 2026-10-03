/**
 * Stage-3 background comparison (M10): while the Go result is displayed, the
 * browser still computes its own result for the same sheet. Whenever a server
 * result is current, the two are compared field by field (the parity
 * comparator), and any mismatch is reported to the backend — field paths and
 * difference magnitudes only, never sheet contents or values (as in M1
 * shadow mode). One report at most per server calculation.
 */
import { useEffect, useRef } from "react";
import { compareNonFinite, compareResults, toResultDTO, type FieldDiff } from "@/contracts/calc/normalize";
import type { CalculationResponse } from "@/contracts/calc/types.generated";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import { getApiMode } from "@/services/apiMode";
import { reportShadowMismatch, type ShadowReport } from "@/services/voyageCalculationApi";

const MAX_REPORTED = 200;

/** The mismatches between the browser's and the server's result for the same sheet. */
export function diffDisplayed(local: VoyageResults, server: CalculationResponse): FieldDiff[] {
  const fe = toResultDTO(local);
  return [
    ...compareResults(fe.result, server.result, server.not_computed ?? []),
    ...compareNonFinite(fe.non_finite, (server.non_finite ?? {}) as Record<string, string>),
  ];
}

export function useDisplayComparison(
  local: VoyageResults,
  server: CalculationResponse | null,
  report: (r: ShadowReport) => Promise<unknown> = reportShadowMismatch,
): void {
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!server || reported.current === server.calculation_id) return;
    reported.current = server.calculation_id;
    const diffs = diffDisplayed(local, server);
    if (diffs.length === 0) return;
    void report({
      calculation_id: server.calculation_id,
      contract_version: "calc.v1",
      engine_version: server.engine_version,
      segment: getApiMode() === "tanker" ? "tanker" : "dry_bulk",
      working_sequence: server.working_sequence,
      compared_at: new Date().toISOString(),
      mismatches: diffs.slice(0, MAX_REPORTED).map(({ path, class: cls, kind, abs_diff, rel_diff }) => ({ path, class: cls, kind, abs_diff, rel_diff })),
    }).catch(() => {
      /* telemetry only: never affects the screen */
    });
  }, [local, server, report]);
}
