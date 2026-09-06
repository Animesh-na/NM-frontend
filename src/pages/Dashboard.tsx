import { useState, useEffect, Fragment, Suspense, lazy } from "react";
import {
  Ship, FileText, ChevronLeft, ChevronRight, Loader2, ChevronDown,
  UserCircle2, Search, LogOut, Shield, ShieldCheck, Anchor, Fuel, Leaf, DollarSign, ScrollText, Menu, Package, ClipboardList,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSheets } from "@/context/sheetContextCore";
import { listOrganizationUsers, listUserSheets, type SheetListItem, type OrganizationUser } from "@/services/marineApi";
import { toast } from "@/components/ui/sonner";
import MfaManageDialog from "@/components/mfa/MfaManageDialog";
import MfaSetupGate from "@/components/mfa/MfaSetupGate";
import { CompareSheetsLauncher } from "@/components/compare/CompareSheetsLauncher";
import { CopySheetsLauncher } from "@/components/compare/CopySheetsLauncher";
import { MODE_LABELS } from "@/services/apiMode";
import { DashboardSidebar, type DashSection } from "@/components/dashboard/DashboardSidebar";
import type { MarketKind } from "@/components/dashboard/MarketDataTable";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { VoyageStatusCards } from "@/components/dashboard/VoyageStatusCards";
import { trackEvent, trackView } from "@/services/logger";

const FleetOverviewChart = lazy(() => import("@/components/dashboard/FleetOverviewChart"));
const AnalyticsCharts = lazy(() => import("@/components/dashboard/AnalyticsCharts"));
const VesselMap = lazy(() => import("@/components/dashboard/VesselMap"));
const AlertsActivityPanel = lazy(() => import("@/components/dashboard/AlertsActivityPanel"));
const FleetPerformanceTable = lazy(() => import("@/components/dashboard/FleetPerformanceTable"));
const MarketDataTable = lazy(() => import("@/components/dashboard/MarketDataTable"));
const WorkbooksPanel = lazy(() => import("@/components/dashboard/WorkbooksPanel"));

const ITEMS_PER_PAGE = 10;

const ChartSkeleton = () => (
  <div className="dash-card h-[280px] animate-pulse" />
);

