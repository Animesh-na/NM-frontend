import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Loader2, Plus, UserPlus, ArrowLeft } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  adminListOrganizations, adminCreateOrganization, adminGetOrganization, adminAddUserToOrganization,
  adminListUsers,
  type AdminOrganization, type AdminOrganizationDetail, type AdminUser,
} from "@/services/adminApi";

const LIMIT = 20;

export default function OrganizationsPanel() {
  const [orgs, setOrgs] = useState<AdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [detail, setDetail] = useState<AdminOrganizationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const res = await adminListOrganizations(page, LIMIT);
    setOrgs(res.organizations);
    setTotal(res.pagination?.total || 0);
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  const openOrg = async (org: AdminOrganization) => {
    setDetailLoading(true);
    setDetail({ ...org });
    const [res, userRes] = await Promise.all([adminGetOrganization(org.id), adminListUsers(1, 100)]);
    if (res) setDetail(res);
    setUsers(userRes.users || []);
    setDetailLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const created = await adminCreateOrganization(name.trim(), description.trim());
    setCreating(false);
    if (created) {
      toast.success(`Organization "${created.name || name}" created`);
      setName(""); setDescription(""); setShowCreate(false);
      fetchOrgs();
    } else {
      toast.error("Failed to create organization");
    }
  };

  const handleAddUser = async () => {
    if (!detail || !addUserId) return;
    setAdding(true);
    const ok = await adminAddUserToOrganization(detail.id, addUserId);
    setAdding(false);
    if (ok) {
      toast.success("User added to organization");
      setAddUserId("");
      const refreshed = await adminGetOrganization(detail.id);
      if (refreshed) setDetail(refreshed);
    } else {
      toast.error("Failed to add user");
    }
  };

  const members = detail?.users || detail?.members || [];

  if (detail) {
    return (
      <>
        <div className="mb-5 flex items-center gap-2">
          <button onClick={() => setDetail(null)} className="dash-btn-ghost h-8 px-2.5 text-xs flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="text-[15px] font-bold text-foreground">{detail.name}</h2>
          <span className="text-[11px] text-muted-foreground">{detail.description}</span>
        </div>

        <div className="dash-card p-4 mb-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Add user to organization</label>
            <select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              className="form-input w-full h-8 px-2 text-sm"
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddUser}
            disabled={!addUserId || adding}
            className="dash-btn-primary h-9 px-4 text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Add
          </button>
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="dash-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground text-[11px] uppercase tracking-wide">
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  <th className="text-left px-3 py-2 font-medium">Email</th>
                  <th className="text-left px-3 py-2 font-medium">Role</th>
                  <th className="text-center px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground text-xs">No members yet.</td></tr>
                )}
                {members.map((m, idx) => (
                  <tr key={m.id} className="border-t border-border hover:bg-muted/50">
                    <td className="px-3 py-2 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{m.email}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{m.role || "user"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={m.is_active === false ? "dash-badge-danger" : "dash-badge-success"}>
                        {m.is_active === false ? "Inactive" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "hsl(var(--teal) / 0.12)" }}>
            <Building2 className="h-4 w-4" style={{ color: "hsl(var(--teal))" }} />
          </span>
          <div>
            <div className="text-[13px] font-bold text-foreground">Organizations</div>
            <div className="text-[11px] text-muted-foreground">{total} organizations</div>
          </div>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="dash-btn-primary flex items-center gap-1.5 h-9 px-3.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Create Organization
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="dash-card p-4 mb-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required disabled={creating}
              className="form-input w-full h-8 px-2 text-sm" placeholder="Acme Shipping" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={creating}
              className="form-input w-full h-8 px-2 text-sm" placeholder="Container line" />
          </div>
          <button type="submit" disabled={creating} className="dash-btn-primary h-9 px-4 text-xs flex items-center gap-1.5">
            {creating && <Loader2 className="h-3 w-3 animate-spin" />}{creating ? "Creating..." : "Create"}
          </button>
          <button type="button" onClick={() => setShowCreate(false)} className="dash-btn-ghost h-9 px-3 text-xs">Cancel</button>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Loading organizations...</span>
        </div>
      ) : orgs.length === 0 ? (
        <div className="dash-card text-center py-20 border-dashed">
          <Building2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No organizations yet.</p>
        </div>
      ) : (
        <>
          <div className="dash-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground text-[11px] uppercase tracking-wide">
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-center px-3 py-2 font-medium">Users</th>
                  <th className="text-right px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o, idx) => (
                  <tr key={o.id} className="border-t border-border hover:bg-muted/50">
                    <td className="px-3 py-2 text-muted-foreground text-xs">{(page - 1) * LIMIT + idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{o.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{o.description || "—"}</td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">{o.user_count ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => openOrg(o)} className="h-6 px-2 text-[11px] text-primary hover:bg-primary/10 rounded-sm">
                        View members
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <span>Page {page} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="dash-btn-ghost h-8 px-2 disabled:opacity-40">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="dash-btn-ghost h-8 px-2 disabled:opacity-40">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
