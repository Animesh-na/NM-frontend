import { Fuel } from "lucide-react";
import { BreakdownCard } from "./BreakdownCard";
import type { SequenceRowUI } from "@/context/VoyageContext";
import type { VesselData } from "@/data/vessels";

interface PerPortFuelPanelProps {
  sequence: SequenceRowUI[];
  vessel: VesselData;
}

type FuelKey = "hsfo" | "vlsfo" | "lsmgo";

interface PortFuelRow {
  id: string | number;
  port: string;
  operation: string;
  workingDays: number;
  turnDays: number;
  extraDays: number;
  workingMode: "load" | "discharge" | "idle" | "none";
  meFuel: FuelKey | "none"; // ME fuel selection at port
  // ME consumption (driven by portFuelType)
  meHsfo: number;
  meVlsfo: number;
  meLsmgo: number;
  // AE always burns LSMGO
  aeLsmgo: number;
  total: number;
}

export function PerPortFuelPanel({ sequence, vessel }: PerPortFuelPanelProps) {
  const profile =
    vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;

  const rows: PortFuelRow[] = sequence
    .filter((r) => r.type !== "open" && r.type !== "repos")
    .map((r) => {
      const turnDays = (r.turnTime || 0) / 24;
      const extraDays = (r.extraTime || 0) / 24;
      const turnExtraDays = turnDays + extraDays;
      const totalPortDays = r.calculatedPortDays || 0;
      const workingDays = Math.max(0, totalPortDays - turnExtraDays);

      let workingMode: PortFuelRow["workingMode"] = "none";
      let meFuelForWorking: FuelKey | "none" = "none";
      let meHsfo = 0;
      let meVlsfo = 0;
      let meLsmgo = 0;

      const fuel = r.portFuelType;
      const meRateAt = (mode: "load" | "discharge" | "idle") => {
        if (fuel === "hsfo") return profile.hsfo[mode] || 0;
        if (fuel === "vlsfo") return profile.vlsfo[mode] || 0;
        return profile.lsmgo[mode] || 0;
      };

      // Working consumption (loading / discharging)
      if (r.operation === "loading") {
        workingMode = "load";
        meFuelForWorking = fuel;
        const v = workingDays * meRateAt("load");
        if (fuel === "hsfo") meHsfo += v;
        else if (fuel === "vlsfo") meVlsfo += v;
        else meLsmgo += v;
      } else if (r.operation === "discharging") {
        workingMode = "discharge";
        meFuelForWorking = fuel;
        const v = workingDays * meRateAt("discharge");
        if (fuel === "hsfo") meHsfo += v;
        else if (fuel === "vlsfo") meVlsfo += v;
        else meLsmgo += v;
      }

      // Turn + Extra time always burns at IDLE rate using selected port fuel
      const idleConsumed = turnExtraDays * meRateAt("idle");
      if (turnExtraDays > 0) {
        if (fuel === "hsfo") meHsfo += idleConsumed;
        else if (fuel === "vlsfo") meVlsfo += idleConsumed;
        else meLsmgo += idleConsumed;
      }

      // For pssg/bunkering legs, the entire time is idle-equivalent
      if (r.operation === "pssg" || r.operation === "bunkering") {
        // already covered: turnExtraDays === totalPortDays for these
      }

      // AE always on LSMGO at port
      const aeLoad = workingMode === "load" ? workingDays * (profile.ae.load || 0) : 0;
      const aeDischarge =
        workingMode === "discharge" ? workingDays * (profile.ae.discharge || 0) : 0;
      const aeIdle = turnExtraDays * (profile.ae.idle || 0);
      // For pssg/bunkering, idle covers the full duration via turnTime/extraTime
      const aeLsmgo = aeLoad + aeDischarge + aeIdle;

      const total = meHsfo + meVlsfo + meLsmgo + aeLsmgo;

      return {
        id: r.id,
        port: r.port || "(unset)",
        operation: r.operation || "-",
        workingDays,
        turnDays,
        extraDays,
        workingMode,
        meFuel: meFuelForWorking,
        meHsfo,
        meVlsfo,
        meLsmgo,
        aeLsmgo,
        total,
      };
    });

  const totals = rows.reduce(
    (acc, r) => {
      acc.workingDays += r.workingDays;
      acc.turnDays += r.turnDays;
      acc.extraDays += r.extraDays;
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
