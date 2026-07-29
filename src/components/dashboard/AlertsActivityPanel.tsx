import { memo } from "react";
import { AlertTriangle, Bell, Info, OctagonAlert, Activity } from "lucide-react";
import { ACTIVITIES, ALERTS } from "./dashboardData";

const SEVERITY = {
  danger: { icon: OctagonAlert, cls: "dash-badge-danger", color: "hsl(var(--danger))" },
  warning: { icon: AlertTriangle, cls: "dash-badge-warning", color: "hsl(38 92% 40%)" },
  info: { icon: Info, cls: "dash-badge-info", color: "hsl(var(--teal))" },
} as const;

function AlertsActivityPanelBase() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="dash-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Bell className="h-4 w-4" style={{ color: "hsl(var(--ocean))" }} /> Recent Alerts
          </h3>
          <span className="dash-badge-danger">{ALERTS.length} open</span>
        </div>
        <ul className="space-y-2">
          {ALERTS.map((a) => {
            const S = SEVERITY[a.severity];
            const Icon = S.icon;
            return (
              <li
                key={a.id}
                className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-dash-bg"
                style={{ borderColor: "hsl(var(--dash-border))" }}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: S.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-tight">{a.title}</p>
                  <p className="mt-0.5 truncate text-[12px] dash-muted">{a.detail}</p>
                </div>
                <span className="shrink-0 text-[11px] dash-muted">{a.time}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="dash-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Activity className="h-4 w-4" style={{ color: "hsl(var(--teal))" }} /> Recent Activity
          </h3>
        </div>
        <ol className="relative space-y-4 pl-4">
          <span
            className="absolute left-[3px] top-1 bottom-1 w-px"
            style={{ background: "hsl(var(--dash-border))" }}
          />
          {ACTIVITIES.map((a) => (
            <li key={a.id} className="relative">
              <span
                className="absolute -left-4 top-1.5 h-[7px] w-[7px] rounded-full"
                style={{ background: "hsl(var(--ocean-400))" }}
              />
              <p className="text-[13px] leading-tight">
                <span className="font-semibold">{a.who}</span> <span className="dash-muted">{a.what}</span>
              </p>
              <p className="mt-0.5 text-[11px] dash-muted">{a.time}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export const AlertsActivityPanel = memo(AlertsActivityPanelBase);
export default AlertsActivityPanel;