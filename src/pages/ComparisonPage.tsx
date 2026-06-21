import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend } from "recharts";
import { useSheets } from "@/context/sheetContextCore";
import { getSheet } from "@/services/marineApi";
import { VoyageProvider, useVoyageContext } from "@/context/VoyageContext";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import { toast } from "@/components/ui/sonner";

interface SheetEntry {
  id: string;
  name: string;
  data: Record<string, unknown>;
  vesselName: string;
  results: VoyageResults | null;
  cargos: Array<{ grade?: string; quantity?: number; loadPort?: string; dischargePort?: string }>;
}

// ─────────────────────────────────────────────────────────
// Hidden runner: mounts a VoyageProvider per sheet and emits
// calculated results back to the parent.
// ─────────────────────────────────────────────────────────
function ResultEmitter({ onResult }: { onResult: (r: VoyageResults, vesselName: string) => void }) {
  const ctx = useVoyageContext();
  useEffect(() => {
    if (ctx.results) onResult(ctx.results, ctx.vessel?.name || "—");
  }, [ctx.results, ctx.vessel?.name, onResult]);
  return null;
}

function HiddenRunner({ data, onResult }: { data: Record<string, unknown>; onResult: (r: VoyageResults, vesselName: string) => void }) {
  // Preserve all saved settings (including autoDistanceEnabled, which also
  // drives weather-delay handling in sea-time calculations). The provider's
  // internal distanceSuppressedRef already prevents the external distance API
  // from firing when initialData.sequence is present, so values match the
  // editor exactly.
  const safeData = useMemo(() => data, [data]);
  return (
    <div style={{ display: "none" }} aria-hidden>
      <VoyageProvider initialData={safeData}>
        <ResultEmitter onResult={onResult} />
      </VoyageProvider>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Metric definitions
// ─────────────────────────────────────────────────────────
type MetricDir = "higher" | "lower";
interface Metric {
  key: string;
  label: string;
  group: string;
  unit?: string;
  better: MetricDir;
  get: (r: VoyageResults) => number;
  fmt?: (v: number) => string;
}

const $ = (v: number) => `$${Math.round(v).toLocaleString()}`;
const num = (d = 1) => (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

const METRICS: Metric[] = [
  // Voyage Metrics
  { key: "totalVoyageDays", label: "Voyage Days", group: "Voyage Metrics", unit: "d", better: "lower", get: r => r.totalVoyageDays, fmt: num(2) },
  { key: "totalSeaDays", label: "Sea Days", group: "Voyage Metrics", unit: "d", better: "lower", get: r => r.totalSeaDays, fmt: num(2) },
  { key: "seaDaysBallast", label: "Ballast Days", group: "Voyage Metrics", unit: "d", better: "lower", get: r => r.seaDaysBallast, fmt: num(2) },
  { key: "seaDaysLaden", label: "Laden Days", group: "Voyage Metrics", unit: "d", better: "lower", get: r => r.seaDaysLaden, fmt: num(2) },
  { key: "totalPortDays", label: "Port Days", group: "Voyage Metrics", unit: "d", better: "lower", get: r => r.totalPortDays, fmt: num(2) },
  { key: "extraCanalDays", label: "Canal Days", group: "Voyage Metrics", unit: "d", better: "lower", get: r => r.extraCanalDays, fmt: num(2) },
  { key: "seaMarginTime", label: "Weather/Sea Margin", group: "Voyage Metrics", unit: "d", better: "lower", get: r => (r as unknown as { seaMarginTime?: number }).seaMarginTime || 0, fmt: num(2) },

  // Financial Metrics
  { key: "grossFreight", label: "Freight Revenue", group: "Financial Metrics", better: "higher", get: r => r.grossFreight, fmt: $ },
  { key: "hireCost", label: "Hire Cost", group: "Financial Metrics", better: "lower", get: r => r.hireCost, fmt: $ },
  { key: "totalBunkerCost", label: "Fuel Cost", group: "Financial Metrics", better: "lower", get: r => r.totalBunkerCost, fmt: $ },
  { key: "portCosts", label: "Port Charges", group: "Financial Metrics", better: "lower", get: r => r.portCosts, fmt: $ },
  { key: "canalCosts", label: "Canal Charges", group: "Financial Metrics", better: "lower", get: r => r.canalCosts, fmt: $ },
  { key: "miscCosts", label: "Miscellaneous Cost", group: "Financial Metrics", better: "lower", get: r => r.miscCosts, fmt: $ },
  { key: "voyageCommission", label: "Commission", group: "Financial Metrics", better: "lower", get: r => r.voyageCommission, fmt: $ },
  { key: "totalVoyageCosts", label: "Total Voyage Expense", group: "Financial Metrics", better: "lower", get: r => r.totalVoyageCosts, fmt: $ },
  { key: "pAndL", label: "P&L", group: "Financial Metrics", better: "higher", get: r => (r as unknown as { pAndL?: number }).pAndL ?? r.netProfit, fmt: $ },
  { key: "netProfit", label: "Net Voyage Result", group: "Financial Metrics", better: "higher", get: r => r.netProfit, fmt: $ },
  { key: "gtce", label: "GTCE", group: "Financial Metrics", unit: "$/d", better: "higher", get: r => (r as unknown as { gtce?: number }).gtce ?? r.tce, fmt: $ },
  { key: "ntce", label: "NTCE", group: "Financial Metrics", unit: "$/d", better: "higher", get: r => (r as unknown as { ntce?: number }).ntce ?? r.tce, fmt: $ },
  { key: "grossRate", label: "Gross Rate", group: "Financial Metrics", unit: "$/mt", better: "lower", get: r => r.grossRate, fmt: num(2) },

  // Fuel Consumption
  { key: "hsfoConsumption", label: "HSFO Consumption", group: "Fuel Consumption", unit: "mt", better: "lower", get: r => r.hsfoConsumption, fmt: num(2) },
  { key: "vlsfoConsumption", label: "VLSFO Consumption", group: "Fuel Consumption", unit: "mt", better: "lower", get: r => r.vlsfoConsumption, fmt: num(2) },
  { key: "lsmgoConsumption", label: "MGO Consumption", group: "Fuel Consumption", unit: "mt", better: "lower", get: r => r.lsmgoConsumption, fmt: num(2) },
  { key: "ecaFuel", label: "ECA Consumption", group: "Fuel Consumption", unit: "mt", better: "lower", get: r => r.ecaFuel?.total || 0, fmt: num(2) },
  { key: "totalConsumption", label: "Total Consumption", group: "Fuel Consumption", unit: "mt", better: "lower", get: r => (r.hsfoConsumption || 0) + (r.vlsfoConsumption || 0) + (r.lsmgoConsumption || 0), fmt: num(2) },

  // Environmental
  { key: "totalCo2", label: "CO₂ Emissions", group: "Environmental", unit: "mt", better: "lower", get: r => r.totalCo2, fmt: num(2) },
  { key: "etsCost", label: "ETS Cost", group: "Environmental", better: "lower", get: r => r.etsCost, fmt: $ },
];

function bestIndex(values: number[], dir: MetricDir): number {
  let best = -1; let bestV = dir === "higher" ? -Infinity : Infinity;
  values.forEach((v, i) => {
    if (!isFinite(v)) return;
    if (dir === "higher" ? v > bestV : v < bestV) { bestV = v; best = i; }
  });
  return best;
}
function worstIndex(values: number[], dir: MetricDir): number {
  return bestIndex(values, dir === "higher" ? "lower" : "higher");
}

const CHART_METRIC_KEYS = ["pAndL", "netProfit", "gtce", "ntce", "grossRate", "totalBunkerCost", "hireCost", "totalVoyageDays", "totalConsumption", "totalCo2"];

export default function ComparisonPage() {
  const { compareSheetIds, setCurrentView, openCompare } = useSheets();
  const [entries, setEntries] = useState<SheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState("netProfit");
  const [sortKey, setSortKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const details = await Promise.all(compareSheetIds.map(id => getSheet(id).catch(() => null)));
        if (cancelled) return;
        const next: SheetEntry[] = details
          .map((d, i) => d ? ({
            id: compareSheetIds[i],
            name: d.name,
            data: d.data || {},
            vesselName: ((d.data as Record<string, { name?: string }> | undefined)?.vessel?.name) || "—",
            results: null,
          }) : null)
          .filter((x): x is SheetEntry => x !== null);
        setEntries(next);
      } catch {
        toast.error("Failed to load sheets for comparison");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [compareSheetIds]);

  const handleResult = (id: string) => (r: VoyageResults, vesselName: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, results: r, vesselName: vesselName || e.vesselName } : e));
  };

  const readyEntries = entries.filter(e => e.results);
  const allReady = entries.length > 0 && readyEntries.length === entries.length;

  // Metric values per entry
  const metricMatrix = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const m of METRICS) {
      map[m.key] = entries.map(e => e.results ? m.get(e.results) : NaN);
    }
    return map;
  }, [entries]);

  const bestPerMetric = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of METRICS) out[m.key] = bestIndex(metricMatrix[m.key] || [], m.better);
    return out;
  }, [metricMatrix]);

  const worstPerMetric = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of METRICS) out[m.key] = worstIndex(metricMatrix[m.key] || [], m.better);
    return out;
  }, [metricMatrix]);

  // Sorted entry order (when user picks a sort metric)
  const orderedIndices = useMemo(() => {
    const idx = entries.map((_, i) => i);
    if (!sortKey) return idx;
    const m = METRICS.find(x => x.key === sortKey);
    if (!m) return idx;
    const vals = metricMatrix[sortKey] || [];
    return [...idx].sort((a, b) => {
      const va = vals[a]; const vb = vals[b];
      if (!isFinite(va)) return 1;
      if (!isFinite(vb)) return -1;
      return m.better === "higher" ? vb - va : va - vb;
    });
  }, [entries, sortKey, metricMatrix]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const header = ["Metric", ...orderedIndices.map(i => `${entries[i].vesselName} (${entries[i].name})`)];
    const rows: (string | number)[][] = [header];
    let currentGroup = "";
    for (const m of METRICS) {
      if (m.group !== currentGroup) {
        currentGroup = m.group;
        rows.push([`— ${m.group} —`, ...orderedIndices.map(() => "")]);
      }
      const vals = metricMatrix[m.key] || [];
      rows.push([
        m.label + (m.unit ? ` (${m.unit})` : ""),
        ...orderedIndices.map(i => (isFinite(vals[i]) ? Number(vals[i].toFixed(2)) : "")),
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Comparison");
    XLSX.writeFile(wb, `voyage-comparison-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = () => window.print();

  const handleChangeSelection = () => openCompare([]);

  // Chart data (by sheet name)
  const chartData = useMemo(() => {
    const m = METRICS.find(x => x.key === chartMetric);
    if (!m) return [];
    return orderedIndices.map(i => ({
      name: entries[i]?.name || entries[i]?.vesselName || `#${i + 1}`,
      value: entries[i]?.results ? m.get(entries[i].results!) : 0,
    }));
  }, [orderedIndices, entries, chartMetric]);

  // Multi-metric analysis charts grouped by sheet
  const fuelChartData = useMemo(() =>
    orderedIndices.map(i => {
      const r = entries[i]?.results;
      return {
        name: entries[i]?.name || `#${i + 1}`,
        HSFO: r?.hsfoConsumption || 0,
        VLSFO: r?.vlsfoConsumption || 0,
        LSMGO: r?.lsmgoConsumption || 0,
      };
    }), [orderedIndices, entries]);

  const daysChartData = useMemo(() =>
    orderedIndices.map(i => {
      const r = entries[i]?.results;
      const sm = (r as unknown as { seaMarginTime?: number } | undefined)?.seaMarginTime || 0;
      return {
        name: entries[i]?.name || `#${i + 1}`,
        "Sea Days": r?.totalSeaDays || 0,
        "Port Days": r?.totalPortDays || 0,
        "Weather/Margin": sm,
      };
    }), [orderedIndices, entries]);

  const pnlChartData = useMemo(() =>
    orderedIndices.map(i => {
      const r = entries[i]?.results;
      return {
        name: entries[i]?.name || `#${i + 1}`,
        Revenue: r?.grossFreight || 0,
        Cost: r?.totalVoyageCosts || 0,
        "P&L": r?.netProfit || 0,
      };
    }), [orderedIndices, entries]);

  if (compareSheetIds.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground mb-3">No sheets selected for comparison.</p>
        <button onClick={() => setCurrentView("dashboard")} className="btn-primary h-8 px-4 text-xs rounded-md">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Hidden calculators */}
      {entries.map(e => (
        <HiddenRunner key={e.id} data={e.data} onResult={handleResult(e.id)} />
      ))}

      {/* Header */}
      <header className="bg-section-header text-section-header-foreground h-12 flex items-center justify-between px-5 text-xs flex-shrink-0 border-b border-border print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentView("dashboard")} className="flex items-center gap-1 px-2 h-7 rounded hover:bg-section-header-foreground/10">
            <ArrowLeft className="h-3.5 w-3.5" /> <span>Back</span>
          </button>
          <div>
            <h1 className="font-semibold text-sm leading-tight">Voyage Sheet Comparison</h1>
            <p className="text-[10px] text-section-header-foreground/60">{entries.length} vessels compared</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleChangeSelection} className="h-7 px-3 rounded text-xs hover:bg-section-header-foreground/10">Change Selection</button>
          <button onClick={exportExcel} className="h-7 px-3 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-xs flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
          </button>
          <button onClick={exportPdf} className="h-7 px-3 rounded border border-border hover:bg-section-header-foreground/10 text-xs flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export PDF
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading || !allReady ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            {loading ? "Loading sheet data..." : "Calculating voyages..."}
          </div>
        ) : (
          <>
            {/* Comparison table */}
            <section className="bg-card border border-border rounded overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-table-header">
                    <tr>
                      <th className="sticky left-0 z-20 bg-table-header text-left px-3 py-2 font-medium border-b border-border min-w-[180px]">Metric</th>
                      {orderedIndices.map(i => (
                        <th key={entries[i].id} className="text-right px-3 py-2 font-medium border-b border-l border-border min-w-[140px]">
                          <div className="text-foreground truncate" title={entries[i].name}>{entries[i].name}</div>
                          <div className="text-[10px] text-muted-foreground font-normal truncate" title={entries[i].vesselName}>{entries[i].vesselName}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const out: JSX.Element[] = [];
                      let lastGroup = "";
                      for (const m of METRICS) {
                        if (m.group !== lastGroup) {
                          lastGroup = m.group;
                          out.push(
                            <tr key={`g-${m.group}`} className="bg-muted/50">
                              <td colSpan={orderedIndices.length + 1} className="sticky left-0 bg-muted/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                                {m.group}
                              </td>
                            </tr>
                          );
                        }
                        const vals = metricMatrix[m.key] || [];
                        const bestIdx = bestPerMetric[m.key];
                        const worstIdx = worstPerMetric[m.key];
                        const bestVal = bestIdx >= 0 ? vals[bestIdx] : NaN;
                        const isActiveSort = sortKey === m.key;
                        out.push(
                          <tr key={m.key} className="border-b border-border hover:bg-muted/20">
                            <td
                              className={`sticky left-0 z-10 bg-card px-3 py-1.5 text-foreground cursor-pointer ${isActiveSort ? "font-semibold text-primary" : ""}`}
                              onClick={() => setSortKey(isActiveSort ? null : m.key)}
                              title="Click to sort by this metric"
                            >
                              {m.label}
                              {m.unit && <span className="text-[10px] text-muted-foreground ml-1">({m.unit})</span>}
                            </td>
                            {orderedIndices.map((i) => {
                              const v = vals[i];
                              const isBest = i === bestIdx && orderedIndices.length > 1;
                              const isWorst = i === worstIdx && orderedIndices.length > 1 && bestIdx !== worstIdx;
                              const fmt = m.fmt ? m.fmt(v) : String(v);
                              let pct = "";
                              if (isFinite(v) && isFinite(bestVal) && bestVal !== 0 && i !== bestIdx) {
                                const d = ((v - bestVal) / Math.abs(bestVal)) * 100;
                                pct = ` (${d > 0 ? "+" : ""}${d.toFixed(1)}%)`;
                              }
                              const cls = isBest
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                                : isWorst
                                  ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                                  : "text-foreground";
                              return (
                                <td key={entries[i].id} className={`text-right px-3 py-1.5 border-l border-border tabular-nums ${cls}`}>
                                  {isFinite(v) ? fmt : "—"}
                                  {pct && <span className="text-[10px] text-muted-foreground ml-1">{pct}</span>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      }
                      return out;
                    })()}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Chart */}
            <section className="bg-card border border-border rounded p-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                  Metric Comparison by Sheet — {METRICS.find(x => x.key === chartMetric)?.label}
                </h2>
                <select
                  value={chartMetric}
                  onChange={e => setChartMetric(e.target.value)}
                  className="form-input-sm h-7 text-xs"
                >
                  {CHART_METRIC_KEYS.map(k => {
                    const m = METRICS.find(x => x.key === k);
                    return m ? <option key={k} value={k}>{m.label}</option> : null;
                  })}
                </select>
              </div>
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReTooltip
                      formatter={(value: number) => {
                        const m = METRICS.find(x => x.key === chartMetric);
                        return [m?.fmt ? m.fmt(value) : value, m?.label || ""];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="value" name={METRICS.find(x => x.key === chartMetric)?.label || "Value"} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Inline data table */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-2 py-1 border border-border">Sheet</th>
                      <th className="text-right px-2 py-1 border border-border">{METRICS.find(x => x.key === chartMetric)?.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map(d => {
                      const m = METRICS.find(x => x.key === chartMetric);
                      return (
                        <tr key={d.name}>
                          <td className="px-2 py-1 border border-border">{d.name}</td>
                          <td className="px-2 py-1 border border-border text-right tabular-nums">{m?.fmt ? m.fmt(d.value) : d.value}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Graphical Analysis */}
            <section className="bg-card border border-border rounded p-3">
              <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Bunkering — Fuel Type by Sheet (mt)</h2>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={fuelChartData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReTooltip formatter={(v: number) => v.toFixed(2) + " mt"} />
                    <Legend />
                    <Bar dataKey="HSFO" stackId="f" fill="hsl(var(--chart-1, 220 70% 50%))" />
                    <Bar dataKey="VLSFO" stackId="f" fill="hsl(var(--chart-2, 160 60% 45%))" />
                    <Bar dataKey="LSMGO" stackId="f" fill="hsl(var(--chart-3, 30 80% 55%))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="bg-card border border-border rounded p-3">
              <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Voyage Time Breakdown by Sheet (days)</h2>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={daysChartData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReTooltip formatter={(v: number) => v.toFixed(2) + " d"} />
                    <Legend />
                    <Bar dataKey="Sea Days" stackId="d" fill="hsl(var(--chart-1, 220 70% 50%))" />
                    <Bar dataKey="Port Days" stackId="d" fill="hsl(var(--chart-2, 160 60% 45%))" />
                    <Bar dataKey="Weather/Margin" stackId="d" fill="hsl(var(--chart-3, 30 80% 55%))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="bg-card border border-border rounded p-3">
              <h2 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-3">Revenue, Cost & P&L by Sheet ($)</h2>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={pnlChartData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReTooltip formatter={(v: number) => "$" + Math.round(v).toLocaleString()} />
                    <Legend />
                    <Bar dataKey="Revenue" fill="hsl(var(--chart-1, 220 70% 50%))" />
                    <Bar dataKey="Cost" fill="hsl(var(--chart-2, 0 70% 55%))" />
                    <Bar dataKey="P&L" fill="hsl(var(--chart-3, 140 60% 45%))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}