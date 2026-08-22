import { useMemo } from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";
import { useVoyageContext } from "@/context/VoyageContext";

const money = (v: number) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const pct = (v: number) =>
  `${v > 0 ? "+" : ""}${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

export function InsightsPanel() {
  const { results, misc } = useVoyageContext();

  const portDa = results.portCosts || 0;
  const bunkerCharges = results.totalBunkerCost || 0;
  const canalFees = results.canalCosts || 0;
  const insurance = misc?.extraInsurance || 0;
  const miscOps = (misc?.miscCost || 0) + (misc?.extraFees || 0);
  const ownerPayment = results.hireCost || 0;
  const profit = results.pAndL || 0;

  const chartData = useMemo(
    () => [
      { name: "Port DA", value: portDa },
      { name: "Bunker", value: bunkerCharges },
      { name: "Canal", value: canalFees },
      { name: "Misc Ops", value: miscOps },
      { name: "Insurance", value: insurance },
      { name: "Vessel Owner", value: ownerPayment },
      { name: "P&L", value: profit },
    ],
    [portDa, bunkerCharges, canalFees, miscOps, insurance, ownerPayment, profit]
  );

  // Break-even sensitivity: % change in a cost driver that drives operator profit to zero
  const breakEven = (base: number) => (base > 0 ? (profit / base) * 100 : null);

  const drivers = [
    { label: "Bunker charges", base: bunkerCharges, be: breakEven(bunkerCharges) },
    { label: "Port DA charges", base: portDa, be: breakEven(portDa) },
    { label: "Canal fees", base: canalFees, be: breakEven(canalFees) },
    { label: "Miscellaneous operational charges", base: miscOps, be: breakEven(miscOps) },
    { label: "Insurance", base: insurance, be: breakEven(insurance) },
    { label: "Payment to vessel owner", base: ownerPayment, be: breakEven(ownerPayment) },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Voyage cost insights"
          className="ml-auto inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-medium hover:bg-accent transition-colors"
        >
          <BarChart3 className="h-3 w-3" />
          Insights
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Voyage Insights</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
          {/* Bar chart */}
          <div className="rounded-md border border-border p-3">
            <div className="text-[11px] font-semibold mb-2">Cost & Profit Distribution</div>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 16, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`}
                  />
                  <ReTooltip formatter={(v: number) => money(v)} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {chartData.map((d) => (
                      <Cell
                        key={d.name}
                        fill={
                          d.name === "P&L"
                            ? d.value >= 0
                              ? "hsl(var(--success, 142 71% 40%))"
                              : "hsl(var(--destructive))"
                            : "hsl(var(--primary))"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Values + break-even */}
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <div className="text-[11px] font-semibold mb-2">Values</div>
              <table className="w-full text-[11px]">
                <tbody>
                  {chartData.map((d) => (
                    <tr key={d.name} className="border-b border-border/50 last:border-0">
                      <td className="py-1 text-muted-foreground">{d.name}</td>
                      <td
                        className={`py-1 text-right font-mono tabular-nums ${
                          d.name === "P&L" ? (d.value >= 0 ? "text-success" : "text-destructive") : ""
                        }`}
                      >
                        {money(d.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="text-[11px] font-semibold mb-1">Break-even Sensitivity</div>
              <div className="text-[10px] text-muted-foreground mb-2">
                Change in each cost driver that brings profit to operator to $0.00 (all else unchanged).
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-1">Driver</th>
                    <th className="text-right font-medium py-1">Base</th>
                    <th className="text-right font-medium py-1">Break-even %</th>
                    <th className="text-right font-medium py-1">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.label} className="border-b border-border/50 last:border-0">
                      <td className="py-1">{d.label}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{money(d.base)}</td>
                      <td
                        className={`py-1 text-right font-mono tabular-nums ${
                          d.be === null ? "text-muted-foreground" : d.be >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {d.be === null ? "n/a" : pct(d.be)}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">
                        {d.be === null ? "—" : money((d.base * d.be) / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                {drivers
                  .filter((d) => d.be !== null)
                  .slice(0, 2)
                  .map((d) => (
                    <li key={d.label}>
                      If the {d.label.toLowerCase()} {d.be! >= 0 ? "increase" : "decrease"} by{" "}
                      <span className="font-mono">{Math.abs(d.be!).toFixed(2)}%</span>, profit to operator will be $0.00.
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
