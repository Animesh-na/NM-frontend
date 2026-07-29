import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  icon: LucideIcon;
  tone?: "ocean" | "teal" | "success" | "warning" | "danger";
}

const TONE: Record<string, { bg: string; fg: string }> = {
  ocean: { bg: "hsl(var(--ocean) / 0.10)", fg: "hsl(var(--ocean))" },
  teal: { bg: "hsl(var(--teal) / 0.12)", fg: "hsl(var(--teal))" },
  success: { bg: "hsl(var(--success) / 0.12)", fg: "hsl(var(--success))" },
  warning: { bg: "hsl(var(--warning) / 0.15)", fg: "hsl(38 92% 36%)" },
  danger: { bg: "hsl(var(--danger) / 0.12)", fg: "hsl(var(--danger))" },
};

function KpiCardBase({ label, value, unit, delta, deltaLabel, icon: Icon, tone = "ocean" }: KpiCardProps) {
  const t = TONE[tone] ?? TONE.ocean;
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="dash-card dash-card-hover p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium dash-muted truncate">{label}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-[26px] leading-none font-bold tracking-tight tabular-nums">{value}</span>
            {unit && <span className="text-[12px] font-semibold dash-muted">{unit}</span>}
          </div>
        </div>
        <span
          className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: t.bg, color: t.fg }}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {(delta !== undefined || deltaLabel) && (
        <div className="mt-3 flex items-center gap-1.5 text-[12px]">
          {delta !== undefined && (
            <span
              className="inline-flex items-center gap-0.5 font-semibold"
              style={{ color: positive ? "hsl(var(--success))" : "hsl(var(--danger))" }}
            >
              {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {Math.abs(delta)}%
            </span>
          )}
          {deltaLabel && <span className="dash-muted truncate">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}

export const KpiCard = memo(KpiCardBase);