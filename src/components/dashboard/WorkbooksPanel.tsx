import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, FolderOpen, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  createWorkbook,
  deleteWorkbook,
  listWorkbooks,
  listWorkbookSheets,
  searchWorkbooks,
  type WorkbookItem,
  type WorkbookSheetItem,
} from "@/services/marineApi";
import { useSheets } from "@/context/sheetContextCore";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";
import { trackEvent } from "@/services/logger";

const PER_PAGE = 10;
const SHEETS_PER_PAGE = 50;

export default function WorkbooksPanel({ query = "" }: { query?: string }) {
  const { openSheets } = useSheets();
  const { user, mode } = useAuth();
  const [workbooks, setWorkbooks] = useState<WorkbookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const openRequestRef = useRef(0);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const trimmedQuery = query.trim();

  useEffect(() => { setPage(1); }, [mode, trimmedQuery]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = trimmedQuery
          ? await searchWorkbooks(trimmedQuery, page, PER_PAGE)
          : await listWorkbooks(page, PER_PAGE);
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
  }, [page, mode, trimmedQuery]);

  const isOwn = useCallback(
    (workbook: WorkbookItem) => {
      if (workbook.user_id && user?.id && String(workbook.user_id) === String(user.id)) return true;
      const ownerEmail = workbook.owner_email?.trim().toLowerCase();
      const userEmail = user?.email?.trim().toLowerCase();
      return !!ownerEmail && !!userEmail && ownerEmail === userEmail;
    },
    [user?.id, user?.email]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { toast.error("Workbook name is required"); return; }
    setCreating(true);
    try {
      const created = await createWorkbook(name, newDescription.trim());
      // Create responses can omit or return a stale owner field. The active
      // authenticated user is always the owner of a workbook they just made.
      const wb = created ? { ...created, user_id: user?.id, owner_email: user?.email } : null;
      if (wb) {
        trackEvent("workbook.create", { component: "WorkbooksPanel", workbook_id: wb.id, workbook_name: wb.name });
        toast.success("Workbook created");
        setWorkbooks(prev => [wb, ...prev]);
        setTotal(prev => prev + 1);
        setNewName("");
        setNewDescription("");
        setShowCreate(false);
      } else {
        toast.error("Failed to create workbook");
      }
    } catch {
      toast.error("Failed to create workbook");
    } finally {
      setCreating(false);
    }
  };

  const openWorkbook = async (wb: WorkbookItem) => {
    const requestId = ++openRequestRef.current;
    setOpeningId(wb.id);
    try {
      const res = await listWorkbookSheets(wb.id, 1, SHEETS_PER_PAGE);
      if (requestId !== openRequestRef.current) return;
      const sheets = (res.sheets || []).filter(sheet => String(sheet.workbook_id || "") === String(wb.id));
      if (!sheets.length) {
        trackEvent("workbook.open_empty", { component: "WorkbooksPanel", workbook_id: wb.id });
        toast.info("This workbook is empty — a new sheet was created");
        openSheets([], { id: wb.id, name: wb.name });
        return;
      }
      const wbReadOnly = !isOwn(wb);
      const userId = user?.id ? String(user.id) : null;
      const userEmail = user?.email?.trim().toLowerCase();
      // Sheet-level ownership: a sheet created by the current user stays
      // editable even inside someone else's workbook.
      const isSheetOwn = (s: WorkbookSheetItem) => {
        if (s.user_id && userId && String(s.user_id) === userId) return true;
        const ownerEmail = s.owner_email?.trim().toLowerCase();
        if (ownerEmail && userEmail) return ownerEmail === userEmail;
        // No creator info on the sheet — fall back to workbook ownership.
        return !wbReadOnly;
      };
      trackEvent("workbook.open_all", { component: "WorkbooksPanel", workbook_id: wb.id, sheet_count: sheets.length, read_only: wbReadOnly });
      openSheets(sheets.map(s => ({ id: s.id, name: s.name, data: s.data, version: (s as { version?: number }).version ?? null, readOnly: !isSheetOwn(s), workbookId: wb.id, workbookName: wb.name })));
    } catch {
      if (requestId === openRequestRef.current) toast.error("Failed to load workbook sheets");
    } finally {
      if (requestId === openRequestRef.current) setOpeningId(null);
    }
  };

  const handleDelete = async (wb: WorkbookItem) => {
    if (!window.confirm(`Delete workbook "${wb.name}"? This cannot be undone.`)) return;
    setDeletingId(wb.id);
    try {
      const ok = await deleteWorkbook(wb.id);
      if (ok) {
        trackEvent("workbook.delete", { component: "WorkbooksPanel", workbook_id: wb.id });
        toast.success("Workbook deleted");
        setWorkbooks(prev => prev.filter(w => w.id !== wb.id));
        setTotal(prev => Math.max(0, prev - 1));
      } else {
        toast.error("Failed to delete workbook");
      }
    } finally {
      setDeletingId(null);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--ocean))" }} />
        <span className="ml-2 text-[13px] dash-muted">Loading workbooks...</span>
      </div>
    );
  }

  const isEmpty = workbooks.length === 0;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="dash-btn-primary h-8 px-3 text-[12px]"
            title="Create a new workbook"
          >
            <Plus className="h-3.5 w-3.5" /> New Workbook
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-start">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Workbook name"
                className="dash-input h-8 flex-1 text-[12px]"
                disabled={creating}
                required
              />
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description (optional)"
                className="dash-input h-8 flex-1 text-[12px]"
                disabled={creating}
              />
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button type="submit" disabled={creating} className="dash-btn-primary h-8 px-3 text-[12px]">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName(""); setNewDescription(""); }}
                disabled={creating}
                className="dash-btn-ghost h-8 px-2"
                aria-label="Cancel workbook creation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}
      </div>

      {isEmpty ? (
        <div className="dash-card border-dashed py-20 text-center">
          <BookOpen className="mx-auto mb-3 h-12 w-12 dash-muted opacity-40" />
          <p className="text-[13px] dash-muted">{trimmedQuery ? "No workbooks match your search" : "No workbooks yet — create one to get started"}</p>
        </div>
      ) : (<>
      <div className="space-y-2 sm:hidden">
        {workbooks.map((wb) => {
          const own = isOwn(wb);
          return (
            <article key={wb.id} className="dash-card p-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-[13px] font-semibold">{wb.name}</h3>
                  {wb.description && <p className="mt-1 line-clamp-2 text-[11px] dash-muted">{wb.description}</p>}
                </div>
                <span className={own ? "dash-badge-success shrink-0" : "dash-badge-warning shrink-0"}>{own ? "Yours" : "Read-only"}</span>
              </div>
              <dl className="mt-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[11px]">
                <dt className="dash-muted">Owner</dt><dd className="min-w-0 break-all">{wb.owner_email || "—"}</dd>
                <dt className="dash-muted">Sheets</dt><dd className="tabular-nums">{wb.sheet_count ?? "—"}</dd>
                <dt className="dash-muted">Updated</dt><dd>{new Date(wb.updated_at || wb.created_at).toLocaleString()}</dd>
              </dl>
              <div className="mt-3 flex items-center gap-2 border-t border-[hsl(var(--dash-border))] pt-3">
                <button onClick={() => openWorkbook(wb)} disabled={openingId === wb.id} className="dash-btn-primary min-h-11 flex-1 justify-center text-[12px] disabled:opacity-60">
                  {openingId === wb.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />} Open
                </button>
                {own && (
                  <button onClick={() => handleDelete(wb)} disabled={deletingId === wb.id} className="dash-btn-ghost min-h-11 min-w-11 justify-center px-2 text-destructive disabled:opacity-60" aria-label={`Delete ${wb.name}`} title="Delete this workbook">
                    {deletingId === wb.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="dash-card hidden overflow-hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide dash-muted" style={{ background: "hsl(var(--dash-bg))" }}>
                <th className="px-5 py-2.5 font-semibold">Workbook</th>
                <th className="px-5 py-2.5 font-semibold">Owner</th>
                <th className="px-5 py-2.5 font-semibold">Sheets</th>
                <th className="px-5 py-2.5 font-semibold">Last Updated</th>
                <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workbooks.map((wb) => {
                const own = isOwn(wb);
                return (
                  <tr
                    key={wb.id}
                    className="border-t transition-colors hover:bg-dash-bg"
                    style={{ borderColor: "hsl(var(--dash-border))" }}
                  >
                    <td className="px-5 py-3 font-semibold">
                      {wb.name}
                      {!own && <span className="ml-2 dash-badge-warning">Read-only</span>}
                      {own && <span className="ml-2 dash-badge-success">Yours</span>}
                      {wb.description && <span className="ml-2 text-[11px] dash-muted">{wb.description}</span>}
                    </td>
                    <td className="px-5 py-3 text-[12px] dash-muted">{wb.owner_email || "—"}</td>
                    <td className="px-5 py-3 text-[12px] tabular-nums dash-muted">{wb.sheet_count ?? "—"}</td>
                    <td className="px-5 py-3 text-[12px] dash-muted">
                      {new Date(wb.updated_at || wb.created_at).toLocaleString()}
                    </td>
                    <td className="w-[138px] px-5 py-3 text-right">
                      <div className="grid grid-cols-[78px_32px] items-center justify-end gap-1.5">
                        <button
                          onClick={() => openWorkbook(wb)}
                          disabled={openingId === wb.id}
                          className="dash-btn-primary h-7 justify-center px-3 text-[12px] disabled:opacity-60"
                          title="Open all sheets in this workbook"
                        >
                          {openingId === wb.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <FolderOpen className="h-3.5 w-3.5" />}
                          Open
                        </button>
                        {own && (
                          <button
                            onClick={() => handleDelete(wb)}
                            disabled={deletingId === wb.id}
                            className="dash-btn-ghost h-7 px-2 text-[12px] text-destructive disabled:opacity-60"
                            title="Delete this workbook"
                            aria-label={`Delete ${wb.name}`}
                          >
                            {deletingId === wb.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {!own && <span aria-hidden="true" className="h-7 w-8" />}
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Workbook pagination" className="mt-4 flex items-center justify-between text-[12px] dash-muted">
          <span aria-live="polite">Page {page} of {totalPages} ({total} workbooks)</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="dash-btn-ghost min-h-11 min-w-11 justify-center px-2 sm:min-h-8 sm:min-w-0 disabled:opacity-40" aria-label="Previous workbook page">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="dash-btn-ghost min-h-11 min-w-11 justify-center px-2 sm:min-h-8 sm:min-w-0 disabled:opacity-40" aria-label="Next workbook page">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </nav>
      )}
      </>)}
    </>
  );
}
