import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, FolderOpen, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  createWorkbook,
  deleteWorkbook,
  listWorkbooks,
  listWorkbookSheets,
  type WorkbookItem,
} from "@/services/marineApi";
import { useSheets } from "@/context/sheetContextCore";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";
import { trackEvent } from "@/services/logger";

const PER_PAGE = 10;
const SHEETS_PER_PAGE = 50;

export default function WorkbooksPanel({ query = "" }: { query?: string }) {
  const { openSheets, createNewSheet } = useSheets();
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { toast.error("Workbook name is required"); return; }
    setCreating(true);
    try {
      const wb = await createWorkbook(name, newDescription.trim());
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
    setOpeningId(wb.id);
    try {
      const res = await listWorkbookSheets(wb.id, 1, SHEETS_PER_PAGE);
      const sheets = res.sheets || [];
      if (!sheets.length) {
        trackEvent("workbook.open_empty", { component: "WorkbooksPanel", workbook_id: wb.id });
        toast.info("This workbook is empty — a new sheet was created");
        createNewSheet(wb.id, wb.name);
        return;
      }
      const readOnly = !isOwn(wb.owner_email);
      trackEvent("workbook.open_all", { component: "WorkbooksPanel", workbook_id: wb.id, sheet_count: sheets.length, read_only: readOnly });
      openSheets(sheets.map(s => ({ id: s.id, name: s.name, data: s.data, readOnly, workbookId: wb.id, workbookName: wb.name })));
    } catch {
      toast.error("Failed to load workbook sheets");
    } finally {
      setOpeningId(null);
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
          <form onSubmit={handleCreate} className="flex w-full items-start gap-2">
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
            <div className="flex items-center gap-1.5">
              <button type="submit" disabled={creating} className="dash-btn-primary h-8 px-3 text-[12px]">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName(""); setNewDescription(""); }}
                disabled={creating}
                className="dash-btn-ghost h-8 px-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="dash-card overflow-hidden">
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
              {visible.map((wb) => {
                const own = isOwn(wb.owner_email);
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
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => openWorkbook(wb)}
                        disabled={openingId === wb.id}
                        className="dash-btn-primary h-7 px-3 text-[12px] disabled:opacity-60"
                        title="Open all sheets in this workbook"
                      >
                        {openingId === wb.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <FolderOpen className="h-3.5 w-3.5" />}
                        Open
                      </button>
                    </td>
                  </tr>
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
