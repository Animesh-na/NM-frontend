import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, PackageSearch, RefreshCw, Search } from "lucide-react";
import { listCargoes, listFixtures, listOrderbook, type CargoFixture, type OrderbookEndpoint } from "@/services/marineApi";
import { useAuth } from "@/context/AuthContext";
import { MODE_LABELS } from "@/services/apiMode";

const PAGE_SIZE = 20;

export type MarketKind =
  | "fixtures"
  | "cargoes"
  | "fleet_in_service"
  | "scheduled_deliveries"
  | "demolitions"
  | "valuations";

const ORDERBOOK_ENDPOINTS: Partial<Record<MarketKind, OrderbookEndpoint>> = {
  fleet_in_service: "fleet_in_service",
  scheduled_deliveries: "orderbook_scheduled_deliveries",
  demolitions: "orderbook_demolitions",
  valuations: "valuations",
};

const KIND_META: Record<MarketKind, { noun: string; subtitle: string }> = {
  fixtures: { noun: "fixtures", subtitle: "Reported market fixtures" },
  cargoes: { noun: "cargoes", subtitle: "Open cargo enquiries" },
  fleet_in_service: { noun: "vessels", subtitle: "Fleet currently in service" },
  scheduled_deliveries: { noun: "deliveries", subtitle: "Orderbook — scheduled newbuild deliveries" },
  demolitions: { noun: "demolitions", subtitle: "Orderbook — reported demolitions" },
  valuations: { noun: "valuations", subtitle: "Vessel sale & purchase valuations" },
};

/** Prettify an unknown API field key into a column label. */
function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b(imo|dwt|teu|gt|nt|usd|id)\b/gi, (m) => m.toUpperCase())
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ColumnDef {
  key: string;
  label: string;
  align?: "right";
  strong?: boolean;
  wide?: boolean;
  kind?: "badge" | "date" | "number";
}

// Curated column order — only columns present in the response are rendered.
const FIXTURE_COLUMNS: ColumnDef[] = [
  { key: "fixture_date", label: "Fixture Date", kind: "date" },
  { key: "vessel", label: "Vessel", strong: true },
  { key: "imo", label: "IMO" },
  { key: "blt", label: "Built" },
  { key: "dwt", label: "DWT", align: "right", kind: "number" },
  { key: "state", label: "State", kind: "badge" },
  { key: "commercial_operator", label: "Operator" },
  { key: "charterer", label: "Charterer" },
  { key: "cargo", label: "Cargo" },
  { key: "quantity", label: "Quantity", align: "right", kind: "number" },
  { key: "laycan", label: "Laycan" },
  { key: "delivery", label: "Delivery" },
  { key: "load_via", label: "Load / Via" },
  { key: "discharge_redelivery", label: "Disch / Redel" },
  { key: "rate", label: "Rate" },
  { key: "source", label: "Source" },
];

const CARGO_COLUMNS: ColumnDef[] = [
  { key: "cargo_type", label: "Cargo", strong: true },
  { key: "cargo", label: "Cargo", strong: true },
  { key: "quantity", label: "Quantity", align: "right" },
  { key: "load", label: "Load" },
  { key: "discharge", label: "Discharge" },
  { key: "discharge_redelivery", label: "Disch / Redel" },
  { key: "laycan", label: "Laycan" },
  { key: "type", label: "Type", kind: "badge" },
  { key: "cargo_status", label: "Status", kind: "badge" },
  { key: "charterer_full_name", label: "Charterer" },
  { key: "charterer", label: "Chrtr" },
  { key: "zones", label: "Zone" },
  { key: "sender", label: "Sender" },
  { key: "updated_date", label: "Updated" },
  { key: "dense_view", label: "Summary", wide: true },
];

function formatValue(value: unknown, col?: ColumnDef): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (col?.key === "imo" || col?.key === "blt" || col?.key === "id") return String(value);
    return value.toLocaleString();
  }
  const s = String(value);
  if (col?.kind === "date" || /^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    }
  }
  return s;
}

