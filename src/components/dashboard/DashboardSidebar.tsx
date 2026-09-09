import { memo } from "react";
import {
  LayoutDashboard, FileText, UserCircle2, Shield, ShieldCheck, LogOut, Ship, Package, ClipboardList,
  Anchor, CalendarClock, Recycle, BadgeDollarSign, Waypoints, BookOpen,
} from "lucide-react";
import { getApiMode } from "@/services/apiMode";

export type DashSection =
  | "overview" | "workbooks" | "fixtures" | "received_fixtures" | "cargoes" | "users"
  | "fleet_in_service" | "scheduled_deliveries" | "demolitions" | "valuations" | "flows";

interface Props {
  section: DashSection;
  onSelect: (s: DashSection) => void;
  isAdmin: boolean;
  mfaEnabled: boolean;
  onAdmin: () => void;
  onSecurity: () => void;
  onLogout: () => void;
  userEmail?: string;
  userRole?: string;
}

const getNav = (mode: "dry-bulk" | "tanker"): { key: DashSection; label: string; icon: typeof FileText }[] => [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "workbooks", label: "Workbooks", icon: BookOpen },
  { key: "fixtures", label: "Fixtures", icon: ClipboardList },
  { key: "received_fixtures", label: "Received Fixtures", icon: ClipboardList },
  { key: "cargoes", label: "Cargo List", icon: Package },
  { key: "flows", label: mode === "tanker" ? "Oil Flows" : "Dry Bulk Flows", icon: Waypoints },
  { key: "users", label: "Organization Users", icon: UserCircle2 },
];

const SP_NAV: { key: DashSection; label: string; icon: typeof FileText }[] = [
  { key: "fleet_in_service", label: "Fleet in Service", icon: Anchor },
  { key: "scheduled_deliveries", label: "Scheduled Deliveries", icon: CalendarClock },
  { key: "demolitions", label: "Demolitions", icon: Recycle },
  { key: "valuations", label: "Valuations", icon: BadgeDollarSign },
];

function DashboardSidebarBase({
  section, onSelect, isAdmin, mfaEnabled, onAdmin, onSecurity, onLogout, userEmail, userRole,
}: Props) {
  const navButton = ({ key, label, icon: Icon }: { key: DashSection; label: string; icon: typeof FileText }) => {
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
  };
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
          <span className="block text-[11px] opacity-60">Maritime Platform</span>
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 dash-sidebar-scroll">
        {getNav(getApiMode()).map((item) => navButton(item))}

        <div className="my-3 h-px" style={{ background: "hsl(0 0% 100% / 0.08)" }} />
        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider opacity-50">S&amp;P / Orderbook</p>
        {SP_NAV.map((item) => navButton(item))}

        <div className="my-3 h-px" style={{ background: "hsl(0 0% 100% / 0.08)" }} />

        {isAdmin && (
          <button
            onClick={onAdmin}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors hover:bg-white/10"
          >
            <Shield className="h-4 w-4" /> Admin Panel
          </button>
        )}
        <button
          onClick={onSecurity}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors hover:bg-white/10"
        >
          <ShieldCheck className="h-4 w-4" style={{ color: mfaEnabled ? "hsl(var(--success))" : undefined }} />
          Security
          {!mfaEnabled && <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: "hsl(var(--warning))" }} />}
        </button>
      </nav>

      <div className="border-t p-3" style={{ borderColor: "hsl(0 0% 100% / 0.08)" }}>
        <div className="mb-2 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: "hsl(var(--ocean-400))" }}>
            {userEmail?.charAt(0).toUpperCase() || "U"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold text-white">{userEmail}</span>
            <span className="block text-[10px] uppercase opacity-60">{userRole || "user"}</span>
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

export const DashboardSidebar = memo(DashboardSidebarBase);
export default DashboardSidebar;