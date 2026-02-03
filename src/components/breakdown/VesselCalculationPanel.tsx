import { Ship } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import type { VesselData } from "@/data/vessels";

interface VesselCalculationPanelProps {
  vessel: VesselData;
}

export function VesselCalculationPanel({ vessel }: VesselCalculationPanelProps) {
  const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;

  return (
    <BreakdownCard 
      title="Vessel Performance" 
      icon={<Ship className="h-5 w-5" />}
      badge={vessel.speedProfile === "eco" ? "Eco Speed" : "Full Speed"}
    >
      <div className="grid grid-cols-2 gap-6">
        {/* Input Parameters */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Input Parameters</h3>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Vessel Particulars</div>
            <ValueRow label="Vessel Name" value={vessel.name || "Not Selected"} source="Vessel" />
            <ValueRow label="Vessel Type" value={vessel.type || "-"} source="Vessel" />
            <ValueRow label="DWT" value={`${vessel.dwt.toLocaleString()} t`} source="Vessel" />
            <ValueRow label="Gross Tonnage" value={`${vessel.gt.toLocaleString()} GT`} source="Vessel" />
            <ValueRow label="Draft" value={`${vessel.draft} m`} source="Vessel" />
            <ValueRow label="TPC/TPI" value={vessel.tpcTpi} source="Vessel" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Speed Profile ({vessel.speedProfile})</div>
            <ValueRow label="Ballast Speed" value={`${profile.speed.ballast.toFixed(1)} kn`} source="Matrix" />
            <ValueRow label="Laden Speed" value={`${profile.speed.laden.toFixed(1)} kn`} source="Matrix" />
            <ValueRow label="Canal Speed" value={`${profile.speed.canal.toFixed(1)} kn`} source="Matrix" />
          </div>
        </div>

        {/* Consumption Rates */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Consumption Rates (MT/day)</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1 font-medium">Mode</th>
                  <th className="text-right py-1 font-medium">HSFO</th>
                  <th className="text-right py-1 font-medium">VLSFO</th>
                  <th className="text-right py-1 font-medium">LSMGO</th>
                  <th className="text-right py-1 font-medium">AE</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-1">Ballast</td>
                  <td className="text-right font-mono">{profile.hsfo.ballast.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.vlsfo.ballast.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.lsmgo.ballast.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.ae.ballast.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1">Laden</td>
                  <td className="text-right font-mono">{profile.hsfo.laden.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.vlsfo.laden.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.lsmgo.laden.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.ae.laden.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1">Canal</td>
                  <td className="text-right font-mono">{profile.hsfo.canal.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.vlsfo.canal.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.lsmgo.canal.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.ae.canal.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1">Load/Discharge</td>
                  <td className="text-right font-mono">{profile.hsfo.load.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.vlsfo.load.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.lsmgo.load.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.ae.load.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-1">Idle</td>
                  <td className="text-right font-mono">{profile.hsfo.idle.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.vlsfo.idle.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.lsmgo.idle.toFixed(1)}</td>
                  <td className="text-right font-mono">{profile.ae.idle.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Key Formulas */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Key Formulas</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormulaBlock
            name="Sea Time Calculation"
            formula="Sea Time = Distance / (Speed × 24)"
            inputs={[
              { label: "Distance", value: "nm", source: "Sequence" },
              { label: "Speed", value: "knots", source: "Matrix" },
            ]}
          />
          <FormulaBlock
            name="Fuel Consumption Calculation"
            formula="Consumption = Time (days) × Rate (MT/day)"
            inputs={[
              { label: "Time", value: "days", source: "Sequence" },
              { label: "Rate", value: "MT/day", source: "Matrix" },
            ]}
          />
        </div>
      </div>
    </BreakdownCard>
  );
}
