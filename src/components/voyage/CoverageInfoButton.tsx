import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";

interface Props {
  mode: "eu" | "uk" | "fueleu";
  results: VoyageResults;
}

export function CoverageInfoButton({ mode, results }: Props) {
  const title =
    mode === "eu"
      ? "EU ETS — Per-Leg Coverage"
      : mode === "uk"
      ? "UK ETS — Per-Leg Coverage"
      : "FuelEU — Per-Leg EU Coverage";

  const factorFromPct = (p: number) => (p / 100).toFixed(2);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-readonly-allowed="true"
          type="button"
          className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors ml-1"
          aria-label={title}
        >
          <Info className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-[420px] p-2">
        <div className="text-[11px] font-semibold mb-1">{title}</div>

        {(mode === "eu" || mode === "fueleu") && (
          <div className="max-h-[320px] overflow-auto">
            {results.etsLegDetails.length === 0 ? (
              <div className="text-[10px] text-muted-foreground py-2 text-center">
                No legs to display.
              </div>
            ) : (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-0.5">#</th>
                    <th className="text-left font-medium py-0.5">From</th>
                    <th className="text-left font-medium py-0.5">To</th>
                    <th className="text-right font-medium py-0.5">Sea</th>
                    <th className="text-right font-medium py-0.5">Port</th>
                  </tr>
                </thead>
                <tbody>
                  {results.etsLegDetails.map((l) => (
                    <tr key={l.legIndex} className="border-b border-border/40">
                      <td className="py-0.5 text-muted-foreground">{l.legIndex + 1}</td>
                      <td className="py-0.5 truncate max-w-[110px]">
                        {l.isPortOnly ? "—" : l.originPort}
                        {!l.isPortOnly && (
                        <span className={`ml-1 text-[9px] ${l.originIsEu ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {l.originIsEu ? "EU" : "Non-EU"}
                        </span>
                        )}
                      </td>
                      <td className="py-0.5 truncate max-w-[110px]">
                        {l.destPort}
                        <span className={`ml-1 text-[9px] ${l.destIsEu ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {l.destIsEu ? "EU" : "Non-EU"}
                        </span>
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums">
                        {l.isPortOnly ? "—" : `${l.coveragePct}% (${factorFromPct(l.coveragePct)})`}
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums">
                        {l.portCoveragePct}% ({factorFromPct(l.portCoveragePct)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="text-[9px] text-muted-foreground mt-1 leading-tight">
              EU↔EU = 100% (1.0) · EU↔Non-EU = 50% (0.5) · Non-EU↔Non-EU = 0% (0.0). Port stay at EU port = 100%.
              {mode === "fueleu" && " FuelEU applies the same EU coverage factor to fuel energy."}
            </div>
          </div>
        )}

        {mode === "uk" && (
          <div className="max-h-[320px] overflow-auto">
            {results.ukEtsResult.legBreakdown.length === 0 ? (
              <div className="text-[10px] text-muted-foreground py-2 text-center">
                No UK-relevant legs.
              </div>
            ) : (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-0.5">#</th>
                    <th className="text-left font-medium py-0.5">From</th>
                    <th className="text-left font-medium py-0.5">To</th>
                    <th className="text-right font-medium py-0.5">Sea Cov</th>
                    <th className="text-right font-medium py-0.5">Port Cov</th>
                    <th className="text-right font-medium py-0.5">Factor</th>
                  </tr>
                </thead>
                <tbody>
                  {results.ukEtsResult.legBreakdown.map((l) => (
                    <tr key={l.legIndex} className="border-b border-border/40">
                      <td className="py-0.5 text-muted-foreground">{l.legIndex + 1}</td>
                      <td className="py-0.5 truncate max-w-[100px]">
                        {l.originPort}
                        <span className="ml-1 text-[9px] uppercase text-muted-foreground">
                          {l.originZone ?? "—"}
                        </span>
                      </td>
                      <td className="py-0.5 truncate max-w-[100px]">
                        {l.destPort}
                        <span className="ml-1 text-[9px] uppercase text-muted-foreground">
                          {l.destZone ?? "—"}
                        </span>
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums">{l.seaCoveragePct}%</td>
                      <td className="py-0.5 text-right font-mono tabular-nums">{l.portCoveragePct}%</td>
                      <td className="py-0.5 text-right font-mono tabular-nums">
                        {factorFromPct(Math.max(l.seaCoveragePct, l.portCoveragePct))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="text-[9px] text-muted-foreground mt-1 leading-tight">
              Sea: GB↔GB = 100% (1.0) · NI↔NI = 100% (1.0) · GB↔NI = 50% (0.5) · else 0%. Port stay = 100% if uk_ets flag is true.
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
