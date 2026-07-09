import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCcw, Download, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchLogs, fetchLogStats, type LogRow, type LogQuery } from "@/services/logsApi";
import { toast } from "@/components/ui/sonner";
import { adminListUsers, type AdminUser } from "@/services/adminApi";

const PAGE_SIZE = 50;
const LEVELS = ["", "debug", "info", "warn", "error", "fatal"];

export default function AdminLogsPage({ onBack }: { onBack: () => void }) {
  const { token } = useAuth();

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const [stats, setStats] = useState<{ total: number; errors: number; warnings: number; fatal: number; today: number } | null>(null);

  // Filters
  const [level, setLevel] = useState("");
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const query: LogQuery = useMemo(() => ({
    page, limit: PAGE_SIZE, level: level || undefined, user_id: userId || undefined,
    sort: "desc",
  }), [page, level, userId]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchLogs(token, query);
      setLogs(res.logs);
      setTotal(res.pagination.total);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!token) return;
    try {
      const res = await fetchLogStats(token);
      setStats(res);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [query, token]);
  useEffect(() => { loadStats(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await adminListUsers(1, 200);
        setUsers(res.users);
      } catch { /* ignore */ }
    })();
  }, [token]);

  const exportCsv = () => {
    const header = ["timestamp","level","user","message","page","component","session","browser","ip","fingerprint"];
    const rows = logs.map(l => [
      l.created_at, l.level, l.user_email ?? l.user_id ?? "",
      (l.message ?? "").replace(/"/g, '""'),
      l.page ?? "", l.component ?? "", l.session_id ?? "", l.browser ?? "", l.ip_address ?? "", l.fingerprint ?? ""
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `logs-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setLevel(""); setUserId(""); setPage(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-lg font-semibold text-foreground">Activity & Error Logs</h1>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { load(); loadStats(); }} className="h-8 px-3 text-xs border border-border rounded-sm hover:bg-muted flex items-center gap-1">
              <RefreshCcw className="h-3 w-3" /> Refresh
            </button>
            <button onClick={exportCsv} className="h-8 px-3 text-xs border border-border rounded-sm hover:bg-muted flex items-center gap-1">
              <Download className="h-3 w-3" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total logs" value={stats?.total ?? "—"} />
          <StatCard label="Today" value={stats?.today ?? "—"} />
          <StatCard label="Warnings" value={stats?.warnings ?? "—"} tone="warn" />
          <StatCard label="Errors" value={stats?.errors ?? "—"} tone="error" />
          <StatCard label="Fatal" value={stats?.fatal ?? "—"} tone="fatal" />
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-md p-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">User</label>
          <select value={userId} onChange={(e) => { setPage(1); setUserId(e.target.value); }}
            className="form-input h-8 text-xs min-w-[240px]">
            <option value="">All users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground ml-2">Level</label>
          <select value={level} onChange={(e) => { setPage(1); setLevel(e.target.value); }} className="form-input h-8 text-xs">
            {LEVELS.map(l => <option key={l} value={l}>{l ? l.toUpperCase() : "All levels"}</option>)}
          </select>
          <button onClick={resetFilters} className="h-8 px-3 text-xs border border-border rounded-sm hover:bg-muted ml-auto">
            Reset
          </button>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Timestamp</th>
                  <th className="px-3 py-2 text-left font-medium">Level</th>
                  <th className="px-3 py-2 text-left font-medium">User</th>
                  <th className="px-3 py-2 text-left font-medium">Message</th>
                  <th className="px-3 py-2 text-left font-medium">Page</th>
                  <th className="px-3 py-2 text-left font-medium">Component</th>
                  <th className="px-3 py-2 text-left font-medium">Session</th>
                  <th className="px-3 py-2 text-left font-medium">Browser</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!loading && logs.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No logs found.</td></tr>
                )}
                {!loading && logs.map(l => (
                  <tr key={l.id} onClick={() => setSelected(l)}
                    className="border-t border-border hover:bg-muted/50 cursor-pointer">
                    <td className="px-3 py-1.5 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="px-3 py-1.5"><LogLevelBadge level={l.level} /></td>
                    <td className="px-3 py-1.5 whitespace-nowrap max-w-[160px] truncate">{l.user_email ?? l.user_id ?? "—"}</td>
                    <td className="px-3 py-1.5 max-w-[420px] truncate">{l.message}</td>
                    <td className="px-3 py-1.5 max-w-[180px] truncate">{l.page ?? "—"}</td>
                    <td className="px-3 py-1.5">{l.component ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[10px]">{l.session_id?.slice(0, 8) ?? "—"}</td>
                    <td className="px-3 py-1.5">{l.browser ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="h-7 px-3 border border-border rounded-sm disabled:opacity-50 hover:bg-muted">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="h-7 px-3 border border-border rounded-sm disabled:opacity-50 hover:bg-muted">Next</button>
            </div>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-lg bg-card h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b border-border p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogLevelBadge level={selected.level} />
                <h2 className="text-sm font-semibold">Log detail</h2>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <DetailRow label="Message" value={selected.message} pre />
              <DetailRow label="Timestamp" value={new Date(selected.created_at).toLocaleString()} />
              <DetailRow label="Client timestamp" value={selected.client_timestamp ?? "—"} />
              <DetailRow label="User" value={`${selected.user_email ?? "—"} (${selected.user_id ?? "—"})`} />
              <DetailRow label="Page" value={selected.page ?? "—"} />
              <DetailRow label="Component" value={selected.component ?? "—"} />
              <DetailRow label="URL" value={selected.url ?? "—"} pre />
              <DetailRow label="Session" value={selected.session_id ?? "—"} />
              <DetailRow label="IP" value={selected.ip_address ?? "—"} />
              <DetailRow label="Browser" value={selected.browser ?? "—"} />
              <DetailRow label="User agent" value={selected.user_agent ?? "—"} pre />
              <DetailRow label="Fingerprint" value={selected.fingerprint ?? "—"} />
              {selected.context && <DetailRow label="Context" value={JSON.stringify(selected.context, null, 2)} pre />}
              {selected.stack_trace && <DetailRow label="Stack trace" value={selected.stack_trace} pre />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "error" | "fatal" }) {
  const toneClass = tone === "fatal" ? "text-red-700" : tone === "error" ? "text-red-600" : tone === "warn" ? "text-orange-600" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const key = (level || "info").toLowerCase();
  const toneClass =
    key === "fatal"
      ? "bg-destructive text-destructive-foreground"
      : key === "error"
        ? "bg-destructive/10 text-destructive"
        : key === "warn"
          ? "bg-muted text-foreground"
          : "bg-muted text-muted-foreground";

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${toneClass}`}>
      {key}
    </span>
  );
}

function DetailRow({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      {pre
        ? <pre className="bg-muted rounded p-2 text-[11px] whitespace-pre-wrap break-all">{value}</pre>
        : <div className="text-foreground">{value}</div>}
    </div>
  );
}