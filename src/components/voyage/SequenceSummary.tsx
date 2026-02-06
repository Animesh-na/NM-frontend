import { useVoyageContext } from "@/context/VoyageContext";

export function SequenceSummary() {
  const { sequence, results } = useVoyageContext();

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
    <div className="mt-3 pt-3 border-t">
      <div className="text-xs font-medium text-muted-foreground mb-2">Sequence Summary</div>
      <div className="grid grid-cols-3 gap-4">
        {/* Per-leg breakdown */}
        <div className="col-span-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium pb-1">Leg</th>
                <th className="text-right font-medium pb-1">SM%</th>
                <th className="text-right font-medium pb-1">Base</th>
                <th className="text-right font-medium pb-1">+Margin</th>
                <th className="text-right font-medium pb-1">Sea</th>
                <th className="text-right font-medium pb-1">Port</th>
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
                  <td className="py-0.5 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
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

        {/* Totals */}
        <div className="bg-muted/30 rounded p-2 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Base sea time:</span>
            <span className="font-mono tabular-nums">{totals.baseSeaTime.toFixed(2)}d</span>
          </div>
          <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400">
            <span>+ Sea margin:</span>
            <span className="font-mono tabular-nums">+{totals.seaMarginTime.toFixed(2)}d</span>
          </div>
          <div className="flex justify-between text-xs border-t pt-1 mt-1">
            <span className="text-muted-foreground">Total at sea:</span>
            <span className="font-mono tabular-nums font-medium">{results.totalSeaDays.toFixed(2)}d</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total in port:</span>
            <span className="font-mono tabular-nums font-medium">{results.totalPortDays.toFixed(2)}d</span>
          </div>
          <div className="flex justify-between text-xs border-t pt-1 mt-1">
            <span className="font-medium">Total voyage:</span>
            <span className="font-mono tabular-nums font-bold text-primary">
              {results.totalVoyageDays.toFixed(2)}d
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
