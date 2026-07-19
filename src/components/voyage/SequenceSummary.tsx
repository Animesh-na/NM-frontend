import { useVoyageContext } from "@/context/VoyageContext";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";

export function SequenceSummary() {
  const { sequence, results, vessel } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [fuelView, setFuelView] = useState<"leg" | "port">("leg");

  // ---------- Per-Leg (sea) and Per-Port fuel usage (VLSFO / LSMGO focus) ----------
  const profile =
    vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
  const hasScrubber = vessel.hasScrubber === true;
  const aeProfile = hasScrubber ? profile.aeScrubber : profile.ae;

  let cargoOnBoard = 0;
  let prevPort = "—";
  const legFuelRows: Array<{
    id: string | number;
    from: string;
    to: string;
    isLaden: boolean;
    vlsfo: number;
    lsmgo: number;
  }> = [];
  sequence.forEach((r) => {
    if (r.type === "open") {
      prevPort = r.port || "Open";
      return;
    }
    const isLaden = cargoOnBoard > 0;
    const totalSeaDays = r.totalLegTime || 0;
    const ecaDays = r.ecaTime || 0;
    const nonEcaDays = Math.max(0, totalSeaDays - ecaDays);
    let vlsfo = 0;
    if (!hasScrubber) {
      const rate = isLaden ? profile.vlsfo.laden || 0 : profile.vlsfo.ballast || 0;
      vlsfo = nonEcaDays * rate;
    }
    const meLsmgoEca =
      ecaDays * (isLaden ? profile.lsmgo.laden || 0 : profile.lsmgo.ballast || 0);
    const aeLsmgo =
      totalSeaDays * (isLaden ? aeProfile.laden || 0 : aeProfile.ballast || 0);
    legFuelRows.push({
      id: r.id,
      from: prevPort,
      to: r.port || "(unset)",
      isLaden,
      vlsfo,
      lsmgo: meLsmgoEca + aeLsmgo,
    });
    const op = (r.operation || "").toLowerCase();
    const qty = Math.max(0, Number(r.quantity) || 0);
    if (op === "loading") cargoOnBoard += qty;
    else if (op === "discharging") cargoOnBoard = Math.max(0, cargoOnBoard - qty);
    prevPort = r.port || prevPort;
  });

  const portFuelRows = sequence
    .filter((r) => r.type !== "open" && r.type !== "repos")
    .map((r) => {
      const turnDays = (r.turnTime || 0) / 24;
      const extraDays = (r.extraTime || 0) / 24;
      const turnExtra = turnDays + extraDays;
      const totalPortDays = r.calculatedPortDays || 0;
      const workingDays = Math.max(0, totalPortDays - turnExtra);
      const fuel = r.portFuelType;
      const meRateAt = (mode: "load" | "discharge" | "idle") => {
        if (fuel === "hsfo") return profile.hsfo[mode] || 0;
        if (fuel === "vlsfo") return profile.vlsfo[mode] || 0;
        return profile.lsmgo[mode] || 0;
      };
      let workingMode: "load" | "discharge" | "none" = "none";
      if (r.operation === "loading") workingMode = "load";
      else if (r.operation === "discharging") workingMode = "discharge";
      const workingConsumed =
        workingMode !== "none" ? workingDays * meRateAt(workingMode) : 0;
      const idleConsumed = turnExtra * meRateAt("idle");
      const totalMe = workingConsumed + idleConsumed;
      let vlsfo = 0;
      let lsmgoMe = 0;
      if (fuel === "vlsfo") vlsfo = totalMe;
      else if (fuel === "lsmgo") lsmgoMe = totalMe;
      const aeLoad = workingMode === "load" ? workingDays * (profile.ae.load || 0) : 0;
      const aeDischarge =
        workingMode === "discharge" ? workingDays * (profile.ae.discharge || 0) : 0;
      const aeIdle = turnExtra * (profile.ae.idle || 0);
      const aeLsmgo = aeLoad + aeDischarge + aeIdle;
      return {
        id: r.id,
        port: r.port || "(unset)",
        operation: r.operation || "-",
        vlsfo,
        lsmgo: lsmgoMe + aeLsmgo,
      };
    });

  const legTotals = legFuelRows.reduce(
    (a, r) => ({ vlsfo: a.vlsfo + r.vlsfo, lsmgo: a.lsmgo + r.lsmgo }),
    { vlsfo: 0, lsmgo: 0 }
  );
  const portTotals = portFuelRows.reduce(
    (a, r) => ({ vlsfo: a.vlsfo + r.vlsfo, lsmgo: a.lsmgo + r.lsmgo }),
    { vlsfo: 0, lsmgo: 0 }
  );

  // Calculate totals from sequence rows
  const totals = sequence.reduce(
    (acc, row) => {
      if (row.type !== "open") {
        acc.baseSeaTime += row.baseSeaTime;
        acc.seaMarginTime += row.seaMarginTime;
        acc.totalSeaTime += row.totalLegTime;
        acc.portDays += row.wdaysPortOverride ?? row.calculatedPortDays;
        acc.weatherDelayDays += Math.abs(row.weatherDelayHours ?? 0) / 24;
      }
      return acc;
    },
    { baseSeaTime: 0, seaMarginTime: 0, totalSeaTime: 0, portDays: 0, weatherDelayDays: 0 }
  );

  const fmtDT = (s?: string) => {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    });
  };

  return (
    <div className="mt-1 pt-1 border-t">
      {/* Compact inline summary - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-[10px] hover:bg-muted/30 rounded px-1 py-0.5"
      >
        <span className="font-medium text-muted-foreground">Sequence Summary</span>
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span className="text-muted-foreground">Sea: <span className="text-foreground font-medium">{results.totalSeaDays.toFixed(2)}d</span></span>
          <span className="text-muted-foreground">Port: <span className="text-foreground font-medium">{results.totalPortDays.toFixed(2)}d</span></span>
          <span className="text-muted-foreground">Total: <span className="text-primary font-bold">{results.totalVoyageDays.toFixed(2)}d</span></span>
          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
        </div>
      </button>

      {/* Expandable detail */}
      {isExpanded && (
        <div className="space-y-2 mt-1">
          {/* Leg breakdown table */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium pb-0.5">Leg</th>
                    <th className="text-right font-medium pb-0.5">SM%</th>
                    <th className="text-right font-medium pb-0.5">Base</th>
                    <th className="text-right font-medium pb-0.5">+Margin</th>
                    <th className="text-right font-medium pb-0.5">Wx</th>
                    <th className="text-right font-medium pb-0.5">Sea</th>
                    <th className="text-right font-medium pb-0.5">Port</th>
                    <th className="text-right font-medium pb-0.5">Arr</th>
                    <th className="text-right font-medium pb-0.5">Dep</th>
                  </tr>
                </thead>
                <tbody>
                  {sequence.slice(1).map((row) => (
                    <tr key={row.id} className="border-t border-border/50">
                      <td className="py-0.5 text-muted-foreground truncate max-w-[100px]">
                        {row.port || row.type}
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums text-muted-foreground">
                        {row.seaMargin || 0}%
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums text-muted-foreground">
                        {row.baseSeaTime.toFixed(2)}d
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums text-warning">
                        {row.seaMarginTime > 0 ? `+${row.seaMarginTime.toFixed(2)}d` : "—"}
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums text-blue-600">
                        {Math.abs(row.weatherDelayHours ?? 0) > 0
                          ? `+${(Math.abs(row.weatherDelayHours ?? 0) / 24).toFixed(2)}d`
                          : "—"}
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums">
                        {row.totalLegTime.toFixed(2)}d
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums">
                        {(row.wdaysPortOverride ?? row.calculatedPortDays).toFixed(2)}d
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums text-[10px] text-muted-foreground">
                        {fmtDT(row.legArrivalUtc)}
                      </td>
                      <td className="py-0.5 text-right font-mono tabular-nums text-[10px] text-muted-foreground">
                        {fmtDT(row.legDepartureUtc)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-muted/30 rounded p-1.5 space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Base sea time:</span>
                <span className="font-mono tabular-nums">{totals.baseSeaTime.toFixed(2)}d</span>
              </div>
              <div className="flex justify-between text-xs text-warning">
                <span>+ Sea margin:</span>
                <span className="font-mono tabular-nums">+{totals.seaMarginTime.toFixed(2)}d</span>
              </div>
              <div className="flex justify-between text-xs text-blue-600">
                <span>+ Weather delay:</span>
                <span className="font-mono tabular-nums">+{totals.weatherDelayDays.toFixed(2)}d</span>
              </div>
              <div className="flex justify-between text-xs border-t pt-0.5 mt-0.5">
                <span className="text-muted-foreground">Total at sea:</span>
                <span className="font-mono tabular-nums font-medium">{results.totalSeaDays.toFixed(2)}d</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total in port:</span>
                <span className="font-mono tabular-nums font-medium">{results.totalPortDays.toFixed(2)}d</span>
              </div>
              <div className="flex justify-between text-xs border-t pt-0.5 mt-0.5">
                <span className="font-medium">Total voyage:</span>
                <span className="font-mono tabular-nums font-bold text-primary">
                  {results.totalVoyageDays.toFixed(2)}d
                </span>
              </div>
            </div>
          </div>

          {/* Distance, Fuel & CO2 Breakdown */}
          <div className="grid grid-cols-3 gap-3 border-t pt-1.5">
            {/* Distance Breakdown */}
            <div className="bg-muted/30 rounded p-1.5 space-y-0.5">
              <div className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center">
                Distance Breakdown
                <InfoTooltip formula="Total = Non-ECA + ECA" description="Distance split by Emission Control Area zones." />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Non-ECA:</span>
                <span className="font-mono tabular-nums">{results.nonEcaDistance.toLocaleString()} nm</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">ECA:</span>
                <span className="font-mono tabular-nums">{results.totalEcaDistance.toLocaleString()} nm</span>
              </div>
              <div className="flex justify-between text-xs border-t pt-0.5 mt-0.5 font-medium">
                <span>Total:</span>
                <span className="font-mono tabular-nums">{(results.nonEcaDistance + results.totalEcaDistance).toLocaleString()} nm</span>
              </div>
            </div>

            {/* Fuel Consumption Breakdown */}
            <div className="bg-muted/30 rounded p-1.5 space-y-0.5">
              <div className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center">
                Fuel Breakdown (MT)
                <InfoTooltip formula="Fuel = Sea Days × Daily Rate (MT/day)" description="ECA zones use LSMGO only. Non-ECA uses HSFO/VLSFO." />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Non-ECA:</span>
                <span className="font-mono tabular-nums">{results.nonEcaFuel.total.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">ECA (LSMGO):</span>
                <span className="font-mono tabular-nums">{results.ecaFuel.total.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-xs border-t pt-0.5 mt-0.5">
                <span className="text-muted-foreground">HSFO:</span>
                <span className="font-mono tabular-nums">{results.hsfoConsumption.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">VLSFO:</span>
                <span className="font-mono tabular-nums">{results.vlsfoConsumption.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">LSMGO:</span>
                <span className="font-mono tabular-nums">{results.lsmgoConsumption.toFixed(1)}</span>
              </div>
            </div>

            {/* CO2 Emission Breakdown */}
            <div className="bg-muted/30 rounded p-1.5 space-y-0.5">
              <div className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center">
                CO₂ Breakdown (MT)
                <InfoTooltip formula="CO₂ = Fuel × Emission Factor" description="HSFO: 3.114, VLSFO: 3.151, LSMGO: 3.206 t CO₂/t fuel" />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Non-ECA CO₂:</span>
                <span className="font-mono tabular-nums">{results.nonEcaCo2.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">ECA CO₂:</span>
                <span className="font-mono tabular-nums">{results.ecaCo2.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-xs border-t pt-0.5 mt-0.5 font-medium">
                <span>Total CO₂:</span>
                <span className="font-mono tabular-nums text-primary">{results.totalCo2.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Per-Leg / Per-Port Fuel Usage (VLSFO & LSMGO) */}
          <div className="border-t pt-1.5">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-medium text-muted-foreground flex items-center">
                Fuel Usage — VLSFO &amp; LSMGO
                <InfoTooltip
                  formula="Leg: ME non-ECA (VLSFO) + ME ECA LSMGO + AE LSMGO. Port: ME (working + turn/extra idle) at selected P.Fuel + AE LSMGO."
                  description="Toggle between per-leg (sea) and per-port fuel usage."
                />
              </div>
              <div className="flex items-center rounded border border-border overflow-hidden text-[10px]">
                <button
                  onClick={() => setFuelView("leg")}
                  className={`px-2 py-0.5 ${
                    fuelView === "leg" ? "bg-primary text-primary-foreground" : "bg-muted/30"
                  }`}
                >
                  Per Leg
                </button>
                <button
                  onClick={() => setFuelView("port")}
                  className={`px-2 py-0.5 ${
                    fuelView === "port" ? "bg-primary text-primary-foreground" : "bg-muted/30"
                  }`}
                >
                  Per Port
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/50">
                    {fuelView === "leg" ? (
                      <>
                        <th className="text-left font-medium pb-0.5">Leg</th>
                        <th className="text-center font-medium pb-0.5">State</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left font-medium pb-0.5">Port</th>
                        <th className="text-left font-medium pb-0.5">Op</th>
                      </>
                    )}
                    <th className="text-right font-medium pb-0.5 text-blue-600">VLSFO (mt)</th>
                    <th className="text-right font-medium pb-0.5 text-emerald-600">LSMGO (mt)</th>
                    <th className="text-right font-medium pb-0.5">Total (mt)</th>
                  </tr>
                </thead>
                <tbody>
                  {fuelView === "leg" && legFuelRows.length === 0 && (
                    <tr><td colSpan={5} className="py-1 text-center text-muted-foreground">No sea legs.</td></tr>
                  )}
                  {fuelView === "port" && portFuelRows.length === 0 && (
                    <tr><td colSpan={5} className="py-1 text-center text-muted-foreground">No port legs.</td></tr>
                  )}
                  {fuelView === "leg" &&
                    legFuelRows.map((r) => (
                      <tr key={r.id} className="border-t border-border/30">
                        <td className="py-0.5 truncate max-w-[160px]">
                          <span className="text-muted-foreground">{r.from}</span>
                          <span className="mx-1 text-muted-foreground">→</span>
                          <span>{r.to}</span>
                        </td>
                        <td className="py-0.5 text-center">
                          <span
                            className={`px-1 py-0.5 rounded text-[9px] ${
                              r.isLaden
                                ? "bg-amber-500/15 text-amber-600"
                                : "bg-sky-500/15 text-sky-600"
                            }`}
                          >
                            {r.isLaden ? "LADEN" : "BAL"}
                          </span>
                        </td>
                        <td className="py-0.5 text-right font-mono tabular-nums">{r.vlsfo.toFixed(2)}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums">{r.lsmgo.toFixed(2)}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums font-medium">
                          {(r.vlsfo + r.lsmgo).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  {fuelView === "port" &&
                    portFuelRows.map((r) => (
                      <tr key={r.id} className="border-t border-border/30">
                        <td className="py-0.5 truncate max-w-[160px]">{r.port}</td>
                        <td className="py-0.5 capitalize text-muted-foreground">{r.operation}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums">{r.vlsfo.toFixed(2)}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums">{r.lsmgo.toFixed(2)}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums font-medium">
                          {(r.vlsfo + r.lsmgo).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium bg-muted/30">
                    <td className="py-0.5" colSpan={2}>
                      Voyage Total ({fuelView === "leg" ? "Sea" : "Port"})
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums text-blue-600">
                      {(fuelView === "leg" ? legTotals.vlsfo : portTotals.vlsfo).toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums text-emerald-600">
                      {(fuelView === "leg" ? legTotals.lsmgo : portTotals.lsmgo).toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums text-primary">
                      {(
                        (fuelView === "leg" ? legTotals.vlsfo + legTotals.lsmgo : portTotals.vlsfo + portTotals.lsmgo)
                      ).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-t border-border/50 text-muted-foreground">
                    <td className="py-0.5" colSpan={2}>Voyage Total (Sea + Port)</td>
                    <td className="py-0.5 text-right font-mono tabular-nums">
                      {(legTotals.vlsfo + portTotals.vlsfo).toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums">
                      {(legTotals.lsmgo + portTotals.lsmgo).toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums font-semibold">
                      {(legTotals.vlsfo + legTotals.lsmgo + portTotals.vlsfo + portTotals.lsmgo).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
