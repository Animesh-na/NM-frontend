import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";
import { useVoyageContext } from "@/context/VoyageContext";
import { getCargoLoadedQuantities } from "@/utils/cargoValidation";

interface Row {
  delta: number;
  input: number;
  ntce: number;
  gtce: number;
  pAndL: number;
  grossRate: number;
}


const money = (v: number) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const signCls = (v: number) => (v >= 0 ? "text-success" : "text-destructive");

type FuelKey = "hsfo" | "vlsfo" | "lsmgo";

const FUELS: { key: FuelKey; label: string }[] = [
  { key: "hsfo", label: "HSFO" },
  { key: "vlsfo", label: "VLSFO" },
  { key: "lsmgo", label: "LSMGO" },
];

export function SensitivityAnalysis() {
  const { results, cargos, sequence } = useVoyageContext();
  const [freightStep, setFreightStep] = useState(0.5);
  const [bunkerStep, setBunkerStep] = useState(1);
  const [fuel, setFuel] = useState<FuelKey>("vlsfo");
  const [cargoId, setCargoId] = useState<number | null>(null);

  const activeCargo =
    cargos.find((c) => c.id === cargoId) || cargos[0];

  // Per-cargo loaded quantities (falls back to total when unmapped)
  const cargoQtys = useMemo(
    () => getCargoLoadedQuantities(cargos, sequence),
    [cargos, sequence]
  );
  const totalLoadQty = useMemo(
    () =>
      sequence
        .filter((r) => r.operation === "loading")
        .reduce((s, r) => s + (r.quantity || 0), 0),
    [sequence]
  );
  const loadQty =
    (activeCargo ? cargoQtys.get(activeCargo.id) : 0) || totalLoadQty;
  const baseRate = activeCargo?.rate || 0;
  const days = results.totalVoyageDays || 0;
  const commPct = activeCargo
    ? Math.min(Math.max((activeCargo.voyageCommission || 0) / 100, 0), 0.95)
    : results.grossFreight > 0
      ? results.voyageCommission / results.grossFreight
      : 0;
  // GTCE = NTCE / (1 - tcComm)
  const tcPct = Math.min(Math.max((activeCargo?.tcCommission || 0) / 100, 0), 0.95);
  const grossUp = 1 / (1 - tcPct);
  const fuelTons: Record<FuelKey, number> = {
    hsfo: results.hsfoConsumption || 0,
    vlsfo: results.vlsfoConsumption || 0,
    lsmgo: results.lsmgoConsumption || 0,
  };


  const buildRows = (mode: "freight" | "bunker", step: number, tons = 0): Row[] => {
    const out: Row[] = [];
    for (let i = -5; i <= 5; i++) {
      const delta = i * step;
      let dNetFreight = 0;
      let dCost = 0;
      if (mode === "freight") {
        dNetFreight = delta * loadQty * (1 - commPct);
      } else {
        dCost = delta * tons;
      }
      const pAndL = results.pAndL + dNetFreight - dCost;
      const ntce = days > 0 ? results.ntce + (dNetFreight - dCost) / days : 0;
      out.push({
        delta,
        input: mode === "freight" ? baseRate + delta : delta,
        ntce,
        gtce: ntce * grossUp,
        pAndL,
      });
    }
    return out;
  };

  const freightRows = useMemo(
    () => buildRows("freight", freightStep || 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [freightStep, results, loadQty, commPct, days, baseRate, grossUp]
  );
  const bunkerRows = useMemo(
    () => buildRows("bunker", bunkerStep || 0, fuelTons[fuel]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bunkerStep, results, fuel, days, grossUp]
  );


  const renderTable = (rows: Row[], mode: "freight" | "bunker") => (
    <div className="border border-border rounded-sm overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-muted">
          <tr className="text-left">
            <th className="px-2 py-1 font-medium">
              {mode === "freight" ? "Δ Rate ($/mt)" : "Δ Bunker ($/t)"}
            </th>
            <th className="px-2 py-1 font-medium">
              {mode === "freight" ? "Freight Rate" : "Bunker Δ applied"}
            </th>
            <th className="px-2 py-1 font-medium text-right">Net TCE ($/d)</th>
            <th className="px-2 py-1 font-medium text-right">Gross TCE ($/d)</th>
            <th className="px-2 py-1 font-medium text-right">P&amp;L ($)</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => (
            <tr
              key={r.delta}
              className={`border-t border-border ${r.delta === 0 ? "bg-primary/10 font-semibold" : ""}`}
            >
              <td className={`px-2 py-1 ${r.delta === 0 ? "" : signCls(r.delta)}`}>
                {r.delta > 0 ? "+" : ""}
                {r.delta.toFixed(2)}
              </td>
              <td className="px-2 py-1">
                {mode === "freight" ? `$${r.input.toFixed(2)}` : `${r.delta >= 0 ? "+" : ""}$${r.delta.toFixed(2)}`}
              </td>
              <td className={`px-2 py-1 text-right ${signCls(r.ntce)}`}>{money(r.ntce)}</td>
              <td className={`px-2 py-1 text-right ${signCls(r.gtce)}`}>{money(r.gtce)}</td>
              <td className={`px-2 py-1 text-right ${signCls(r.pAndL)}`}>{money(r.pAndL)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderChart = (rows: Row[], mode: "freight" | "bunker") => (
    <div className="h-64 w-full mt-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey={mode === "freight" ? "input" : "delta"}
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => (mode === "freight" ? `$${v.toFixed(1)}` : `${v > 0 ? "+" : ""}${v}`)}
            label={{
              value: mode === "freight" ? "Freight rate ($/mt)" : "Bunker price change ($/t)",
              position: "insideBottom",
              offset: -4,
              fontSize: 10,
            }}
          />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
          <ReTooltip
            formatter={(v: number, n: string) => [money(v), n]}
            contentStyle={{ fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey="gtce" name="Gross TCE" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="ntce" name="Net TCE" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Sensitivity analysis"
          className="ml-auto inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-medium hover:bg-accent transition-colors"
        >
          <Activity className="h-3 w-3" />
          Sensitivity
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Sensitivity Analysis</DialogTitle>
        </DialogHeader>

        {cargos.length > 1 && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Cargo:</span>
            <div className="inline-flex rounded-sm border border-border overflow-hidden">
              {cargos.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCargoId(c.id)}
                  className={`px-2 h-7 text-[11px] font-medium transition-colors ${
                    (activeCargo?.id ?? cargos[0]?.id) === c.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  Cargo #{i + 1}
                </button>
              ))}
            </div>
            <span className="text-muted-foreground">
              freight sensitivity applies to the selected cargo only
            </span>
          </div>
        )}


        <div className="grid grid-cols-6 gap-2 text-[10px]">
          <div className="bg-muted rounded-sm p-2">
            <div className="text-muted-foreground">Base Freight Rate</div>
            <div className="font-mono font-semibold">${baseRate.toFixed(2)} /mt</div>
          </div>
          <div className="bg-muted rounded-sm p-2">
            <div className="text-muted-foreground">Load Qty</div>
            <div className="font-mono font-semibold">{loadQty.toLocaleString()} mt</div>
          </div>
          <div className="bg-muted rounded-sm p-2">
            <div className="text-muted-foreground">HSFO</div>
            <div className="font-mono font-semibold">{fuelTons.hsfo.toFixed(1)} mt</div>
          </div>
          <div className="bg-muted rounded-sm p-2">
            <div className="text-muted-foreground">VLSFO</div>
            <div className="font-mono font-semibold">{fuelTons.vlsfo.toFixed(1)} mt</div>
          </div>
          <div className="bg-muted rounded-sm p-2">
            <div className="text-muted-foreground">LSMGO</div>
            <div className="font-mono font-semibold">{fuelTons.lsmgo.toFixed(1)} mt</div>
          </div>
          <div className="bg-muted rounded-sm p-2">
            <div className="text-muted-foreground">Voyage Days</div>
            <div className="font-mono font-semibold">{days.toFixed(2)} d</div>
          </div>
        </div>

        <Tabs defaultValue="freight" className="mt-2">
          <TabsList className="h-7">
            <TabsTrigger value="freight" className="text-[11px] h-6">Freight Rate</TabsTrigger>
            <TabsTrigger value="bunker" className="text-[11px] h-6">Bunker Price</TabsTrigger>
          </TabsList>

          <TabsContent value="freight" className="space-y-2">
            <label className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">Step ($/mt per row):</span>
              <input
                type="number"
                step="0.1"
                value={freightStep}
                onChange={(e) => setFreightStep(Number(e.target.value))}
                className="sheet-input w-24 h-7 px-2 border border-border rounded-sm font-mono text-[11px]"
              />
              <span className="text-muted-foreground">5 steps up / 5 steps down</span>
            </label>
            <div className="grid grid-cols-2 gap-3 items-start">
              {renderTable(freightRows, "freight")}
              {renderChart(freightRows, "freight")}
            </div>
          </TabsContent>

          <TabsContent value="bunker" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">Fuel:</span>
              <div className="inline-flex rounded-sm border border-border overflow-hidden">
                {FUELS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFuel(f.key)}
                    className={`px-2 h-7 text-[11px] font-medium transition-colors ${
                      fuel === f.key ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="text-muted-foreground ml-2">Step ($/t per row):</span>
              <input
                type="number"
                step="1"
                value={bunkerStep}
                onChange={(e) => setBunkerStep(Number(e.target.value))}
                className="sheet-input w-24 h-7 px-2 border border-border rounded-sm font-mono text-[11px]"
              />
              <span className="text-muted-foreground">
                applied to {FUELS.find((f) => f.key === fuel)?.label} only ·{" "}
                {fuelTons[fuel].toFixed(1)} mt burnt
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 items-start">
              {renderTable(bunkerRows, "bunker")}
              {renderChart(bunkerRows, "bunker")}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

    </Dialog>
  );
}
