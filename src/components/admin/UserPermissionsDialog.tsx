import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { AdminUser, AdminUserPermissionsPayload } from "@/services/adminApi";

interface Props {
  user: AdminUser;
  saving: boolean;
  onCancel: () => void;
  onSave: (payload: AdminUserPermissionsPayload) => void;
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export default function UserPermissionsDialog({ user, saving, onCancel, onSave }: Props) {
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(!!user.is_active);
  const [expiresAt, setExpiresAt] = useState(toDateInput(user.expires_at));
  const [dryBulk, setDryBulk] = useState(!!user.dry_bulk_access);
  const [tanker, setTanker] = useState(!!user.tanker_access);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      email: email.trim(),
      ...(password ? { password } : {}),
      is_active: isActive,
      expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
      dry_bulk_access: dryBulk,
      tanker_access: tanker,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "hsl(var(--foreground) / 0.35)" }}>
      <form onSubmit={submit} className="dash-card w-full max-w-md p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Permissions & Access</h3>
            <p className="text-[11px] text-muted-foreground">{user.email}</p>
          </div>
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="form-input h-8 w-full px-2 text-sm" disabled={saving} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">New password (min 8 — leave blank to keep)</label>
            <input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              className="form-input h-8 w-full px-2 text-sm" placeholder="••••••••" disabled={saving} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Access expires at (blank = never)</label>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
              className="form-input h-8 w-full px-2 text-sm" disabled={saving} />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <label className="flex items-center justify-between text-xs font-medium text-foreground">
              Active account
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={saving} />
            </label>
            <label className="flex items-center justify-between text-xs font-medium text-foreground">
              Dry bulk access
              <input type="checkbox" checked={dryBulk} onChange={(e) => setDryBulk(e.target.checked)} disabled={saving} />
            </label>
            <label className="flex items-center justify-between text-xs font-medium text-foreground">
              Tanker access
              <input type="checkbox" checked={tanker} onChange={(e) => setTanker(e.target.checked)} disabled={saving} />
            </label>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="dash-btn-ghost h-9 px-3 text-xs">Cancel</button>
          <button type="submit" disabled={saving} className="dash-btn-primary h-9 px-4 text-xs flex items-center gap-1.5">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}