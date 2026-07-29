import { memo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { CO2_SERIES, FUEL_SERIES } from "./dashboardData";

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid hsl(var(--dash-border))",
  background: "hsl(var(--dash-surface))",
  fontSize: 12,
};

function FuelChart() {
  return (
    <div className="dash-card p-5">
      <div className="mb-4">
        <h3 className="text-[15px] font-bold tracking-tight">Fuel Consumption</h3>
        <p className="text-[12px] dash-muted">Metric tonnes by grade</p>
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={FUEL_SERIES} margin={{ top: 6, right: 6, left: -18, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--dash-border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--dash-muted))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--dash-muted))" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--dash-bg))" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Bar dataKey="vlsfo" name="VLSFO" fill="hsl(var(--ocean))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="hsfo" name="HSFO" fill="hsl(var(--ocean-400))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="lsmgo" name="LSMGO" fill="hsl(var(--teal))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Co2Chart() {
  return (
    <div className="dash-card p-5">
      <div className="mb-4">
        <h3 className="text-[15px] font-bold tracking-tight">CO₂ Emissions</h3>
        <p className="text-[12px] dash-muted">Tonnes CO₂e — total vs. scheme-covered</p>
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={CO2_SERIES} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--dash-border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--dash-muted))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--dash-muted))" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Line type="monotone" dataKey="total" name="Total CO₂e" stroke="hsl(var(--ocean))" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="euEts" name="EU ETS covered" stroke="hsl(var(--teal))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="ukEts" name="UK ETS covered" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AnalyticsChartsBase() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FuelChart />
      <Co2Chart />
    </div>
  );
}

export const AnalyticsCharts = memo(AnalyticsChartsBase);
export default AnalyticsCharts;