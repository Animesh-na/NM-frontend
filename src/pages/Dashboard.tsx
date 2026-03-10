import { useState, useEffect, useCallback } from "react";
import { Ship, Plus, FileText, LogOut, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSheets } from "@/context/SheetContext";
import { listSheets, deleteSheet, type SheetListItem } from "@/services/marineApi";
import { toast } from "@/components/ui/sonner";

const ITEMS_PER_PAGE = 10;

export default function Dashboard() {
  const { logout, user } = useAuth();
  const { openSheet, createNewSheet } = useSheets();
  const [sheets, setSheets] = useState<SheetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  const fetchSheets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSheets(page, ITEMS_PER_PAGE);
      setSheets(res.sheets || []);
      setTotal(res.pagination?.total || 0);
    } catch {
      toast.error("Failed to load sheets");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchSheets();
  }, [fetchSheets]);

  const handleCreate = () => {
    createNewSheet();
  };

  const handleOpen = (sheet: SheetListItem) => {
    openSheet(sheet.id, sheet.name);
  };

  const handleDelete = async (sheet: SheetListItem) => {
    const confirmed = window.confirm(`Delete "${sheet.name}"? This cannot be undone.`);
    if (!confirmed) return;

    const success = await deleteSheet(sheet.id);
    if (success) {
      toast.success("Sheet deleted");
      fetchSheets();
    } else {
      toast.error("Failed to delete sheet");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-section-header text-section-header-foreground h-10 flex items-center justify-between px-4 text-xs flex-shrink-0">
        <div className="flex items-center gap-2">
          <Ship className="h-4 w-4" />
          <span className="font-semibold text-sm">VoyageCalc</span>
          <span className="text-section-header-foreground/50">|</span>
          <span className="text-section-header-foreground/70">Sheet Manager</span>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-section-header-foreground/70">{user.email}</span>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-1 hover:text-section-header-foreground/80 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Title + Create */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-foreground">My Sheets</h1>
            <button
              onClick={handleCreate}
              className="btn-primary flex items-center gap-1.5 h-8 px-3 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New Sheet
            </button>
          </div>

          {/* Sheet List */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading sheets...</span>
            </div>
          ) : sheets.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-md">
              <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No sheets available.</p>
              <button
                onClick={handleCreate}
                className="mt-3 btn-primary h-8 px-4 text-xs"
              >
                Create a new one
              </button>
            </div>
          ) : (
            <>
              <div className="border border-border rounded-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-table-header text-muted-foreground text-xs">
                      <th className="text-left px-3 py-2 font-medium">#</th>
                      <th className="text-left px-3 py-2 font-medium">Sheet Name</th>
                      <th className="text-left px-3 py-2 font-medium">Last Updated</th>
                      <th className="text-right px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheets.map((sheet, idx) => (
                      <tr
                        key={sheet.id}
                        className="border-t border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {(page - 1) * ITEMS_PER_PAGE + idx + 1}
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {sheet.name}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {new Date(sheet.updated_at || sheet.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpen(sheet)}
                              className="btn-primary h-6 px-3 text-[11px]"
                            >
                              Open
                            </button>
                            <button
                              onClick={() => handleDelete(sheet)}
                              className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10 rounded-sm transition-colors"
                              title="Delete sheet"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                  <span>
                    Page {page} of {totalPages} ({total} sheets)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="btn-secondary h-7 px-2 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="btn-secondary h-7 px-2 disabled:opacity-40"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
