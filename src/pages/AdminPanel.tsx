import { useState, useEffect, useCallback } from "react";
import {
  Ship, Users, FileText, LogOut, ChevronLeft, ChevronRight, Loader2,
  Plus, UserX, UserCheck, ArrowLeft, Eye
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSheets } from "@/context/SheetContext";
import {
  adminListUsers, adminCreateUser, adminDeactivateUser, adminUpdateUser,
  adminListSheets,
  type AdminUser, type AdminSheetItem,
} from "@/services/adminApi";
import { toast } from "@/components/ui/sonner";

type AdminView = "users" | "user-sheets";

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

  // ── User sheets state ──
  const [sheets, setSheets] = useState<AdminSheetItem[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsPage, setSheetsPage] = useState(1);
  const [sheetsTotal, setSheetsTotal] = useState(0);
  const sheetsTotalPages = Math.max(1, Math.ceil(sheetsTotal / 10));

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
    const result = await adminCreateUser(newEmail, newPassword);
    if (result) {
      toast.success(`User "${result.email}" created`);
      setShowCreateForm(false);
      setNewEmail("");
      setNewPassword("");
      fetchUsers();
    } else {
      toast.error("Failed to create user");
    }
    setCreating(false);
  };

  const handleDeactivate = async (u: AdminUser) => {
    const confirmed = window.confirm(`Deactivate user "${u.email}"?`);
    if (!confirmed) return;
    const success = await adminDeactivateUser(u.id);
    if (success) {
      toast.success("User deactivated");
      fetchUsers();
    } else {
      toast.error("Failed to deactivate user");
    }
  };

  const handleReactivate = async (u: AdminUser) => {
    const result = await adminUpdateUser(u.id, { is_active: true });
    if (result) {
      toast.success("User reactivated");
      fetchUsers();
    } else {
      toast.error("Failed to reactivate user");
    }
  };

  const handleViewSheets = (u: AdminUser) => {
    setSelectedUser(u);
    setSheetsPage(1);
    setView("user-sheets");
  };

  const handleOpenSheet = (sheet: AdminSheetItem) => {
    openSheet(sheet.id, sheet.name);
  };

  // ── Render ──
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-section-header text-section-header-foreground h-10 flex items-center justify-between px-4 text-xs flex-shrink-0">
        <div className="flex items-center gap-2">
          <Ship className="h-4 w-4" />
          <span className="font-semibold text-sm">VoyageCalc</span>
          <span className="text-section-header-foreground/50">|</span>
          <span className="text-section-header-foreground/70">Admin Panel</span>
        </div>
        <div className="flex items-center gap-3">
          {currentUser && (
            <span className="text-section-header-foreground/70">{currentUser.email}</span>
          )}
          <button
            onClick={onBack}
            className="flex items-center gap-1 hover:text-section-header-foreground/80 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1 hover:text-section-header-foreground/80 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">

          {/* ═══ USERS VIEW ═══ */}
          {view === "users" && (
            <>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h1 className="text-xl font-semibold text-foreground">User Management</h1>
                  <span className="text-xs text-muted-foreground ml-2">({usersTotal} users)</span>
                </div>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="btn-primary flex items-center gap-1.5 h-8 px-3 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create User
                </button>
              </div>

              {/* Create User Form */}
              {showCreateForm && (
                <div className="bg-card border border-border rounded-md p-4 mb-4">
                  <h3 className="text-sm font-medium text-foreground mb-3">Create New User</h3>
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
                      className="btn-primary h-8 px-4 text-xs flex items-center gap-1.5"
                    >
                      {creating && <Loader2 className="h-3 w-3 animate-spin" />}
                      {creating ? "Creating..." : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="btn-secondary h-8 px-3 text-xs"
                    >
                      Cancel
                    </button>
                  </form>
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
                  <div className="border border-border rounded-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-table-header text-muted-foreground text-xs">
                          <th className="text-left px-3 py-2 font-medium">#</th>
                          <th className="text-left px-3 py-2 font-medium">Email</th>
                          <th className="text-left px-3 py-2 font-medium">Role</th>
                          <th className="text-center px-3 py-2 font-medium">Status</th>
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
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                u.role === "admin"
                                  ? "bg-primary/15 text-primary font-medium"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                u.is_active
                                  ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                  : "bg-destructive/15 text-destructive"
                              }`}>
                                {u.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground text-xs">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleViewSheets(u)}
                                  className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10 rounded-sm transition-colors flex items-center gap-1"
                                  title="View sheets"
                                >
                                  <Eye className="h-3 w-3" />
                                  Sheets
                                </button>
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
                          className="btn-secondary h-7 px-2 disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))}
                          disabled={usersPage >= usersTotalPages}
                          className="btn-secondary h-7 px-2 disabled:opacity-40"
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
                    className="h-7 px-2 btn-secondary text-xs flex items-center gap-1"
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
                <div className="text-center py-20 border border-dashed border-border rounded-md">
                  <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No sheets for this user.</p>
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
                                className="btn-primary h-6 px-3 text-[11px]"
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
                          className="btn-secondary h-7 px-2 disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setSheetsPage(p => Math.min(sheetsTotalPages, p + 1))}
                          disabled={sheetsPage >= sheetsTotalPages}
                          className="btn-secondary h-7 px-2 disabled:opacity-40"
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
  );
}
