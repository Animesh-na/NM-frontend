import { memo } from "react";
import { Users, Activity, Shield, LogOut, Ship, ArrowLeft, Building2 } from "lucide-react";

export type AdminSection = "users" | "organizations" | "logs";

interface Props {
  section: AdminSection;
  onSelect: (s: AdminSection) => void;
  onBack: () => void;
  onLogout: () => void;
  userEmail?: string;
  userRole?: string;
}

const NAV: { key: AdminSection; label: string; icon: typeof Users }[] = [
  { key: "users", label: "User Management", icon: Users },
  { key: "organizations", label: "Organizations", icon: Building2 },
  { key: "logs", label: "Activity & Logs", icon: Activity },
];

function AdminSidebarBase({ section, onSelect, onBack, onLogout, userEmail, userRole }: Props) {
  return (
    <aside
      className="hidden lg:flex w-60 shrink-0 flex-col"
      style={{ background: "hsl(var(--dash-sidebar))", color: "hsl(var(--dash-sidebar-foreground))" }}
    >
      <div className="flex items-center gap-2.5 px-5 h-16 border-b" style={{ borderColor: "hsl(0 0% 100% / 0.08)" }}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "hsl(var(--teal))" }}>
          <Ship className="h-5 w-5 text-white" />
        </span>
        <span>
          <span className="block text-[15px] font-extrabold tracking-tight text-white leading-tight">VoyageCalc</span>
          <span className="block text-[11px] opacity-60">Admin Console</span>
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ key, label, icon: Icon }) => {
          const active = section === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all duration-200"
              style={{
                background: active ? "hsl(0 0% 100% / 0.10)" : "transparent",
                color: active ? "#fff" : "inherit",
                boxShadow: active ? "inset 2px 0 0 hsl(var(--teal))" : "none",
              }}
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: active ? "hsl(var(--teal))" : undefined }} />
              <span className="truncate">{label}</span>
            </button>
          );
        })}

        <div className="my-3 h-px" style={{ background: "hsl(0 0% 100% / 0.08)" }} />

        <button
          onClick={onBack}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
      </nav>

      <div className="border-t p-3" style={{ borderColor: "hsl(0 0% 100% / 0.08)" }}>
        <div className="mb-2 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: "hsl(var(--ocean-400))" }}>
            {userEmail?.charAt(0).toUpperCase() || "A"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold text-white">{userEmail}</span>
            <span className="block text-[10px] uppercase opacity-60 flex items-center gap-1">
              <Shield className="h-2.5 w-2.5" />{userRole || "admin"}
            </span>
          </span>
        </div>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </aside>
  );
}

export const AdminSidebar = memo(AdminSidebarBase);
export default AdminSidebar;
