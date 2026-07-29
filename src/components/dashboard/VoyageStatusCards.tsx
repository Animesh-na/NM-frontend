import { memo } from "react";
import { Anchor, CheckCircle2, Navigation2, Ship } from "lucide-react";
import { VOYAGE_STATUS } from "./dashboardData";

const ICONS = { laden: Ship, ballast: Navigation2, port: Anchor, completed: CheckCircle2 } as const;
const BADGE: Record<string, string> = {
  info: "dash-badge-info",
  neutral: "dash-badge-neutral",
  warning: "dash-badge-warning",
  success: "dash-badge-success",
};

function VoyageStatusCardsBase() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {VOYAGE_STATUS.map((s) => {
        const Icon = ICONS[s.key as keyof typeof ICONS];
        return (
          <div key={s.key} className="dash-card dash-card-hover p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
                <Icon className="h-4 w-4" style={{ color: "hsl(var(--ocean))" }} />
                {s.label}
              </span>
              <span className={BADGE[s.tone]}>{s.count}</span>
            </div>
            <p className="mt-2 text-[12px] dash-muted">{s.delta}</p>
          </div>
        );
      })}
    </div>
  );
}

export const VoyageStatusCards = memo(VoyageStatusCardsBase);
export default VoyageStatusCards;