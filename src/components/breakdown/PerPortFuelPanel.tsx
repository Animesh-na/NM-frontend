import { Fuel } from "lucide-react";
import { BreakdownCard } from "./BreakdownCard";
import type { SequenceRowUI } from "@/context/VoyageContext";
import type { VesselData } from "@/data/vessels";
import { computePortFuel, type FuelKey, type PortFuelRow } from "@/utils/fuelBreakdown";

interface PerPortFuelPanelProps {
  sequence: SequenceRowUI[];
  vessel: VesselData;
}

export function PerPortFuelPanel({ sequence, vessel }: PerPortFuelPanelProps) {
  const rows: PortFuelRow[] = computePortFuel(sequence, vessel);

  const totals = rows.reduce(
    (acc, r) => {
      acc.workingDays += r.workingDays;
      acc.turnDays += r.turnDays;
      acc.extraDays += r.extraDays;
      acc.idleDays += r.idleDays;
      acc.meHsfo += r.meHsfo;
      acc.meVlsfo += r.meVlsfo;
      acc.meLsmgo += r.meLsmgo;
      acc.aeLsmgo += r.aeLsmgo;
      acc.total += r.total;
      return acc;
    },
    {
      workingDays: 0,
      turnDays: 0,
      extraDays: 0,
      idleDays: 0,
      meHsfo: 0,
      meVlsfo: 0,
      meLsmgo: 0,
      aeLsmgo: 0,
      total: 0,
    }
  );

  const fuelBadge = (fuel: FuelKey | "none") => {
    if (fuel === "none") return <span className="text-muted-foreground">—</span>;
    const colorMap: Record<FuelKey, string> = {
      hsfo: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
      vlsfo: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      lsmgo: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorMap[fuel]}`}>
        {fuel.toUpperCase()}
      </span>
    );
  };

  return (
    <BreakdownCard
      title="Per-Port Fuel Consumption"
      icon={<Fuel className="h-5 w-5" />}
      badge={`${rows.length} port leg${rows.length === 1 ? "" : "s"}`}
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Fuel burned at each port broken down by activity. Working time (Load/Discharge) uses
          the selected <span className="font-medium">P.Fuel</span> at the corresponding matrix
          rate. Turn time and Extra time always burn at the <span className="font-medium">Idle</span>{" "}
          rate using the selected P.Fuel. Auxiliary Engine (AE) always runs on{" "}
          <span className="font-medium">LSMGO</span>.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left py-2 px-2 font-medium">Port</th>
                <th className="text-left py-2 px-2 font-medium">Operation</th>
                <th className="text-center py-2 px-2 font-medium">P.Fuel</th>
                <th className="text-right py-2 px-2 font-medium">Working (d)</th>
                <th className="text-right py-2 px-2 font-medium">Turn (d)</th>
                <th className="text-right py-2 px-2 font-medium">Extra (d)</th>
                <th className="text-right py-2 px-2 font-medium text-orange-500">HSFO (mt)</th>
                <th className="text-right py-2 px-2 font-medium text-blue-500">VLSFO (mt)</th>
                <th className="text-right py-2 px-2 font-medium text-emerald-500">LSMGO ME (mt)</th>
                <th className="text-right py-2 px-2 font-medium text-emerald-600">LSMGO AE (mt)</th>
                <th className="text-right py-2 px-2 font-medium">Total (mt)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-4 text-muted-foreground">
                    No port legs in sequence.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1.5 px-2 font-medium">{r.port}</td>
                  <td className="py-1.5 px-2 capitalize text-muted-foreground">{r.operation}</td>
                  <td className="py-1.5 px-2 text-center">{fuelBadge(r.meFuel === "none" ? (r as any).meFuel : r.meFuel)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.workingDays.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.turnDays.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.extraDays.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.meHsfo.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.meVlsfo.toFixed(2)}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.meLsmgo.toFixed(2)}</td>
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
                  <td className="py-2 px-2" colSpan={3}>Totals</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.workingDays.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.turnDays.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.extraDays.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.meHsfo.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.meVlsfo.toFixed(2)}</td>
                  <td className="text-right py-2 px-2 font-mono">{totals.meLsmgo.toFixed(2)}</td>
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
            <div className="font-medium mb-1">ME Consumption Logic</div>
            <div className="text-muted-foreground">
              <span className="font-mono">Working = workingDays × Rate[P.Fuel, Load/Discharge]</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-mono">Turn + Extra = (turn + extra)/24 × Rate[P.Fuel, Idle]</span>
            </div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <div className="font-medium mb-1">AE Consumption Logic (LSMGO only)</div>
            <div className="text-muted-foreground">
              <span className="font-mono">AE = workingDays × AE[mode] + (turn+extra)/24 × AE[idle]</span>
            </div>
          </div>
        </div>
      </div>
    </BreakdownCard>
  );
}
