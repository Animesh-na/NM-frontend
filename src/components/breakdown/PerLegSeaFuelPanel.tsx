import { Ship } from "lucide-react";
import { BreakdownCard } from "./BreakdownCard";
import type { SequenceRowUI } from "@/context/VoyageContext";
import type { VesselData } from "@/data/vessels";
import { computeLegSeaFuel, type LegSeaFuelRow } from "@/utils/fuelBreakdown";

interface PerLegSeaFuelPanelProps {
  sequence: SequenceRowUI[];
  vessel: VesselData;
  rewardFactor?: number;
}

export function PerLegSeaFuelPanel({ sequence, vessel, rewardFactor = 1 }: PerLegSeaFuelPanelProps) {
  const hasScrubber = vessel.hasScrubber === true;
  const nonEcaFuelType: "HSFO" | "VLSFO" = hasScrubber ? "HSFO" : "VLSFO";

  const rows: LegSeaFuelRow[] = computeLegSeaFuel(sequence, vessel, rewardFactor);

  const totals = rows.reduce(
    (acc, r) => {
      acc.nonEcaDays += r.nonEcaDays;
      acc.ecaDays += r.ecaDays;
      acc.totalSeaDays += r.totalSeaDays;
      acc.meHsfo += r.meHsfo;
      acc.meVlsfo += r.meVlsfo;
      acc.meLsmgoEca += r.meLsmgoEca;
      acc.aeLsmgo += r.aeLsmgo;
      acc.total += r.total;
      return acc;
    },
    {
      nonEcaDays: 0,
      ecaDays: 0,
      totalSeaDays: 0,
      meHsfo: 0,
      meVlsfo: 0,
      meLsmgoEca: 0,
      aeLsmgo: 0,
      total: 0,
    }
  );

  return (
    <BreakdownCard
      title="Per-Leg Sea Fuel Consumption (Port → Port)"
      icon={<Ship className="h-5 w-5" />}
      badge={`${rows.length} sea leg${rows.length === 1 ? "" : "s"}`}
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Fuel burned at sea between consecutive ports — from the Open port through the last
          discharge / repositioning port. Outside ECA the Main Engine burns{" "}
          <span className="font-medium">{nonEcaFuelType}</span> ({hasScrubber ? "scrubber fitted" : "no scrubber"}),
          inside ECA it burns <span className="font-medium">LSMGO</span>. Auxiliary Engine always
          runs on <span className="font-medium">LSMGO</span> across the whole sea time.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left py-2 px-2 font-medium">From → To</th>
                <th className="text-center py-2 px-2 font-medium">State</th>
                <th className="text-right py-2 px-2 font-medium">Non-ECA (d)</th>
                <th className="text-right py-2 px-2 font-medium">ECA (d)</th>
                <th className="text-right py-2 px-2 font-medium">Total Sea (d)</th>
                <th className="text-right py-2 px-2 font-medium text-orange-500">HSFO ME (mt)</th>
                <th className="text-right py-2 px-2 font-medium text-blue-500">VLSFO ME (mt)</th>
                <th className="text-right py-2 px-2 font-medium text-emerald-500">LSMGO ME-ECA (mt)</th>
                <th className="text-right py-2 px-2 font-medium text-emerald-600">LSMGO AE (mt)</th>
                <th className="text-right py-2 px-2 font-medium">Total (mt)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-4 text-muted-foreground">
                    No sea legs in sequence.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1.5 px-2 font-medium">
                    <span className="text-muted-foreground">{r.from}</span>
                    <span className="mx-1 text-muted-foreground">→</span>
                    <span>{r.to}</span>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        r.isLaden
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                      }`}
                    >
                      {r.isLaden ? "LADEN" : "BALLAST"}
                    </span>
                  </td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.nonEcaDays.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.ecaDays.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.totalSeaDays.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.meHsfo.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.meVlsfo.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.meLsmgoEca.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.aeLsmgo.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono font-semibold text-primary">
                    {r.total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="py-2 px-2" colSpan={2}>Totals</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.nonEcaDays.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.ecaDays.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.totalSeaDays.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.meHsfo.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.meVlsfo.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.meLsmgoEca.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.aeLsmgo.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono text-primary">
                    {totals.total.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <div className="font-medium mb-1">ME Sea Consumption Logic</div>
            <div className="text-muted-foreground font-mono">
              Non-ECA = nonEcaDays × Rate[{nonEcaFuelType}, Laden/Ballast]
            </div>
            <div className="text-muted-foreground font-mono">
              ECA = ecaDays × Rate[LSMGO, Laden/Ballast]
            </div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <div className="font-medium mb-1">AE Sea Consumption Logic (LSMGO)</div>
            <div className="text-muted-foreground font-mono">
              AE = totalSeaDays × AE[Laden/Ballast]
            </div>
            <div className="text-muted-foreground">
              {hasScrubber ? "Using AE-Scrubber profile." : "Using standard AE profile."}
            </div>
          </div>
        </div>
      </div>
    </BreakdownCard>
  );
}
