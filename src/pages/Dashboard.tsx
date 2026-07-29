import { useState, useEffect, useCallback, Fragment } from "react";
import { Ship, Plus, FileText, LogOut, ChevronLeft, ChevronRight, Loader2, Trash2, Shield, ShieldCheck, Users, Calendar, Hash, ChevronDown, UserCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSheets } from "@/context/sheetContextCore";
import { listSheets, listOrganizationSheets, listOrganizationUsers, listUserSheets, deleteSheet, type SheetListItem, type OrganizationUser } from "@/services/marineApi";
import { toast } from "@/components/ui/sonner";
import MfaManageDialog from "@/components/mfa/MfaManageDialog";
import MfaSetupGate from "@/components/mfa/MfaSetupGate";
import { CompareSheetsLauncher } from "@/components/compare/CompareSheetsLauncher";
import { MODE_LABELS } from "@/services/apiMode";

const ITEMS_PER_PAGE = 10;

export default function Dashboard() {
  const { logout, user, mode, setMode, availableModes } = useAuth();
  const { openSheet, openOrganizationSheet, createNewSheet, setCurrentView } = useSheets();
  const isAdmin = user?.role === "admin";
  const mfaEnabled = !!user?.mfa_method;
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const [tab, setTab] = useState<"mine" | "users" | "org">("mine");
  const [sheets, setSheets] = useState<SheetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | number | null>(null);
  const [userSheetsMap, setUserSheetsMap] = useState<Record<string, { loading: boolean; sheets: SheetListItem[]; page: number; total: number }>>({});
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  const fetchSheets = useCallback(async () => {
    if (tab === "users") return;
    setLoading(true);
    try {
      const res = tab === "mine"
        ? await listSheets(page, ITEMS_PER_PAGE)
        : await listOrganizationSheets(page, ITEMS_PER_PAGE);
      setSheets(res.sheets || []);
      setTotal(res.pagination?.total || 0);
    } catch {
      toast.error("Failed to load sheets");
    } finally {
      setLoading(false);
    }
  }, [page, tab, mode]);

  useEffect(() => {
    fetchSheets();
  }, [fetchSheets]);

  // Fetch organization users when switching to the Users tab
  useEffect(() => {
    if (tab !== "users") return;
    void mode; // refetch when sector mode changes
    let cancelled = false;
    (async () => {
      setUsersLoading(true);
      try {
        const res = await listOrganizationUsers(1, 100);
        if (!cancelled) setOrgUsers(res.users || []);
      } catch {
        if (!cancelled) toast.error("Failed to load organization users");
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  // Reset to page 1 when switching tabs
  useEffect(() => { setPage(1); }, [tab]);

  const handleCreate = () => {
    createNewSheet();
  };

  const handleOpen = (sheet: SheetListItem) => {
    const isOwn = !!sheet.owner_email && !!user?.email && sheet.owner_email.toLowerCase() === user.email.toLowerCase();
    if (tab === "org" && !isOwn) {
      openOrganizationSheet(sheet.id, sheet.name);
    } else {
      openSheet(sheet.id, sheet.name);
    }
  };

  const handleOpenUserSheet = (sheet: SheetListItem, ownerEmail: string) => {
    const isOwn = !!user?.email && ownerEmail.toLowerCase() === user.email.toLowerCase();
    if (isOwn) {
      openSheet(sheet.id, sheet.name);
    } else {
      openOrganizationSheet(sheet.id, sheet.name);
    }
  };

  const loadUserSheetsPage = async (u: OrganizationUser, nextPage: number) => {
    const key = String(u.id);
    setUserSheetsMap(m => ({
      ...m,
      [key]: { loading: true, sheets: m[key]?.sheets || [], page: nextPage, total: m[key]?.total || 0 },
    }));
    const res = await listUserSheets(u.id, nextPage, ITEMS_PER_PAGE);
    setUserSheetsMap(m => ({
      ...m,
      [key]: {
        loading: false,
        sheets: res.sheets || [],
        page: nextPage,
        total: res.pagination?.total ?? (res.sheets?.length || 0),
      },
    }));
  };

  const toggleUserExpand = async (u: OrganizationUser) => {
    const key = String(u.id);
    if (expandedUserId === u.id) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(u.id);
    if (!userSheetsMap[key]) {
      await loadUserSheetsPage(u, 1);
    }
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
          {availableModes.length > 1 && (
            <div className="flex items-center rounded-md border border-section-header-foreground/20 overflow-hidden mr-1">
              {availableModes.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`h-7 px-3 text-xs font-medium transition-colors ${
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "text-section-header-foreground/70 hover:bg-section-header-foreground/10"
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          )}
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
            onClick={() => setMfaDialogOpen(true)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-md hover:bg-section-header-foreground/10 transition-colors text-xs font-medium text-section-header-foreground/70"
            title="Two-factor authentication"
          >
            <ShieldCheck className={`h-3.5 w-3.5 ${mfaEnabled ? "text-green-500" : ""}`} />
            <span>Security</span>
            {!mfaEnabled && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </button>
          <CompareSheetsLauncher variant="dashboard" />
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
            <div className="flex items-center gap-1 border border-border rounded-md p-0.5 bg-card">
              <button
                onClick={() => setTab("mine")}
                className={`flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-colors ${
                  tab === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                My Sheets
              </button>
              <button
                onClick={() => setTab("users")}
                className={`flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-colors ${
                  tab === "users" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <UserCircle2 className="h-3.5 w-3.5" />
                Organization Users
              </button>
              <button
                onClick={() => setTab("org")}
                className={`flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-colors ${
                  tab === "org" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Organization Sheets
              </button>
            </div>
            <button
              onClick={handleCreate}
              className="btn-primary flex items-center gap-1.5 h-8 px-4 text-xs rounded-md"
            >
              <Plus className="h-3.5 w-3.5" />
              New Sheet
            </button>
          </div>

          {/* Sheet List */}
          {tab === "users" ? (
            usersLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading users...</span>
              </div>
            ) : orgUsers.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card">
                <UserCircle2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No users found</p>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-table-header text-muted-foreground text-xs">
                      <th className="text-left px-4 py-2.5 font-medium w-10"></th>
                      <th className="text-left px-4 py-2.5 font-medium">Email</th>
                      <th className="text-left px-4 py-2.5 font-medium">Role</th>
                      <th className="text-right px-4 py-2.5 font-medium">Sheets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgUsers.map((u) => {
                      const key = String(u.id);
                      const expanded = expandedUserId === u.id;
                      const entry = userSheetsMap[key];
                      const isSelf = !!user?.email && u.email?.toLowerCase() === user.email.toLowerCase();
                      return (
                        <Fragment key={key}>
                          <tr
                            className="border-t border-border hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => toggleUserExpand(u)}
                          >
                            <td className="px-4 py-2.5">
                              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                            </td>
                            <td className="px-4 py-2.5 font-medium text-foreground">
                              {u.email}
                              {isSelf && <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-semibold uppercase">You</span>}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground text-xs uppercase">{u.role || "user"}</td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground text-xs tabular-nums">
                              {u.sheet_count ?? entry?.total ?? (
                                <FileText className="h-3.5 w-3.5 inline text-muted-foreground/50" />
                              )}
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="border-t border-border bg-muted/20">
                              <td colSpan={4} className="px-4 py-3">
                                {entry?.loading && entry.sheets.length === 0 ? (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sheets...
                                  </div>
                                ) : !entry || entry.sheets.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">No sheets for this user.</p>
                                ) : (
                                  <>
                                    <div className="space-y-1">
                                      {entry.sheets.map((s) => (
                                        <div key={s.id} className="flex items-center justify-between bg-card border border-border rounded px-3 py-1.5">
                                          <div className="flex items-center gap-2">
                                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="text-xs font-medium text-foreground">{s.name}</span>
                                            {!isSelf && (
                                              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-semibold uppercase">Read-only</span>
                                            )}
                                            <span className="text-[10px] text-muted-foreground">{new Date(s.updated_at || s.created_at).toLocaleString()}</span>
                                          </div>
                                          <button
                                            onClick={() => handleOpenUserSheet(s, u.email)}
                                            className="btn-primary h-6 px-3 text-[11px] rounded"
                                          >
                                            {isSelf ? "Open" : "View"}
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                    {(() => {
                                      const uTotalPages = Math.max(1, Math.ceil((entry.total || 0) / ITEMS_PER_PAGE));
                                      if (uTotalPages <= 1) return null;
                                      return (
                                        <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
                                          <span>Page {entry.page} of {uTotalPages} ({entry.total} sheets)</span>
                                          <div className="flex items-center gap-1">
                                            <button
                                              onClick={() => loadUserSheetsPage(u, Math.max(1, entry.page - 1))}
                                              disabled={entry.page <= 1 || entry.loading}
                                              className="btn-secondary h-6 px-2 disabled:opacity-40"
                                            >
                                              <ChevronLeft className="h-3 w-3" />
                                            </button>
                                            <button
                                              onClick={() => loadUserSheetsPage(u, Math.min(uTotalPages, entry.page + 1))}
                                              disabled={entry.page >= uTotalPages || entry.loading}
                                              className="btn-secondary h-6 px-2 disabled:opacity-40"
                                            >
                                              <ChevronRight className="h-3 w-3" />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </>
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
            )
          ) : loading ? (
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
                      {(isAdmin || tab === "org") && <th className="text-left px-4 py-2.5 font-medium">Owner</th>}
                      <th className="text-left px-4 py-2.5 font-medium">Last Updated</th>
                      <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheets.map((sheet, idx) => (
                      (() => {
                      const isOwn = !!sheet.owner_email && !!user?.email && sheet.owner_email.toLowerCase() === user.email.toLowerCase();
                      return (
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
                          {tab === "org" && !isOwn && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-semibold uppercase">Read-only</span>
                          )}
                          {tab === "org" && isOwn && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-semibold uppercase">Yours</span>
                          )}
                        </td>
                        {(isAdmin || tab === "org") && (
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {sheet.owner_email || "—"}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {new Date(sheet.updated_at || sheet.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpen(sheet)}
                              className="btn-primary h-6 px-3 text-[11px] rounded"
                            >
                              {tab === "org" && !isOwn ? "View" : "Open"}
                            </button>
                            {(tab === "mine" || isOwn) && (
                              <button
                                onClick={() => handleDelete(sheet)}
                                className="h-6 w-6 flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                title="Delete sheet"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                      })()
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

      <MfaManageDialog open={mfaDialogOpen} onOpenChange={setMfaDialogOpen} />
      <MfaSetupGate onSetup={() => setMfaDialogOpen(true)} />
    </div>
  );
}
