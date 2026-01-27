import { useVoyageContext } from "@/context/VoyageContext";

export function SequenceSummary() {
  const { sequence, results } = useVoyageContext();

  // Calculate per-leg times for display
  const legTimes = sequence.map((row, index) => {
    if (index === 0) {
      return { atSea: 0, inPort: 0 };
    }

    // Simple time at sea calculation: distance / speed / 24
    // We'll use a rough estimate here; actual calculation is in the hook
    const prevRow = sequence[index - 1];
    const isLaden = sequence.slice(0, index).some(
      r => r.operation === "loading"
    ) && !sequence.slice(0, index).some(
      (r, i) => r.operation === "discharging" && i > sequence.findIndex(s => s.operation === "loading")
    );
    
    const speed = isLaden ? 12 : 12.5; // Approximate speeds
    const seaDays = row.distance / (speed * 24);
    
    return {
      atSea: seaDays,
      inPort: row.calculatedPortDays,
    };
  });

  const totalAtSea = legTimes.reduce((sum, leg) => sum + leg.atSea, 0);
  const totalInPort = legTimes.reduce((sum, leg) => sum + leg.inPort, 0);
  const totalTime = totalAtSea + totalInPort;

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
                <th className="text-right font-medium pb-1">at sea</th>
                <th className="text-right font-medium pb-1">in port/canal</th>
              </tr>
            </thead>
            <tbody>
              {sequence.slice(1).map((row, index) => (
                <tr key={row.id} className="border-t border-border/50">
                  <td className="py-0.5 text-muted-foreground">
                    {row.port || `Leg ${index + 1}`}
                  </td>
                  <td className="py-0.5 text-right font-mono tabular-nums">
                    {legTimes[index + 1]?.atSea.toFixed(2)}d
                  </td>
                  <td className="py-0.5 text-right font-mono tabular-nums">
                    {legTimes[index + 1]?.inPort.toFixed(2)}d
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="bg-muted/30 rounded p-2 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Time at sea:</span>
            <span className="font-mono tabular-nums font-medium">{results.totalSeaDays.toFixed(2)}d</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Time in port:</span>
            <span className="font-mono tabular-nums font-medium">{results.totalPortDays.toFixed(2)}d</span>
          </div>
          <div className="flex justify-between text-xs border-t pt-1 mt-1">
            <span className="font-medium">Total time:</span>
            <span className="font-mono tabular-nums font-bold text-primary">
              {results.totalVoyageDays.toFixed(2)}d
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
