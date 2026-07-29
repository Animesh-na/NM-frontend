import { memo } from "react";
import { FLEET } from "./dashboardData";

const STATUS_BADGE: Record<string, string> = {
  "At Sea": "dash-badge-info",
  "In Port": "dash-badge-neutral",
  Loading: "dash-badge-warning",
  Discharging: "dash-badge-warning",
  Idle: "dash-badge-danger",
};

function FleetPerformanceTableBase() {
  return (
    <div className="dash-card overflow-hidden">
      <div className="flex items-center justify-between p-5 pb-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">Fleet Performance</h3>
          <p className="text-[12px] dash-muted">Daily consumption, emissions and utilisation</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide dash-muted" style={{ background: "hsl(var(--dash-bg))" }}>
              <th className="px-5 py-2.5 font-semibold">Vessel</th>
              <th className="px-5 py-2.5 font-semibold">Route</th>
              <th className="px-5 py-2.5 font-semibold">Status</th>
              <th className="px-5 py-2.5 text-right font-semibold">Speed</th>
              <th className="px-5 py-2.5 text-right font-semibold">Fuel /d</th>
              <th className="px-5 py-2.5 text-right font-semibold">CO₂e /d</th>
              <th className="px-5 py-2.5 text-right font-semibold">Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {FLEET.map((v) => (
              <tr
                key={v.id}
                className="border-t transition-colors hover:bg-dash-bg"
                style={{ borderColor: "hsl(var(--dash-border))" }}
              >
                <td className="px-5 py-3">
                  <p className="font-semibold leading-tight">{v.name}</p>
                  <p className="text-[11px] dash-muted">{v.type}</p>
                </td>
                <td className="px-5 py-3 dash-muted">{v.route}</td>
                <td className="px-5 py-3"><span className={STATUS_BADGE[v.status]}>{v.status}</span></td>
                <td className="px-5 py-3 text-right tabular-nums">{v.speed.toFixed(1)} kn</td>
                <td className="px-5 py-3 text-right tabular-nums">{v.fuelPerDay.toFixed(1)} mt</td>
                <td className="px-5 py-3 text-right tabular-nums">{v.co2PerDay.toFixed(1)} t</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: "hsl(var(--dash-border))" }}>
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${v.utilization}%`,
                          background: v.utilization >= 80 ? "hsl(var(--success))" : v.utilization >= 60 ? "hsl(var(--warning))" : "hsl(var(--danger))",
                        }}
                      />
                    </span>
                    <span className="w-9 text-right tabular-nums text-[12px] dash-muted">{v.utilization}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const FleetPerformanceTable = memo(FleetPerformanceTableBase);
export default FleetPerformanceTable;