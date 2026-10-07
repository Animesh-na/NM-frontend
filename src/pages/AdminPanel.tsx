import { useState, useEffect, useCallback } from "react";
import {
  Users, FileText, ChevronLeft, ChevronRight, Loader2,
  Plus, UserX, UserCheck, ArrowLeft, Eye, ShieldOff, ShieldCheck, Menu, KeyRound,
  Eraser,
} from "lucide-react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import UserPermissionsDialog from "@/components/admin/UserPermissionsDialog";
import { useAuth } from "@/context/AuthContext";
import { useSheets } from "@/context/sheetContextCore";
import {
  adminListUsers, adminCreateUser, adminDeactivateUser, adminUpdateUser,
  adminResetUserMfa, adminListSheets, adminClearCache,
  type AdminUser, type AdminSheetItem, type AdminUserPermissionsPayload,
} from "@/services/adminApi";
import { toast } from "@/components/ui/sonner";
import { trackEvent } from "@/services/logger";

import AdminLogsPage from "@/pages/AdminLogsPage";
import OrganizationsPanel from "@/components/admin/OrganizationsPanel";

type AdminView = "users" | "user-sheets" | "organizations" | "logs";

const MFA_LABEL: Record<string, string> = {
  totp: "Authenticator app",
  email_otp: "Email codes",
};

