import { Fragment, useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, FileText, Layers, Loader2 } from "lucide-react";
import {
  listWorkbooks,
  listWorkbookSheets,
  type WorkbookItem,
  type WorkbookSheetItem,
} from "@/services/marineApi";
import { useSheets } from "@/context/sheetContextCore";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";
import { trackEvent } from "@/services/logger";

const PER_PAGE = 10;
const SHEETS_PER_PAGE = 50;

interface SheetsEntry {
  loading: boolean;
  sheets: WorkbookSheetItem[];
  total: number;
}

export default function WorkbooksPanel({ query = "" }: { query?: string }) {
  const { openSheets } = useSheets();
  const { user, mode } = useAuth();
  const [workbooks, setWorkbooks] = useState<WorkbookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sheetsMap, setSheetsMap] = useState<Record<string, SheetsEntry>>({});

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  useEffect(() => { setPage(1); }, [mode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await listWorkbooks(page, PER_PAGE);
        if (cancelled) return;
        setWorkbooks(res.workbooks || []);
        setTotal(res.pagination?.total || 0);
      } catch {
        if (!cancelled) toast.error("Failed to load workbooks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page, mode]);

  const isOwn = useCallback(
    (email?: string) => !!email && !!user?.email && email.toLowerCase() === user.email.toLowerCase(),
    [user?.email]
  );

  const loadSheets = useCallback(async (wb: WorkbookItem) => {
    setSheetsMap(m => ({ ...m, [wb.id]: { loading: true, sheets: m[wb.id]?.sheets || [], total: m[wb.id]?.total || 0 } }));
    const res = await listWorkbookSheets(wb.id, 1, SHEETS_PER_PAGE);
    setSheetsMap(m => ({
      ...m,
      [wb.id]: { loading: false, sheets: res.sheets || [], total: res.pagination?.total ?? (res.sheets?.length || 0) },
    }));
    return res.sheets || [];
  }, []);

  const toggle = async (wb: WorkbookItem) => {
    if (expanded === wb.id) { setExpanded(null); return; }
    setExpanded(wb.id);
    trackEvent("workbook.expand", { component: "WorkbooksPanel", workbook_id: wb.id, workbook_name: wb.name });
    if (!sheetsMap[wb.id]) await loadSheets(wb);
  };

  const openAll = async (wb: WorkbookItem) => {
    let sheets = sheetsMap[wb.id]?.sheets;
    if (!sheets || sheets.length === 0) sheets = await loadSheets(wb);
    if (!sheets.length) { toast.error("This workbook has no sheets"); return; }
    const readOnly = !isOwn(wb.owner_email);
    trackEvent("workbook.open_all", { component: "WorkbooksPanel", workbook_id: wb.id, sheet_count: sheets.length, read_only: readOnly });
    openSheets(sheets.map(s => ({ id: s.id, name: s.name, data: s.data, readOnly })));
  };

  const openOne = (s: WorkbookSheetItem, wb: WorkbookItem) => {
    openSheets([{ id: s.id, name: s.name, data: s.data, readOnly: !isOwn(wb.owner_email) }]);
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? workbooks.filter(w => w.name?.toLowerCase().includes(q) || w.owner_email?.toLowerCase().includes(q))
    : workbooks;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--ocean))" }} />
        <span className="ml-2 text-[13px] dash-muted">Loading workbooks...</span>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="dash-card border-dashed py-20 text-center">
        <BookOpen className="mx-auto mb-3 h-12 w-12 dash-muted opacity-40" />
        <p className="text-[13px] dash-muted">{q ? "No workbooks match your search" : "No workbooks yet"}</p>
      </div>
    );
  }

  return (
    <>
      <div className="dash-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide dash-muted" style={{ background: "hsl(var(--dash-bg))" }}>
                <th className="w-10 px-5 py-2.5 font-semibold"></th>
                <th className="px-5 py-2.5 font-semibold">Workbook</th>
                <th className="px-5 py-2.5 font-semibold">Owner</th>
                <th className="px-5 py-2.5 font-semibold">Sheets</th>
                <th className="px-5 py-2.5 font-semibold">Last Updated</th>
                <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((wb) => {
                const entry = sheetsMap[wb.id];
                const open = expanded === wb.id;
                const own = isOwn(wb.owner_email);
                return (
                  <Fragment key={wb.id}>
                    <tr
                      className="cursor-pointer border-t transition-colors hover:bg-dash-bg"
                      style={{ borderColor: "hsl(var(--dash-border))" }}
                      onClick={() => toggle(wb)}
                    >
                      <td className="px-5 py-3">
                        <ChevronDown className={`h-4 w-4 dash-muted transition-transform ${open ? "rotate-180" : ""}`} />
                      </td>
                      <td className="px-5 py-3 font-semibold">
                        {wb.name}
                        {!own && <span className="ml-2 dash-badge-warning">Read-only</span>}
                        {own && <span className="ml-2 dash-badge-success">Yours</span>}
                        {wb.description && <span className="ml-2 text-[11px] dash-muted">{wb.description}</span>}
                      </td>
                      <td className="px-5 py-3 text-[12px] dash-muted">{wb.owner_email || "—"}</td>
                      <td className="px-5 py-3 text-[12px] tabular-nums dash-muted">{wb.sheet_count ?? entry?.total ?? "—"}</td>
                      <td className="px-5 py-3 text-[12px] dash-muted">
                        {new Date(wb.updated_at || wb.created_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); openAll(wb); }}
                          className="dash-btn-primary h-7 px-3 text-[12px]"
                          title="Open every sheet in this workbook"
                        >
                          <Layers className="h-3.5 w-3.5" /> Open All
                        </button>
                      </td>
                    </tr>

                    {open && (
                      <tr className="border-t" style={{ borderColor: "hsl(var(--dash-border))", background: "hsl(var(--dash-bg))" }}>
                        <td colSpan={6} className="px-5 py-3">
                          {entry?.loading ? (
                            <div className="flex items-center gap-2 text-[12px] dash-muted">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sheets...
                            </div>
                          ) : !entry || entry.sheets.length === 0 ? (
                            <p className="text-[12px] dash-muted">No sheets in this workbook.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {entry.sheets.map((s) => (
                                <div
                                  key={s.id}
                                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                                  style={{ background: "hsl(var(--dash-surface))", borderColor: "hsl(var(--dash-border))" }}
                                  onDoubleClick={() => openOne(s, wb)}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <FileText className="h-3.5 w-3.5 dash-muted" />
                                    <span className="text-[12px] font-semibold">{s.name}</span>
                                    {!own && <span className="dash-badge-warning">Read-only</span>}
                                    <span className="text-[11px] dash-muted">
                                      {new Date(s.updated_at || s.created_at).toLocaleString()}
                                    </span>
                                  </div>
                                  <button onClick={() => openOne(s, wb)} className="dash-btn-primary h-7 px-3 text-[12px]">
                                    {own ? "Open" : "View"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[12px] dash-muted">
          <span>Page {page} of {totalPages} ({total} workbooks)</span>
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
    </>
  );
}
