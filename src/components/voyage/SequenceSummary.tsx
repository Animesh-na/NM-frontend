import { useVoyageContext } from "@/context/VoyageContext";
import { useState } from "react";
import { InfoTooltip } from "./InfoTooltip";
import { CO2_EMISSION_FACTORS } from "@/utils/emissionCalculations";
import { computeLegSeaFuel, computePortFuel } from "@/utils/fuelBreakdown";

const co2eOf = (hsfo: number, vlsfo: number, lsmgo: number) =>
  hsfo * CO2_EMISSION_FACTORS.hsfo +
  vlsfo * CO2_EMISSION_FACTORS.vlsfo +
  lsmgo * CO2_EMISSION_FACTORS.lsmgo;

/**
 * Expandable detail panel for the Sequence summary. The compact Sea/Port/Total
 * toggle lives in the Sequence action row; this renders only the expanded
 * breakdown (or nothing when collapsed).
 */
export function SequenceSummary({ expanded }: { expanded: boolean }) {
  const { sequence, results, vessel, bunker } = useVoyageContext();
  const [fuelView, setFuelView] = useState<"leg" | "port">("leg");

  // ---------- Per-Leg (sea) and Per-Port fuel usage — shared engine-parity logic ----------
  const legFuelRows = computeLegSeaFuel(sequence, vessel, 1).map((r) => ({
    id: r.id,
    from: r.from,
    to: r.to,
    isLaden: r.isLaden,
    hsfo: r.meHsfo,
    vlsfo: r.meVlsfo,
    lsmgo: r.meLsmgoEca + r.aeLsmgo,
  }));

  const portFuelRows = computePortFuel(sequence, vessel).map((r) => ({
    id: r.id,
    port: r.port,
    operation: r.operation,
    hsfo: r.meHsfo,
    vlsfo: r.meVlsfo,
    lsmgo: r.meLsmgo + r.aeLsmgo,
  }));

  const legTotals = legFuelRows.reduce(
    (a, r) => ({ hsfo: a.hsfo + r.hsfo, vlsfo: a.vlsfo + r.vlsfo, lsmgo: a.lsmgo + r.lsmgo }),
    { hsfo: 0, vlsfo: 0, lsmgo: 0 }
  );
  const portTotals = portFuelRows.reduce(
    (a, r) => ({ hsfo: a.hsfo + r.hsfo, vlsfo: a.vlsfo + r.vlsfo, lsmgo: a.lsmgo + r.lsmgo }),
    { hsfo: 0, vlsfo: 0, lsmgo: 0 }
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

  if (!expanded) return null;

  return (
    <div className="space-y-2 mt-0.5 pt-1 border-t">
      {/* Expandable detail */}
      {true && (
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
                <span className="font-mono tabular-nums">{results.nonEcaDistance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} nm</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">ECA:</span>
                <span className="font-mono tabular-nums">{results.totalEcaDistance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} nm</span>
              </div>
              <div className="flex justify-between text-xs border-t pt-0.5 mt-0.5 font-medium">
                <span>Total:</span>
                <span className="font-mono tabular-nums">{(results.nonEcaDistance + results.totalEcaDistance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} nm</span>
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
                <InfoTooltip
                  formula="CO₂ = Fuel × Emission Factor"
                  description={`HSFO: ${CO2_EMISSION_FACTORS.hsfo}, VLSFO: ${CO2_EMISSION_FACTORS.vlsfo}, LSMGO: ${CO2_EMISSION_FACTORS.lsmgo} t CO₂/t fuel`}
                />
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
                  formula="Leg: ME non-ECA (HSFO/VLSFO) + ME ECA LSMGO + AE LSMGO, × reward factor. Port: load/disch ports burn the full stay at the Load/Disch rate of the selected P.Fuel; other ports burn the full stay at Idle rate. AE always LSMGO."
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
                    <th className="text-right font-medium pb-0.5 text-rose-600">HSFO (mt)</th>
                    <th className="text-right font-medium pb-0.5">Total (mt)</th>
                    <th className="text-right font-medium pb-0.5 text-primary">CO₂e (mt)</th>
                  </tr>
                </thead>
                <tbody>
                  {fuelView === "leg" && legFuelRows.length === 0 && (
                    <tr><td colSpan={7} className="py-1 text-center text-muted-foreground">No sea legs.</td></tr>
                  )}
                  {fuelView === "port" && portFuelRows.length === 0 && (
                    <tr><td colSpan={7} className="py-1 text-center text-muted-foreground">No port legs.</td></tr>
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
                        <td className="py-0.5 text-right font-mono tabular-nums">{r.hsfo.toFixed(2)}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums font-medium">
                          {(r.vlsfo + r.lsmgo + r.hsfo).toFixed(2)}
                        </td>
                        <td className="py-0.5 text-right font-mono tabular-nums text-primary">
                          {co2eOf(r.hsfo, r.vlsfo, r.lsmgo).toFixed(2)}
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
                        <td className="py-0.5 text-right font-mono tabular-nums">{r.hsfo.toFixed(2)}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums font-medium">
                          {(r.vlsfo + r.lsmgo + r.hsfo).toFixed(2)}
                        </td>
                        <td className="py-0.5 text-right font-mono tabular-nums text-primary">
                          {co2eOf(r.hsfo, r.vlsfo, r.lsmgo).toFixed(2)}
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
                    <td className="py-0.5 text-right font-mono tabular-nums text-rose-600">
                      {(fuelView === "leg" ? legTotals.hsfo : portTotals.hsfo).toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums text-primary">
                      {(
                        (fuelView === "leg"
                          ? legTotals.vlsfo + legTotals.lsmgo + legTotals.hsfo
                          : portTotals.vlsfo + portTotals.lsmgo + portTotals.hsfo)
                      ).toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums text-primary">
                      {(fuelView === "leg"
                        ? co2eOf(legTotals.hsfo, legTotals.vlsfo, legTotals.lsmgo)
                        : co2eOf(portTotals.hsfo, portTotals.vlsfo, portTotals.lsmgo)
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
                    <td className="py-0.5 text-right font-mono tabular-nums">
                      {(legTotals.hsfo + portTotals.hsfo).toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums font-semibold">
                      {(legTotals.vlsfo + legTotals.lsmgo + legTotals.hsfo + portTotals.vlsfo + portTotals.lsmgo + portTotals.hsfo).toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums font-semibold text-primary">
                      {co2eOf(
                        legTotals.hsfo + portTotals.hsfo,
                        legTotals.vlsfo + portTotals.vlsfo,
                        legTotals.lsmgo + portTotals.lsmgo,
                      ).toFixed(2)}
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
