import { Anchor } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import type { SequenceRowUI } from "@/context/VoyageContext";
import type { VesselData } from "@/data/vessels";

interface SequenceCalculationPanelProps {
  sequence: SequenceRowUI[];
  vessel: VesselData;
}

export function SequenceCalculationPanel({ sequence, vessel }: SequenceCalculationPanelProps) {
  const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;

  // Calculate totals
  const totalDistance = sequence.reduce((sum, row) => sum + row.distance, 0);
  const totalEcaDistance = sequence.reduce((sum, row) => sum + row.ecaDistance, 0);
  const grandTotalDistance = totalDistance + totalEcaDistance;
  const totalSeaTime = sequence.reduce((sum, row) => sum + row.totalLegTime, 0);
  const totalPortDays = sequence.reduce((sum, row) => sum + row.calculatedPortDays, 0);

  return (
    <BreakdownCard 
      title="Sequence / Distance & Time" 
      icon={<Anchor className="h-5 w-5" />}
      badge={`${sequence.length} legs`}
    >
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground">Total Distance</div>
          <div className="font-mono font-semibold text-lg">{totalDistance.toLocaleString()} nm</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground">ECA Distance</div>
          <div className="font-mono font-semibold text-lg">{totalEcaDistance.toLocaleString()} nm</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground">Sea Time</div>
          <div className="font-mono font-semibold text-lg">{totalSeaTime.toFixed(2)} d</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground">Port Time</div>
          <div className="font-mono font-semibold text-lg">{totalPortDays.toFixed(2)} d</div>
        </div>
      </div>

      {/* Per-Leg Breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Per-Leg Calculation Details</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-2 px-2 font-medium">#</th>
                <th className="text-left py-2 px-2 font-medium">Type</th>
                <th className="text-left py-2 px-2 font-medium">Port</th>
                <th className="text-right py-2 px-2 font-medium">V (nm)</th>
                <th className="text-right py-2 px-2 font-medium">L (nm)</th>
                <th className="text-right py-2 px-2 font-medium">Speed</th>
                <th className="text-right py-2 px-2 font-medium">SM%</th>
                <th className="text-right py-2 px-2 font-medium">Base Time</th>
                <th className="text-right py-2 px-2 font-medium">Sea Time</th>
                <th className="text-right py-2 px-2 font-medium">Port Days</th>
              </tr>
            </thead>
            <tbody>
              {sequence.map((row, index) => {
                const isLaden = sequence.slice(0, index + 1).some(r => r.operation === "loading") &&
                               !sequence.slice(0, index + 1).some((r, i) => 
                                 i > sequence.findIndex(s => s.operation === "loading") && r.operation === "discharging"
                               );
                const speed = isLaden ? profile.speed.laden : profile.speed.ballast;
                
                // Calculate base time without sea margin
                const baseSeaTime = speed > 0 ? (row.distance / (speed * 24)) + (row.ecaDistance / (speed * 24)) : 0;
                const seaMarginMultiplier = 1 + (row.seaMargin || 0) / 100;
                const adjustedTime = baseSeaTime * seaMarginMultiplier;
                
                return (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 px-2 font-mono">{index + 1}</td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        row.type === "open" ? "bg-blue-500/20 text-blue-700" :
                        row.type === "repos" ? "bg-orange-500/20 text-orange-700" :
                        "bg-green-500/20 text-green-700"
                      }`}>
                        {row.type === "port" ? row.operation : row.type}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-medium">{row.port || "-"}</td>
                    <td className="py-2 px-2 text-right font-mono">{row.distance}</td>
                    <td className="py-2 px-2 text-right font-mono">{row.ecaDistance}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      {row.type !== "open" ? `${speed.toFixed(1)} kn` : "-"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {row.type !== "open" ? `${row.seaMargin || 0}%` : "-"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                      {baseSeaTime > 0 ? `${baseSeaTime.toFixed(2)} d` : "-"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {row.totalLegTime > 0 ? `${row.totalLegTime.toFixed(2)} d` : "-"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">
                      {row.calculatedPortDays > 0 ? `${row.calculatedPortDays.toFixed(2)} d` : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td colSpan={3} className="py-2 px-2">TOTALS</td>
                <td className="py-2 px-2 text-right font-mono">{totalDistance}</td>
                <td className="py-2 px-2 text-right font-mono">{totalEcaDistance}</td>
                <td colSpan={3} className="py-2 px-2"></td>
                <td className="py-2 px-2 text-right font-mono text-primary">{totalSeaTime.toFixed(2)} d</td>
                <td className="py-2 px-2 text-right font-mono text-primary">{totalPortDays.toFixed(2)} d</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Formulas */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Calculation Formulas</h3>
        <div className="grid grid-cols-4 gap-4">
          <FormulaBlock
            name="Base Sailing Time"
            formula="Base Time = (V Distance / Speed × 24) + (L Distance / ECA Speed × 24)"
          />
          <FormulaBlock
            name="Sea Margin Application"
            formula="Adjusted Sea Time = Base Time × (1 + SM% / 100)"
          />
          <FormulaBlock
            name="Bunker Impact"
            formula="Sea Fuel = Adjusted Sea Time × Daily Rate"
          />
          <FormulaBlock
            name="Port Days"
            formula="Port Days = (Qty / Productivity) × Terms + Turn + Extra"
          />
        </div>
      </div>
    </BreakdownCard>
  );
}
