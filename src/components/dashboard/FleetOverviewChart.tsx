import { memo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { FLEET_OVERVIEW } from "./dashboardData";

function FleetOverviewChartBase() {
  return (
    <div className="dash-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">Fleet Overview</h3>
          <p className="text-[12px] dash-muted">Vessel distribution across the last 6 months</p>
        </div>
        <span className="dash-badge-info">6M</span>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={FLEET_OVERVIEW} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gAtSea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--ocean-400))" stopOpacity={0.55} />
                <stop offset="100%" stopColor="hsl(var(--ocean-400))" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="gInPort" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--teal))" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(var(--teal))" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="gIdle" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--dash-border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--dash-muted))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--dash-muted))" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid hsl(var(--dash-border))",
                background: "hsl(var(--dash-surface))",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Area type="monotone" dataKey="atSea" name="At sea" stroke="hsl(var(--ocean-400))" fill="url(#gAtSea)" strokeWidth={2} />
            <Area type="monotone" dataKey="inPort" name="In port" stroke="hsl(var(--teal))" fill="url(#gInPort)" strokeWidth={2} />
            <Area type="monotone" dataKey="idle" name="Idle" stroke="hsl(var(--warning))" fill="url(#gIdle)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export const FleetOverviewChart = memo(FleetOverviewChartBase);
export default FleetOverviewChart;