export default function AdminPanel({ onBack }: { onBack: () => void }) {
  const { logout, user: currentUser } = useAuth();
  const { openSheet } = useSheets();

  const [view, setView] = useState<AdminView>("users");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // ── Users state ──
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const usersTotalPages = Math.max(1, Math.ceil(usersTotal / 20));

  // ── Create user dialog ──
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [newDryBulk, setNewDryBulk] = useState(true);
  const [newTanker, setNewTanker] = useState(false);

  // ── Permissions dialog ──
  const [permUser, setPermUser] = useState<AdminUser | null>(null);
  const [savingPerms, setSavingPerms] = useState(false);

  // ── User sheets state ──
  const [sheets, setSheets] = useState<AdminSheetItem[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsPage, setSheetsPage] = useState(1);
  const [sheetsTotal, setSheetsTotal] = useState(0);
  const sheetsTotalPages = Math.max(1, Math.ceil(sheetsTotal / 10));

  // ── Cache clear state ──
  const [clearingCache, setClearingCache] = useState(false);

  // ── Fetch users ──
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await adminListUsers(usersPage, 20);
      setUsers(res.users || []);
      setUsersTotal(res.pagination?.total || 0);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, [usersPage]);

  useEffect(() => {
    if (view === "users") fetchUsers();
  }, [fetchUsers, view]);

  // ── Fetch user sheets ──
  const fetchUserSheets = useCallback(async () => {
    if (!selectedUser) return;
    setSheetsLoading(true);
    try {
      const res = await adminListSheets(sheetsPage, 10, selectedUser.id);
      setSheets(res.sheets || []);
      setSheetsTotal(res.pagination?.total || 0);
    } catch {
      toast.error("Failed to load sheets");
    } finally {
      setSheetsLoading(false);
    }
  }, [selectedUser, sheetsPage]);

  useEffect(() => {
    if (view === "user-sheets") fetchUserSheets();
  }, [fetchUserSheets, view]);

  // ── Actions ──
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const result = await adminCreateUser(newEmail, newPassword, {
      is_active: true,
      expires_at: null,
      dry_bulk_access: newDryBulk,
      tanker_access: newTanker,
    });
    if (result) {
      trackEvent("admin.user.create", { component: "AdminPanel", target_user_id: result.id, dry_bulk_access: newDryBulk, tanker_access: newTanker });
      toast.success(`User "${result.email}" created`);
      setShowCreateForm(false);
      setNewEmail("");
      setNewPassword("");
      fetchUsers();
    } else {
      trackEvent("admin.user.create.failed", { component: "AdminPanel" }, "error");
      toast.error("Failed to create user");
    }
    setCreating(false);
  };

  const handleSavePermissions = async (payload: AdminUserPermissionsPayload) => {
    if (!permUser) return;
    setSavingPerms(true);
    const result = await adminUpdateUser(permUser.id, payload);
    if (result) {
      trackEvent("admin.user.permissions.update", {
        component: "AdminPanel", target_user_id: permUser.id,
        is_active: payload.is_active, expires_at: payload.expires_at,
        dry_bulk_access: payload.dry_bulk_access, tanker_access: payload.tanker_access,
        password_changed: !!payload.password,
      });
      toast.success("Permissions updated");
      setPermUser(null);
      fetchUsers();
    } else {
      trackEvent("admin.user.permissions.update.failed", { component: "AdminPanel", target_user_id: permUser.id }, "error");
      toast.error("Failed to update permissions");
    }
    setSavingPerms(false);
  };

  const handleDeactivate = async (u: AdminUser) => {
    const confirmed = window.confirm(`Deactivate user "${u.email}"?`);
    if (!confirmed) return;
    const success = await adminDeactivateUser(u.id);
    if (success) {
      trackEvent("admin.user.deactivate", { component: "AdminPanel", target_user_id: u.id });
      toast.success("User deactivated");
      fetchUsers();
    } else {
      trackEvent("admin.user.deactivate.failed", { component: "AdminPanel", target_user_id: u.id }, "error");
      toast.error("Failed to deactivate user");
    }
  };

  const handleResetMfa = async (u: AdminUser) => {
    const confirmed = window.confirm(
      `Reset MFA for "${u.email}"? This removes their second factor entirely — only do this if they lost their authenticator device.`,
    );
    if (!confirmed) return;
    const message = await adminResetUserMfa(u.id);
    if (message) {
      trackEvent("admin.user.mfa.reset", { component: "AdminPanel", target_user_id: u.id });
      toast.success(message);
    } else {
      trackEvent("admin.user.mfa.reset.failed", { component: "AdminPanel", target_user_id: u.id }, "error");
      toast.error("Failed to reset MFA");
    }
  };

  const handleReactivate = async (u: AdminUser) => {
    const result = await adminUpdateUser(u.id, { is_active: true });
    if (result) {
      trackEvent("admin.user.reactivate", { component: "AdminPanel", target_user_id: u.id });
      toast.success("User reactivated");
      fetchUsers();
    } else {
      trackEvent("admin.user.reactivate.failed", { component: "AdminPanel", target_user_id: u.id }, "error");
      toast.error("Failed to reactivate user");
    }
  };

  const handleViewSheets = (u: AdminUser) => {
    trackEvent("admin.user.sheets.view", { component: "AdminPanel", target_user_id: u.id });
    setSelectedUser(u);
    setSheetsPage(1);
    setView("user-sheets");
  };

  const handleOpenSheet = (sheet: AdminSheetItem) => {
    trackEvent("admin.sheet.open", { component: "AdminPanel", sheet_id: sheet.id, sheet_name: sheet.name });
    openSheet(sheet.id, sheet.name);
  };

  const handleClearCache = async () => {
    const confirmed = window.confirm("Clear server cache? This will invalidate cached data until it rebuilds.");
    if (!confirmed) return;
    setClearingCache(true);
    const result = await adminClearCache();
    if (result.success) {
      trackEvent("admin.cache.clear", { component: "AdminPanel" });
      toast.success(result.message || "Cache cleared");
    } else {
      trackEvent("admin.cache.clear.failed", { component: "AdminPanel" }, "error");
      toast.error(result.message || "Failed to clear cache");
    }
    setClearingCache(false);
  };

  // ── Render ──
  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--dash-bg))" }}>
      <AdminSidebar
        section={view === "logs" ? "logs" : view === "organizations" ? "organizations" : "users"}
        onSelect={(s) => { setView(s); setSelectedUser(null); }}
        onBack={onBack}
        onLogout={logout}
        userEmail={currentUser?.email}
        userRole={currentUser?.role}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-5">
          <button onClick={onBack} className="lg:hidden dash-btn-ghost h-8 px-2">
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold tracking-tight text-foreground">
              {view === "logs" ? "Activity & Error Logs" : view === "organizations" ? "Organizations" : view === "user-sheets" ? `Sheets — ${selectedUser?.email ?? ""}` : "User Management"}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {view === "logs" ? "Audit trail across the organization" : view === "organizations" ? "Create organizations and manage their members" : "Administer accounts, access and sheets"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleClearCache}
              disabled={clearingCache}
              className="dash-btn-ghost flex items-center gap-1.5 h-8 px-3 text-xs"
              title="Clear server cache"
            >
              {clearingCache ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eraser className="h-3 w-3" />}
              Clear Cache
            </button>
            <span className="dash-badge-info">Admin</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl">

          {/* ═══ LOGS VIEW ═══ */}
          {view === "logs" && (
            <AdminLogsPage onBack={() => setView("users")} />
          )}

          {/* ═══ ORGANIZATIONS VIEW ═══ */}
          {view === "organizations" && <OrganizationsPanel />}

          {/* ═══ USERS VIEW ═══ */}
          {view === "users" && (
            <>
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "hsl(var(--teal) / 0.12)" }}>
                    <Users className="h-4.5 w-4.5" style={{ color: "hsl(var(--teal))" }} />
                  </span>
                  <div>
                    <div className="text-[13px] font-bold text-foreground">Accounts</div>
                    <div className="text-[11px] text-muted-foreground">{usersTotal} users</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="dash-btn-primary flex items-center gap-1.5 h-9 px-3.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create User
                </button>
              </div>

              {/* Create User Form */}
              {showCreateForm && (
                <div className="dash-card p-4 mb-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Create New User</h3>
                  <form onSubmit={handleCreateUser} className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground block mb-1">Email</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="form-input w-full h-8 px-2 text-sm"
                        placeholder="user@example.com"
                        required
                        disabled={creating}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground block mb-1">Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="form-input w-full h-8 px-2 text-sm"
                        placeholder="Secure password"
                        required
                        disabled={creating}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={creating}
                      className="dash-btn-primary h-9 px-4 text-xs flex items-center gap-1.5"
                    >
                      {creating && <Loader2 className="h-3 w-3 animate-spin" />}
                      {creating ? "Creating..." : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="dash-btn-ghost h-9 px-3 text-xs"
                    >
                      Cancel
                    </button>
                  </form>
                  <div className="mt-3 flex items-center gap-4 text-xs text-foreground">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={newDryBulk} onChange={(e) => setNewDryBulk(e.target.checked)} disabled={creating} />
                      Dry bulk access
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={newTanker} onChange={(e) => setNewTanker(e.target.checked)} disabled={creating} />
                      Tanker access
                    </label>
                  </div>
                </div>
              )}

              {/* Users Table */}
              {usersLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading users...</span>
                </div>
              ) : (
                <>
                  <div className="dash-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/60 text-muted-foreground text-[11px] uppercase tracking-wide">
                          <th className="text-left px-3 py-2 font-medium">#</th>
                          <th className="text-left px-3 py-2 font-medium">Email</th>
                          <th className="text-left px-3 py-2 font-medium">Role</th>
                          <th className="text-center px-3 py-2 font-medium">Status</th>
                          <th className="text-center px-3 py-2 font-medium">Access</th>
                          <th className="text-left px-3 py-2 font-medium">Expires</th>
                          <th className="text-left px-3 py-2 font-medium">Created</th>
                          <th className="text-right px-3 py-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u, idx) => (
                          <tr key={u.id} className="border-t border-border hover:bg-muted/50 transition-colors">
                            <td className="px-3 py-2 text-muted-foreground text-xs">
                              {(usersPage - 1) * 20 + idx + 1}
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground">{u.email}</td>
                            <td className="px-3 py-2">
                              <span className={u.role === "admin" ? "dash-badge-info" : "dash-badge-neutral"}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={u.is_active ? "dash-badge-success" : "dash-badge-danger"}>
                                {u.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span className={u.dry_bulk_access ? "dash-badge-info" : "dash-badge-neutral"}>Dry bulk</span>
                                <span className={u.tanker_access ? "dash-badge-info" : "dash-badge-neutral"}>Tanker</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground text-xs">
                              {u.expires_at ? new Date(u.expires_at).toLocaleDateString() : "Never"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground text-xs">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setPermUser(u)}
                                  className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10 rounded-sm transition-colors flex items-center gap-1"
                                  title="Edit permissions & access"
                                >
                                  <KeyRound className="h-3 w-3" />
                                  Permissions
                                </button>
                                <button
                                  onClick={() => handleViewSheets(u)}
                                  className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10 rounded-sm transition-colors flex items-center gap-1"
                                  title="View sheets"
                                >
                                  <Eye className="h-3 w-3" />
                                  Sheets
                                </button>
                                {u.mfa_method ? (
                                  <button
                                    onClick={() => handleResetMfa(u)}
                                    className="h-6 px-2 text-[11px] text-green-700 dark:text-green-400 hover:bg-green-500/10 rounded-sm transition-colors flex items-center gap-1"
                                    title={`MFA enabled (${MFA_LABEL[u.mfa_method] || u.mfa_method}) — click to reset`}
                                  >
                                    <ShieldCheck className="h-3 w-3" />
                                    Reset MFA
                                  </button>
                                ) : (
                                  <span
                                    className="h-6 px-2 text-[11px] text-destructive bg-destructive/10 rounded-sm flex items-center gap-1"
                                    title="This user has not set up MFA"
                                  >
                                    <ShieldOff className="h-3 w-3" />
                                    MFA not set
                                  </span>
                                )}
                                {u.is_active ? (
                                  <button
                                    onClick={() => handleDeactivate(u)}
                                    className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10 rounded-sm transition-colors flex items-center gap-1"
                                    title="Deactivate user"
                                  >
                                    <UserX className="h-3 w-3" />
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleReactivate(u)}
                                    className="h-6 px-2 text-[11px] text-green-700 dark:text-green-400 hover:bg-green-500/10 rounded-sm transition-colors flex items-center gap-1"
                                    title="Reactivate user"
                                  >
                                    <UserCheck className="h-3 w-3" />
                                    Reactivate
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {usersTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                      <span>Page {usersPage} of {usersTotalPages}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                          disabled={usersPage <= 1}
                          className="dash-btn-ghost h-8 px-2 disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))}
                          disabled={usersPage >= usersTotalPages}
                          className="dash-btn-ghost h-8 px-2 disabled:opacity-40"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ═══ USER SHEETS VIEW ═══ */}
          {view === "user-sheets" && selectedUser && (
            <>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setView("users")}
                    className="dash-btn-ghost h-8 px-2.5 text-xs flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back
                  </button>
                  <FileText className="h-5 w-5 text-primary" />
                  <h1 className="text-lg font-semibold text-foreground">
                    Sheets — {selectedUser.email}
                  </h1>
                  <span className="text-xs text-muted-foreground">({sheetsTotal} sheets)</span>
                </div>
              </div>

              {sheetsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading sheets...</span>
                </div>
              ) : sheets.length === 0 ? (
                <div className="dash-card text-center py-20 border-dashed">
                  <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No sheets for this user.</p>
                </div>
              ) : (
                <>
                  <div className="dash-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/60 text-muted-foreground text-[11px] uppercase tracking-wide">
                          <th className="text-left px-3 py-2 font-medium">#</th>
                          <th className="text-left px-3 py-2 font-medium">Sheet Name</th>
                          <th className="text-left px-3 py-2 font-medium">Last Updated</th>
                          <th className="text-right px-3 py-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheets.map((sheet, idx) => (
                          <tr key={sheet.id} className="border-t border-border hover:bg-muted/50 transition-colors">
                            <td className="px-3 py-2 text-muted-foreground text-xs">
                              {(sheetsPage - 1) * 10 + idx + 1}
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground">{sheet.name}</td>
                            <td className="px-3 py-2 text-muted-foreground text-xs">
                              {new Date(sheet.updated_at || sheet.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => handleOpenSheet(sheet)}
                                className="dash-btn-primary h-7 px-3 text-[11px]"
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {sheetsTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                      <span>Page {sheetsPage} of {sheetsTotalPages}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSheetsPage(p => Math.max(1, p - 1))}
                          disabled={sheetsPage <= 1}
                          className="dash-btn-ghost h-8 px-2 disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setSheetsPage(p => Math.min(sheetsTotalPages, p + 1))}
                          disabled={sheetsPage >= sheetsTotalPages}
                          className="dash-btn-ghost h-8 px-2 disabled:opacity-40"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      {permUser && (
        <UserPermissionsDialog
          user={permUser}
          saving={savingPerms}
          onCancel={() => setPermUser(null)}
          onSave={handleSavePermissions}
        />
      )}
    </div>
  );
}
