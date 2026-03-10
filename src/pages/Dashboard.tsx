import { useState, useEffect, useCallback } from "react";
import { Ship, Plus, FileText, LogOut, ChevronLeft, ChevronRight, Loader2, Trash2, Shield, Users, Calendar, Hash } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSheets } from "@/context/SheetContext";
import { listSheets, deleteSheet, type SheetListItem } from "@/services/marineApi";
import { toast } from "@/components/ui/sonner";

const ITEMS_PER_PAGE = 10;

export default function Dashboard() {
  const { logout, user } = useAuth();
  const { openSheet, createNewSheet, setCurrentView } = useSheets();
  const isAdmin = user?.role === "admin";
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
      <header className="bg-section-header text-section-header-foreground h-12 flex items-center justify-between px-5 text-xs flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center">
            <Ship className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <span className="font-semibold text-sm block leading-tight">VoyageCalc</span>
            <span className="text-[10px] text-section-header-foreground/60">Voyage Estimation System</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-2 mr-2">
              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center">
                <span className="text-[10px] font-semibold text-primary">
                  {user.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-section-header-foreground block leading-tight">{user.email}</span>
                <span className={`text-[10px] font-medium ${isAdmin ? 'text-primary' : 'text-section-header-foreground/50'}`}>
                  {user.role?.toUpperCase() || 'USER'}
                </span>
              </div>
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => setCurrentView("admin")}
              className="flex items-center gap-1.5 h-7 px-3 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors text-xs font-medium"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Admin Panel</span>
            </button>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-1 h-7 px-2.5 rounded-md hover:bg-section-header-foreground/10 transition-colors text-section-header-foreground/70"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Welcome + Stats Row */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-1">
              Welcome back{user ? `, ${user.email.split('@')[0]}` : ''}
            </h1>
            <p className="text-sm text-muted-foreground">Manage your voyage estimation sheets</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Hash className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground tabular-nums">{total}</p>
                <p className="text-[11px] text-muted-foreground">Total Sheets</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground tabular-nums">{sheets.length}</p>
                <p className="text-[11px] text-muted-foreground">On This Page</p>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => setCurrentView("admin")}
                className="bg-card border border-primary/30 rounded-lg p-4 flex items-center gap-3 hover:border-primary/60 hover:bg-primary/5 transition-colors text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">Admin Panel</p>
                  <p className="text-[11px] text-muted-foreground">Manage users & sheets</p>
                </div>
              </button>
            )}
            {!isAdmin && (
              <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground tabular-nums">{totalPages}</p>
                  <p className="text-[11px] text-muted-foreground">Total Pages</p>
                </div>
              </div>
            )}
          </div>

          {/* Title + Create */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              My Sheets
            </h2>
            <button
              onClick={handleCreate}
              className="btn-primary flex items-center gap-1.5 h-8 px-4 text-xs rounded-md"
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
            <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card">
              <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm mb-1">No sheets yet</p>
              <p className="text-xs text-muted-foreground/70 mb-4">Create your first voyage estimation sheet</p>
              <button
                onClick={handleCreate}
                className="btn-primary h-8 px-5 text-xs rounded-md"
              >
                Create Sheet
              </button>
            </div>
          ) : (
            <>
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-table-header text-muted-foreground text-xs">
                      <th className="text-left px-4 py-2.5 font-medium w-12">#</th>
                      <th className="text-left px-4 py-2.5 font-medium">Sheet Name</th>
                      <th className="text-left px-4 py-2.5 font-medium">Last Updated</th>
                      <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheets.map((sheet, idx) => (
                      <tr
                        key={sheet.id}
                        className="border-t border-border hover:bg-muted/50 transition-colors cursor-pointer group"
                        onDoubleClick={() => handleOpen(sheet)}
                      >
                        <td className="px-4 py-2.5 text-muted-foreground text-xs tabular-nums">
                          {(page - 1) * ITEMS_PER_PAGE + idx + 1}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-foreground group-hover:text-primary transition-colors">
                          {sheet.name}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {new Date(sheet.updated_at || sheet.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpen(sheet)}
                              className="btn-primary h-6 px-3 text-[11px] rounded"
                            >
                              Open
                            </button>
                            <button
                              onClick={() => handleDelete(sheet)}
                              className="h-6 w-6 flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
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