function badgeClass(value: string): string {
  const v = value.toLowerCase();
  if (v.includes("fully fixed") || v === "active") return "dash-badge-success";
  if (v.includes("subs") || v.includes("pending")) return "dash-badge-warning";
  if (v.includes("fail") || v.includes("cancel") || v.includes("closed")) return "dash-badge-danger";
  return "dash-badge";
}

interface Props {
  kind: MarketKind;
}

export default function MarketDataTable({ kind }: Props) {
  const { mode } = useAuth();
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
      const orderbookEndpoint = ORDERBOOK_ENDPOINTS[kind];
      if (orderbookEndpoint) {
        const res = await listOrderbook(orderbookEndpoint, page, PAGE_SIZE);
        setRows(res.rows || []);
        setTotal(res.pagination?.total || 0);
        setTotalPages(Math.max(1, res.pagination?.total_pages || 1));
      } else {
        const res = kind === "fixtures"
          ? await listFixtures(page, PAGE_SIZE)
          : await listCargoes(page, PAGE_SIZE);
        setRows(res.cargoes || []);
        setTotal(res.pagination?.total || 0);
        setTotalPages(Math.max(1, res.pagination?.total_pages || 1));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, kind]);

  useEffect(() => { setPage(1); setQuery(""); }, [mode, kind]);
  useEffect(() => { void load(); }, [load, mode]);

  const columns = useMemo(() => {
    const present = new Set<string>();
    rows.forEach(r => Object.entries(r).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") present.add(k);
    }));
    if (ORDERBOOK_ENDPOINTS[kind]) {
      // Unknown/variable shapes — derive columns from the payload itself.
      return Array.from(present)
        .filter((k) => !/^(id|_id)$/i.test(k))
        .map<ColumnDef>((k, i) => ({
          key: k,
          label: humanize(k),
          strong: i === 0,
          align: rows.some(r => typeof r[k] === "number") ? "right" : undefined,
          kind: /date|delivered|built/i.test(k) ? "date" : undefined,
          wide: rows.some(r => String(r[k] ?? "").length > 40),
        }));
    }
    const defs = kind === "fixtures" ? FIXTURE_COLUMNS : CARGO_COLUMNS;
    return defs.filter(c => present.has(c.key));
  }, [rows, kind]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, query]);

  const { noun, subtitle } = KIND_META[kind];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="dash-badge-success">{(total || visible.length).toLocaleString()} {noun}</span>
          <span className="text-[12px] dash-muted">{MODE_LABELS[mode]} — {subtitle}</span>
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
        <div className="dash-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr
                  className="text-left text-[11px] uppercase tracking-wide dash-muted"
                  style={{ background: "hsl(var(--dash-bg))" }}
                >
                  <th className="sticky left-0 z-10 w-12 px-4 py-2.5 font-semibold" style={{ background: "hsl(var(--dash-bg))" }}>#</th>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap px-4 py-2.5 font-semibold ${c.align === "right" ? "text-right" : ""}`}
                    >
                      {c.label}
                    </th>
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
                    <td
                      className="sticky left-0 z-10 px-4 py-3 text-[12px] tabular-nums dash-muted"
                      style={{ background: "hsl(var(--dash-surface))" }}
                    >
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    {columns.map((c) => {
                      const raw = row[c.key];
                      const text = formatValue(raw, c);
                      return (
                        <td
                          key={c.key}
                          title={c.wide ? text : undefined}
                          className={[
                            "px-4 py-3",
                            c.wide ? "max-w-[260px] truncate" : "whitespace-nowrap",
                            c.align === "right" ? "text-right tabular-nums" : "",
                            c.strong ? "font-semibold" : "text-[12px] dash-muted",
                          ].join(" ")}
                        >
                          {c.kind === "badge" && text !== "—"
                            ? <span className={badgeClass(text)}>{text}</span>
                            : text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between text-[12px] dash-muted">
          <span>Page {page} of {totalPages} ({total.toLocaleString()} {noun})</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="dash-btn-ghost h-8 px-2 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="dash-btn-ghost h-8 px-2 disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}