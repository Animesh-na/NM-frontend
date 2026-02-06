import { useVoyageContext } from "@/context/VoyageContext";

export function SequenceSummary() {
  const { sequence, results, vessel } = useVoyageContext();

  // Get consumption profile for speed values
  const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;

  // Calculate per-leg times including sea margin
  const legTimes = sequence.map((row, index) => {
    if (index === 0 || row.type === "open") {
      return { baseTime: 0, seaMargin: 0, atSea: 0, inPort: 0 };
    }

    // Determine if laden based on previous operations
    const isLaden = sequence.slice(0, index).some(
      r => r.operation === "loading"
    ) && !sequence.slice(0, index).some(
      (r, i) => r.operation === "discharging" && i > sequence.findIndex(s => s.operation === "loading")
    );
    
    const speed = isLaden ? profile.speed.laden : profile.speed.ballast;
    
    // Calculate base time without sea margin
    const baseTime = speed > 0 ? (row.distance / (speed * 24)) + (row.ecaDistance / (speed * 24)) : 0;
    
    // Sea margin adds extra time
    const seaMarginPercent = row.seaMargin || 0;
    const seaMarginTime = baseTime * (seaMarginPercent / 100);
    
    return {
      baseTime,
      seaMargin: seaMarginPercent,
      atSea: row.totalLegTime, // Already includes sea margin from context
      inPort: row.calculatedPortDays,
    };
  });

  const totalAtSea = legTimes.reduce((sum, leg) => sum + leg.atSea, 0);
  const totalInPort = legTimes.reduce((sum, leg) => sum + leg.inPort, 0);
  const totalBaseTime = legTimes.reduce((sum, leg) => sum + leg.baseTime, 0);
  const seaMarginAdded = totalAtSea - totalBaseTime;

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
                <th className="text-right font-medium pb-1">at sea</th>
                <th className="text-right font-medium pb-1">in port</th>
              </tr>
            </thead>
            <tbody>
              {sequence.slice(1).map((row, index) => (
                <tr key={row.id} className="border-t border-border/50">
                  <td className="py-0.5 text-muted-foreground">
                    {row.port || `Leg ${index + 1}`}
                  </td>
                  <td className="py-0.5 text-right font-mono tabular-nums text-muted-foreground">
                    {row.seaMargin || 0}%
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
            <span className="text-muted-foreground">Base sea time:</span>
            <span className="font-mono tabular-nums">{totalBaseTime.toFixed(2)}d</span>
          </div>
          <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400">
            <span>+ Sea margin:</span>
            <span className="font-mono tabular-nums">+{seaMarginAdded.toFixed(2)}d</span>
          </div>
          <div className="flex justify-between text-xs border-t pt-1 mt-1">
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
