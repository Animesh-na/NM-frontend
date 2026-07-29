import { memo, useState } from "react";
import { Navigation, Ship } from "lucide-react";
import { FLEET, type FleetVessel } from "./dashboardData";

const STATUS_COLOR: Record<string, string> = {
  "At Sea": "hsl(var(--ocean-400))",
  "In Port": "hsl(var(--teal))",
  Loading: "hsl(var(--warning))",
  Discharging: "hsl(var(--warning))",
  Idle: "hsl(var(--dash-muted))",
};

function VesselMapBase() {
  const [active, setActive] = useState<FleetVessel | null>(null);

  return (
    <div className="dash-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">Live Vessel Map</h3>
          <p className="text-[12px] dash-muted">Hover a marker for vessel details</p>
        </div>
        <span className="dash-badge-success">
          <Navigation className="h-3 w-3" /> {FLEET.length} tracked
        </span>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-xl border"
        style={{
          borderColor: "hsl(var(--dash-border))",
          background: "linear-gradient(180deg, hsl(var(--ocean) / 0.06), hsl(var(--teal) / 0.06))",
          aspectRatio: "21 / 9",
          minHeight: 280,
        }}
      >
        <svg viewBox="0 0 100 45" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <g stroke="hsl(var(--ocean) / 0.10)" strokeWidth="0.15">
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={(i + 1) * 4.5} x2="100" y2={(i + 1) * 4.5} />
            ))}
            {Array.from({ length: 19 }).map((_, i) => (
              <line key={`v${i}`} x1={(i + 1) * 5} y1="0" x2={(i + 1) * 5} y2="45" />
            ))}
          </g>
          <g fill="hsl(var(--ocean) / 0.16)" stroke="hsl(var(--ocean) / 0.28)" strokeWidth="0.2">
            <path d="M8 10 L20 7 L28 12 L26 20 L18 24 L10 20 Z" />
            <path d="M22 26 L30 24 L34 32 L28 42 L22 38 Z" />
            <path d="M44 8 L58 6 L62 12 L54 16 L46 15 Z" />
            <path d="M46 18 L58 17 L60 26 L52 34 L46 28 Z" />
            <path d="M62 8 L88 6 L94 16 L84 26 L70 22 L64 14 Z" />
            <path d="M78 30 L90 28 L94 38 L82 40 Z" />
          </g>
        </svg>

        {FLEET.map((v) => (
          <button
            key={v.id}
            type="button"
            onMouseEnter={() => setActive(v)}
            onMouseLeave={() => setActive((cur) => (cur?.id === v.id ? null : cur))}
            onFocus={() => setActive(v)}
            onBlur={() => setActive(null)}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-200 hover:scale-125 focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ left: `${v.x}%`, top: `${v.y}%` }}
            aria-label={`${v.name} — ${v.status}`}
          >
            <span
              className="block h-3.5 w-3.5 rounded-full border-2"
              style={{
                backgroundColor: STATUS_COLOR[v.status],
                borderColor: "hsl(var(--dash-surface))",
                boxShadow: `0 0 0 4px ${STATUS_COLOR[v.status]}22`,
              }}
            />
          </button>
        ))}

        {active && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-lg border p-3 text-[12px] shadow-lg"
            style={{
              left: `min(max(${active.x}%, 12%), 78%)`,
              top: `min(${active.y + 6}%, 68%)`,
              background: "hsl(var(--dash-surface))",
              borderColor: "hsl(var(--dash-border))",
            }}
          >
            <div className="flex items-center gap-1.5 font-bold">
              <Ship className="h-3.5 w-3.5" style={{ color: "hsl(var(--ocean))" }} />
              {active.name}
            </div>
            <p className="dash-muted mt-0.5">{active.type} · {active.id}</p>
            <p className="mt-1">{active.route}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="dash-badge-neutral">{active.status}</span>
              <span className="dash-muted tabular-nums">{active.speed.toFixed(1)} kn</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] dash-muted">
        {Object.entries(STATUS_COLOR).map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export const VesselMap = memo(VesselMapBase);
export default VesselMap;