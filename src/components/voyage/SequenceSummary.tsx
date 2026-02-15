import { useVoyageContext } from "@/context/VoyageContext";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function SequenceSummary() {
  const { sequence, results } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate totals from sequence rows
  const totals = sequence.reduce(
    (acc, row) => {
      if (row.type !== "open") {
        acc.baseSeaTime += row.baseSeaTime;
        acc.seaMarginTime += row.seaMarginTime;
        acc.totalSeaTime += row.totalLegTime;
        acc.portDays += row.wdaysPortOverride ?? row.calculatedPortDays;
      }
      return acc;
    },
    { baseSeaTime: 0, seaMarginTime: 0, totalSeaTime: 0, portDays: 0 }
  );

  return (
    <div className="mt-1 pt-1 border-t">
      {/* Compact inline summary - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-[10px] hover:bg-muted/30 rounded px-1 py-0.5"
      >
        <span className="font-medium text-muted-foreground">Sequence Summary</span>
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span className="text-muted-foreground">Sea: <span className="text-foreground font-medium">{results.totalSeaDays.toFixed(2)}d</span></span>
          <span className="text-muted-foreground">Port: <span className="text-foreground font-medium">{results.totalPortDays.toFixed(2)}d</span></span>
          <span className="text-muted-foreground">Total: <span className="text-primary font-bold">{results.totalVoyageDays.toFixed(2)}d</span></span>
          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
        </div>
      </button>

      {/* Expandable detail */}
      {isExpanded && (
        <div className="grid grid-cols-3 gap-3 mt-1">
          <div className="col-span-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium pb-0.5">Leg</th>
                  <th className="text-right font-medium pb-0.5">SM%</th>
                  <th className="text-right font-medium pb-0.5">Base</th>
                  <th className="text-right font-medium pb-0.5">+Margin</th>
                  <th className="text-right font-medium pb-0.5">Sea</th>
                  <th className="text-right font-medium pb-0.5">Port</th>
                </tr>
              </thead>
              <tbody>
                {sequence.slice(1).map((row) => (
                  <tr key={row.id} className="border-t border-border/50">
                    <td className="py-0.5 text-muted-foreground truncate max-w-[100px]">
                      {row.port || row.type}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums text-muted-foreground">
                      {row.seaMargin || 0}%
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums text-muted-foreground">
                      {row.baseSeaTime.toFixed(2)}d
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums text-warning">
                      {row.seaMarginTime > 0 ? `+${row.seaMarginTime.toFixed(2)}d` : "—"}
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums">
                      {row.totalLegTime.toFixed(2)}d
                    </td>
                    <td className="py-0.5 text-right font-mono tabular-nums">
                      {(row.wdaysPortOverride ?? row.calculatedPortDays).toFixed(2)}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-muted/30 rounded p-1.5 space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Base sea time:</span>
              <span className="font-mono tabular-nums">{totals.baseSeaTime.toFixed(2)}d</span>
            </div>
            <div className="flex justify-between text-xs text-warning">
              <span>+ Sea margin:</span>
              <span className="font-mono tabular-nums">+{totals.seaMarginTime.toFixed(2)}d</span>
            </div>
            <div className="flex justify-between text-xs border-t pt-0.5 mt-0.5">
              <span className="text-muted-foreground">Total at sea:</span>
              <span className="font-mono tabular-nums font-medium">{results.totalSeaDays.toFixed(2)}d</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total in port:</span>
              <span className="font-mono tabular-nums font-medium">{results.totalPortDays.toFixed(2)}d</span>
            </div>
            <div className="flex justify-between text-xs border-t pt-0.5 mt-0.5">
              <span className="font-medium">Total voyage:</span>
              <span className="font-mono tabular-nums font-bold text-primary">
                {results.totalVoyageDays.toFixed(2)}d
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
