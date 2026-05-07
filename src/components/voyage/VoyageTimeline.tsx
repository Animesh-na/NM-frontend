import { Ship, MapPin, Anchor } from "lucide-react";
import { useVoyageContext } from "@/context/VoyageContext";

export function VoyageTimeline() {
  const { sequence } = useVoyageContext();

  // Filter rows that have ports assigned
  const portsWithTime = sequence.filter(r => r.port && r.port.trim() !== "");

  if (portsWithTime.length === 0) {
    return (
      <div className="calc-card-compact">
        <div className="section-header-compact">
          <Ship className="h-3.5 w-3.5" />
          <span>Voyage Timeline</span>
        </div>
        <div className="p-3 text-[10px] text-muted-foreground text-center">
          Add ports to see the voyage timeline
        </div>
      </div>
    );
  }

  const fmtTime = (utc?: string) => {
    if (!utc) return "—";
    // utc is in format "YYYY-MM-DDTHH:mm"
    const d = new Date(utc);
    if (isNaN(d.getTime())) return "—";
    const day = d.getDate().toString().padStart(2, "0");
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    const yr = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${day} ${mon} ${yr}, ${hh}:${mm}`;
  };

  return (
    <div className="calc-card-compact">
      <div className="section-header-compact">
        <Ship className="h-3.5 w-3.5" />
        <span>Voyage Timeline</span>
      </div>
      <div className="p-2">
        <div className="relative">
          {portsWithTime.map((row, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === portsWithTime.length - 1;
            const hasArr = row.legArrivalUtc && row.type !== "open";
            const hasDep = row.legDepartureUtc;

            return (
              <div key={row.id} className="flex gap-2 relative">
                {/* Vertical line */}
                <div className="flex flex-col items-center w-4 shrink-0">
                  <div className={`w-3 h-3 rounded-full border-2 z-10 flex items-center justify-center ${
                    isFirst ? "border-primary bg-primary" :
                    isLast ? "border-success bg-success" :
                    "border-accent bg-accent"
                  }`}>
                    {isFirst && <Anchor className="h-1.5 w-1.5 text-primary-foreground" />}
                    {isLast && <MapPin className="h-1.5 w-1.5 text-success-foreground" />}
                  </div>
                  {!isLast && (
                    <div className="w-[1.5px] flex-1 bg-border min-h-[20px]" />
                  )}
                </div>

                {/* Content */}
                <div className={`flex-1 pb-2 ${isLast ? "pb-0" : ""}`}>
                  <div className="text-[10px] font-semibold text-foreground leading-tight">
                    {row.port}
                    {row.type === "open" && (
                      <span className="ml-1 text-[9px] font-normal text-muted-foreground">(Open)</span>
                    )}
                    {row.type === "repos" && (
                      <span className="ml-1 text-[9px] font-normal text-muted-foreground">(Repo)</span>
                    )}
                    {row.operation && row.type === "port" && (
                      <span className="ml-1 text-[9px] font-normal text-muted-foreground capitalize">
                        ({row.operation})
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 text-[9px] mt-0.5">
                    {hasArr && (
                      <>
                        <span className="text-muted-foreground">Arr:</span>
                        <span className="font-mono tabular-nums">{fmtTime(row.legArrivalUtc)}</span>
                      </>
                    )}
                    {hasDep && (
                      <>
                        <span className="text-muted-foreground">Dep:</span>
                        <span className="font-mono tabular-nums">{fmtTime(row.legDepartureUtc)}</span>
                      </>
                    )}
                  </div>
                  {/* Sea time info */}
                  {!isLast && row.type !== "open" && (row.totalLegTime ?? 0) > 0 && (
                    <div className="text-[8px] text-muted-foreground mt-0.5 italic">
                      ⛵ {(row.totalLegTime ?? 0).toFixed(2)}d sailing
                      {(row.weatherDelayHours ?? 0) > 0 && (
                        <span className="text-warning"> (+{((row.weatherDelayHours ?? 0) / 24).toFixed(2)}d weather)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Final arrival summary */}
        {portsWithTime.length >= 2 && portsWithTime[portsWithTime.length - 1].legArrivalUtc && (
          <div className="mt-2 pt-1.5 border-t border-border text-[10px]">
            <div className="flex justify-between items-center">
              <span className="font-medium text-foreground">Final Arrival</span>
              <span className="font-mono tabular-nums font-semibold text-primary">
                {fmtTime(portsWithTime[portsWithTime.length - 1].legArrivalUtc)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}