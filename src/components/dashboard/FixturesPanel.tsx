import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, PackageSearch, RefreshCw, Search } from "lucide-react";
import { listCargoes, listFixtures, type CargoFixture } from "@/services/marineApi";
import { useAuth } from "@/context/AuthContext";
import { MODE_LABELS } from "@/services/apiMode";

const PAGE_SIZE = 20;

type FixtureTab = "fixtures" | "cargoes";

// Preferred column order — anything else found on the record is appended.
const PREFERRED = [
  "id", "cargo", "cargo_name", "commodity", "quantity", "qty", "unit",
  "load_port", "loadport", "discharge_port", "dischargeport",
  "laycan", "laycan_from", "laycan_to", "freight", "freight_rate", "rate",
  "charterer", "owner", "vessel", "vessel_name", "status", "broker",
  "created_at", "updated_at",
];

const HIDDEN = new Set(["organization_id", "user_id", "raw", "meta", "deleted_at"]);

function label(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/, "ID");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return s;
}

export default function FixturesPanel() {
  const { mode } = useAuth();
  const [tab, setTab] = useState<FixtureTab>("fixtures");
  const [rows, setRows] = useState<CargoFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = tab === "fixtures"
        ? await listFixtures(page, PAGE_SIZE)
        : await listCargoes(page, PAGE_SIZE);
      setRows(res.cargoes || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(Math.max(1, res.pagination?.total_pages || 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, tab]);

  useEffect(() => { setPage(1); setQuery(""); }, [mode, tab]);
  useEffect(() => { void load(); }, [load, mode]);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => { if (!HIDDEN.has(k)) keys.add(k); }));
    const ordered = PREFERRED.filter((k) => keys.has(k));
    const rest = [...keys].filter((k) => !ordered.includes(k));
    return [...ordered, ...rest].slice(0, 14);
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, query]);

  const noun = tab === "fixtures" ? "fixtures" : "cargoes";

  return (
    <div className="space-y-4">
      <div
        className="flex w-fit items-center gap-1 rounded-xl border p-1"
        style={{ background: "hsl(var(--dash-surface))", borderColor: "hsl(var(--dash-border))" }}
      >
        {([["fixtures", "Fixtures"], ["cargoes", "Cargo List"]] as const).map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="h-8 rounded-lg px-4 text-[12px] font-semibold transition-colors"
            style={tab === k
              ? { background: "hsl(var(--ocean))", color: "#fff" }
              : { color: "hsl(var(--dash-muted))" }}
          >
            {lbl}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="dash-badge-success">{total || visible.length} {noun}</span>
          <span className="text-[12px] dash-muted">
            {MODE_LABELS[mode]} — {tab === "fixtures" ? "concluded fixtures" : "open cargo enquiries"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 dash-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Filter ${noun}...`}
              className="h-9 w-56 rounded-lg border pl-8 pr-3 text-[13px] outline-none"
              style={{ borderColor: "hsl(var(--dash-border))", background: "hsl(var(--dash-bg))" }}
            />
          </div>
          <button onClick={() => void load()} className="dash-btn-ghost h-9 px-3" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--ocean))" }} />
          <span className="ml-2 text-[13px] dash-muted">Loading {noun}...</span>
        </div>
      ) : error ? (
        <div className="dash-card border-dashed py-16 text-center">
          <PackageSearch className="mx-auto mb-3 h-10 w-10 dash-muted opacity-40" />
          <p className="text-[13px] font-semibold text-destructive">{error}</p>
          <button onClick={() => void load()} className="dash-btn-primary mt-4">Retry</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="dash-card border-dashed py-20 text-center">
          <PackageSearch className="mx-auto mb-3 h-12 w-12 dash-muted opacity-40" />
          <p className="text-[13px] dash-muted">{query ? `No ${noun} match your filter` : `No ${noun} available`}</p>
        </div>
      ) : (
        <div className="dash-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide dash-muted" style={{ background: "hsl(var(--dash-bg))" }}>
                  <th className="w-12 px-4 py-2.5 font-semibold">#</th>
                  {columns.map((c) => (
                    <th key={c} className="whitespace-nowrap px-4 py-2.5 font-semibold">{label(c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, idx) => (
                  <tr
                    key={String(row.id ?? idx)}
                    className="border-t transition-colors hover:bg-dash-bg"
                    style={{ borderColor: "hsl(var(--dash-border))" }}
                  >
                    <td className="px-4 py-3 text-[12px] tabular-nums dash-muted">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    {columns.map((c, ci) => (
                      <td
                        key={c}
                        className={`whitespace-nowrap px-4 py-3 ${ci === 0 ? "font-semibold" : "text-[12px] dash-muted"}`}
                      >
                        {formatValue(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between text-[12px] dash-muted">
          <span>Page {page} of {totalPages} ({total} {noun})</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="dash-btn-ghost h-8 px-2 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="dash-btn-ghost h-8 px-2 disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}