export default function Dashboard() {
  const { logout, user, mode, setMode, availableModes } = useAuth();
  const { openSheet, openOrganizationSheet, setCurrentView, returnSection, setReturnSection } = useSheets();
  const isAdmin = user?.role === "admin";
  const mfaEnabled = !!user?.mfa_method;
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const [section, setSection] = useState<DashSection>(returnSection ?? "overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // When returning from the editor, restore the requested dashboard section
  useEffect(() => {
    if (returnSection) {
      setSection(returnSection);
      setReturnSection(null);
    }
  }, [returnSection, setReturnSection]);
  const [query, setQuery] = useState("");
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | number | null>(null);
  const [userSheetsMap, setUserSheetsMap] = useState<Record<string, { loading: boolean; sheets: SheetListItem[]; page: number; total: number }>>({});
  const MARKET_SECTIONS: DashSection[] = [
    "fixtures", "received_fixtures", "cargoes", "flows", "fleet_in_service", "scheduled_deliveries", "demolitions", "valuations",
  ];
  const isMarketSection = MARKET_SECTIONS.includes(section);
  // Fetch organization users when switching to the Users tab
  useEffect(() => {
    if (section !== "users") return;
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
  }, [section, mode]);

  const handleOpenUserSheet = (sheet: SheetListItem, ownerEmail: string) => {
    const isOwn = !!user?.email && ownerEmail.toLowerCase() === user.email.toLowerCase();
    trackEvent("sheet.open", {
      component: "Dashboard", sheet_id: sheet.id, sheet_name: sheet.name,
      source: "organization-user", owner_email: ownerEmail, read_only: !isOwn, mode,
    });
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
    trackEvent("organization.user.expand", { component: "Dashboard", target_user_id: u.id, target_user_email: u.email });
    if (!userSheetsMap[key]) {
      await loadUserSheetsPage(u, 1);
    }
  };

  const sectionTitle: Record<DashSection, string> = {
    overview: "Fleet Overview",
    workbooks: "Workbooks",
    fixtures: "Market Fixtures",
    received_fixtures: "Received Fixtures",
    cargoes: "Cargo List",
    users: "Organization Users",
    fleet_in_service: "Fleet in Service",
    scheduled_deliveries: "Scheduled Deliveries",
    demolitions: "Orderbook Demolitions",
    valuations: "Vessel Valuations",
    flows: "Dry Bulk Flows",
  };

  const navigate = (s: DashSection) => {
    setSection(s);
    trackView(`dashboard/${s}`, { mode });
    setMobileNavOpen(false);
  };

  const renderUsers = () => (
    usersLoading ? (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "hsl(var(--ocean))" }} />
        <span className="ml-2 text-[13px] dash-muted">Loading users...</span>
      </div>
    ) : orgUsers.length === 0 ? (
      <div className="dash-card border-dashed py-20 text-center">
        <UserCircle2 className="mx-auto mb-3 h-12 w-12 dash-muted opacity-40" />
        <p className="text-[13px] dash-muted">No users found</p>
      </div>
    ) : (
      <div className="dash-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide dash-muted" style={{ background: "hsl(var(--dash-bg))" }}>
                <th className="w-10 px-5 py-2.5 font-semibold"></th>
                <th className="px-5 py-2.5 font-semibold">Email</th>
                <th className="px-5 py-2.5 font-semibold">Role</th>
                <th className="px-5 py-2.5 font-semibold">Access</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-2.5 font-semibold">Created</th>
                <th className="px-5 py-2.5 text-right font-semibold">Sheets</th>
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
                      className="cursor-pointer border-t transition-colors hover:bg-dash-bg"
                      style={{ borderColor: "hsl(var(--dash-border))" }}
                      onClick={() => toggleUserExpand(u)}
                    >
                      <td className="px-5 py-3">
                        <ChevronDown className={`h-4 w-4 dash-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </td>
                      <td className="px-5 py-3 font-semibold">
                        {u.email}
                        {isSelf && <span className="ml-2 dash-badge-success">You</span>}
                      </td>
                      <td className="px-5 py-3 text-[12px] uppercase dash-muted">{u.role || "user"}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {u.dry_bulk_access && <span className="dash-badge-success">Dry Bulk</span>}
                          {u.tanker_access && <span className="dash-badge-success">Tanker</span>}
                          {!u.dry_bulk_access && !u.tanker_access && <span className="text-[11px] dash-muted">None</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={u.is_active === false ? "dash-badge-warning" : "dash-badge-success"}>
                          {u.is_active === false ? "Inactive" : "Active"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[12px] dash-muted">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-[12px] tabular-nums dash-muted">
                        {u.sheet_count ?? entry?.total ?? <FileText className="inline h-3.5 w-3.5 opacity-50" />}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-t" style={{ borderColor: "hsl(var(--dash-border))", background: "hsl(var(--dash-bg))" }}>
                        <td colSpan={7} className="px-5 py-3">
                          {entry?.loading && entry.sheets.length === 0 ? (
                            <div className="flex items-center gap-2 text-[12px] dash-muted">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sheets...
                            </div>
                          ) : !entry || entry.sheets.length === 0 ? (
                            <p className="text-[12px] dash-muted">No sheets for this user.</p>
                          ) : (
                            <>
                              <div className="space-y-1.5">
                                {entry.sheets.map((s) => (
                                  <div
                                    key={s.id}
                                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                                    style={{ background: "hsl(var(--dash-surface))", borderColor: "hsl(var(--dash-border))" }}
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <FileText className="h-3.5 w-3.5 dash-muted" />
                                      <span className="text-[12px] font-semibold">{s.name}</span>
                                      {!isSelf && <span className="dash-badge-warning">Read-only</span>}
                                      <span className="text-[11px] dash-muted">{new Date(s.updated_at || s.created_at).toLocaleString()}</span>
                                    </div>
                                    <button onClick={() => handleOpenUserSheet(s, u.email)} className="dash-btn-primary h-7 px-3 text-[12px]">
                                      {isSelf ? "Open" : "View"}
                                    </button>
                                  </div>
                                ))}
                              </div>
                              {(() => {
                                const uTotalPages = Math.max(1, Math.ceil((entry.total || 0) / ITEMS_PER_PAGE));
                                if (uTotalPages <= 1) return null;
                                return (
                                  <div className="mt-3 flex items-center justify-between text-[11px] dash-muted">
                                    <span>Page {entry.page} of {uTotalPages} ({entry.total} sheets)</span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => loadUserSheetsPage(u, Math.max(1, entry.page - 1))}
                                        disabled={entry.page <= 1 || entry.loading}
                                        className="dash-btn-ghost h-7 px-2 disabled:opacity-40"
                                      >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => loadUserSheetsPage(u, Math.min(uTotalPages, entry.page + 1))}
                                        disabled={entry.page >= uTotalPages || entry.loading}
                                        className="dash-btn-ghost h-7 px-2 disabled:opacity-40"
                                      >
                                        <ChevronRight className="h-3.5 w-3.5" />
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
      </div>
    )
  );

  return (
    <div className="dash-root flex h-screen overflow-hidden">
      <DashboardSidebar
        section={section}
        onSelect={navigate}
        isAdmin={!!isAdmin}
        mfaEnabled={mfaEnabled}
        onAdmin={() => setCurrentView("admin")}
        onSecurity={() => setMfaDialogOpen(true)}
        onLogout={logout}
        userEmail={user?.email}
        userRole={user?.role}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header
          className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-6"
          style={{ background: "hsl(var(--dash-surface))", borderColor: "hsl(var(--dash-border))" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg border"
              style={{ borderColor: "hsl(var(--dash-border))" }}
              onClick={() => setMobileNavOpen(v => !v)}
              aria-label="Toggle navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-extrabold tracking-tight">{sectionTitle[section]}</h1>
              <p className="truncate text-[12px] dash-muted">
                Welcome back{user ? `, ${user.email.split("@")[0]}` : ""} — {MODE_LABELS[mode]} operations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {section === "workbooks" && (
              <div className="relative hidden md:block">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 dash-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={section === "workbooks" ? "Search workbooks..." : "Search sheets..."}
                  className="h-9 w-56 rounded-lg border pl-8 pr-3 text-[13px] outline-none transition-colors focus:ring-2"
                  style={{ borderColor: "hsl(var(--dash-border))", background: "hsl(var(--dash-bg))" }}
                />
              </div>
            )}
            <div className="flex items-center overflow-hidden rounded-lg border" style={{ borderColor: "hsl(var(--dash-border))" }}>
              {(["dry-bulk", "tanker"] as const).map((m) => {
                const allowed = availableModes.includes(m);
                return (
                  <button
                    key={m}
                    onClick={() => {
                      if (!allowed) {
                        trackEvent("mode.switch.denied", { component: "Dashboard", requested_mode: m }, "warn");
                        toast.error(`You do not have access to ${MODE_LABELS[m]}. Please contact your administrator to request access.`);
                        return;
                      }
                      trackEvent("mode.switch", { component: "Dashboard", from_mode: mode, to_mode: m });
                      setMode(m);
                    }}
                    title={allowed ? undefined : `You do not have access to ${MODE_LABELS[m]}. Please contact your administrator to request access.`}
                    className="h-9 px-3 text-[12px] font-semibold transition-colors"
                    style={
                      mode === m && allowed
                        ? { background: "hsl(var(--ocean))", color: "#fff" }
                        : { color: "hsl(var(--dash-muted))", opacity: allowed ? 1 : 0.5 }
                    }
                  >
                    {MODE_LABELS[m]}
                  </button>
                );
              })}
            </div>
            <CopySheetsLauncher variant="dashboard" />
            <CompareSheetsLauncher variant="dashboard" />
          </div>
        </header>

        {/* Mobile nav */}
        {mobileNavOpen && (
          <div className="lg:hidden border-b p-3" style={{ background: "hsl(var(--dash-surface))", borderColor: "hsl(var(--dash-border))" }}>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["overview", "Overview", Ship],
                ["workbooks", "Workbooks", FileText],
                ["fixtures", "Fixtures", ClipboardList],
                ["received_fixtures", "Received Fixtures", ClipboardList],
                ["cargoes", "Cargo List", Package],
                ["flows", "Flows", Package],
                ["users", "Org Users", UserCircle2],
                ["fleet_in_service", "Fleet in Service", Ship],
                ["scheduled_deliveries", "Deliveries", ClipboardList],
                ["demolitions", "Demolitions", Package],
                ["valuations", "Valuations", DollarSign],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => navigate(key)}
                  className="dash-btn-ghost justify-start"
                  style={section === key ? { background: "hsl(var(--ocean))", color: "#fff", borderColor: "hsl(var(--ocean))" } : undefined}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
              {isAdmin && (
                <button onClick={() => setCurrentView("admin")} className="dash-btn-ghost justify-start">
                  <Shield className="h-4 w-4" /> Admin
                </button>
              )}
              <button onClick={() => setMfaDialogOpen(true)} className="dash-btn-ghost justify-start">
                <ShieldCheck className="h-4 w-4" /> Security
              </button>
              <button onClick={logout} className="dash-btn-ghost justify-start">
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-[1400px] space-y-5">
            {section === "overview" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                  <KpiCard label="Active Voyages" value="24" delta={8} deltaLabel="vs last month" icon={Anchor} tone="ocean" />
                  <KpiCard label="Fleet Size" value="32" unit="vessels" delta={3} deltaLabel="2 newbuilds" icon={Ship} tone="teal" />
                  <KpiCard label="Fuel Consumption" value="2,278" unit="mt" delta={-4} deltaLabel="month to date" icon={Fuel} tone="warning" />
                  <KpiCard label="CO₂ Emissions" value="7,025" unit="t CO₂e" delta={-6} deltaLabel="month to date" icon={Leaf} tone="success" />
                  <KpiCard label="Profit" value="$4.82M" delta={12} deltaLabel="net voyage result" icon={DollarSign} tone="success" />
                  <KpiCard label="Charter Parties" value="18" unit="active" delta={5} deltaLabel="3 renewals due" icon={ScrollText} tone="ocean" />
                </div>

                <VoyageStatusCards />

                <Suspense fallback={<ChartSkeleton />}>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="xl:col-span-2"><VesselMap /></div>
                    <FleetOverviewChart />
                  </div>
                </Suspense>

                <Suspense fallback={<ChartSkeleton />}>
                  <AlertsActivityPanel />
                </Suspense>

                <Suspense fallback={<ChartSkeleton />}>
                  <AnalyticsCharts />
                </Suspense>

                <Suspense fallback={<ChartSkeleton />}>
                  <FleetPerformanceTable />
                </Suspense>
              </>
            ) : isMarketSection ? (
              <Suspense fallback={<ChartSkeleton />}>
                <MarketDataTable key={section} kind={section as MarketKind} />
              </Suspense>
            ) : section === "workbooks" ? (
              <Suspense fallback={<ChartSkeleton />}>
                <WorkbooksPanel query={query} />
              </Suspense>
            ) : (
              renderUsers()
            )}
          </div>
        </main>
      </div>

      <MfaManageDialog open={mfaDialogOpen} onOpenChange={setMfaDialogOpen} />
      <MfaSetupGate onSetup={() => setMfaDialogOpen(true)} />
    </div>
  );
}
