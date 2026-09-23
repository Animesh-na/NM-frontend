import { Clock } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import type { SequenceRowUI, MiscState } from "@/context/VoyageContext";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";

interface PortTimeCalculationPanelProps {
  sequence: SequenceRowUI[];
  misc: MiscState;
  results: VoyageResults;
}

export function PortTimeCalculationPanel({ sequence, misc, results }: PortTimeCalculationPanelProps) {
  // Calculate time breakdown by operation type
  const loadingTime = sequence
    .filter(r => r.operation === "loading")
    .reduce((sum, r) => sum + r.calculatedPortDays, 0);
  
  const dischargingTime = sequence
    .filter(r => r.operation === "discharging")
    .reduce((sum, r) => sum + r.calculatedPortDays, 0);
  
  const waitingTime = sequence
    .filter(r => r.operation === "pssg")
    .reduce((sum, r) => sum + r.calculatedPortDays, 0);
  
  const bunkeringTime = sequence
    .filter(r => r.operation === "bunkering")
    .reduce((sum, r) => sum + r.calculatedPortDays, 0);

  // Extra time calculations
  const canal1Days = misc.extraTime.canal1.unit === "days"
    ? misc.extraTime.canal1.value
    : misc.extraTime.canal1.value / 24;

  return (
    <BreakdownCard 
      title="Port & Operational Time" 
      icon={<Clock className="h-5 w-5" />}
    >
      <div className="grid grid-cols-2 gap-6">
        {/* Port Operations Breakdown */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Port Operations</h3>
          
          <div className="space-y-2">
            <ValueRow label="Loading Time" value={`${loadingTime.toFixed(2)} d`} source="Sequence" />
            <ValueRow label="Discharging Time" value={`${dischargingTime.toFixed(2)} d`} source="Sequence" />
            <ValueRow label="Waiting Time" value={`${waitingTime.toFixed(2)} d`} source="Sequence" />
            <ValueRow label="Bunkering Time" value={`${bunkeringTime.toFixed(2)} d`} source="Sequence" />
            <ValueRow label="Total Port Time" value={`${results.totalPortDays.toFixed(2)} d`} isTotal />
          </div>

          <FormulaBlock
            name="Port Days per Operation"
            formula="(Qty / Productivity) × Terms + Turn + Extra"
            inputs={[
              { label: "Qty", value: "MT", source: "Sequence" },
              { label: "Productivity", value: "MT/day", source: "Sequence" },
              { label: "Terms", value: "SHINC/SSHEX/SHEX/SATPM", source: "Sequence" },
              { label: "Turn Time", value: "hours → days", source: "Sequence" },
              { label: "Extra Time", value: "hours → days", source: "Sequence" },
            ]}
          />
        </div>

        {/* Extra Time Inputs */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Extra Time Adjustments</h3>
          
          <div className="space-y-2">
            <ValueRow label="Canal Time" value={`${canal1Days.toFixed(2)} d`} source="Misc" />
            <ValueRow label="Total Extra Time" value={`${results.extraCanalDays.toFixed(2)} d`} isTotal />
          </div>
        </div>
      </div>

      {/* Total Voyage Time Calculation */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Total Voyage Time</h3>
        <FormulaBlock
          name="Total Voyage Duration"
          formula="Sea Time + Port Time + Canal Time + Idle Time + Extra Sailing"
          inputs={[
            { label: "Sea Time (Ballast)", value: `${results.seaDaysBallast.toFixed(2)} d`, source: "Sequence" },
            { label: "Sea Time (Laden)", value: `${results.seaDaysLaden.toFixed(2)} d`, source: "Sequence" },
            { label: "Port Time", value: `${results.totalPortDays.toFixed(2)} d`, source: "Sequence" },
            { label: "Extra Canal", value: `${results.extraCanalDays.toFixed(2)} d`, source: "Misc" },
            { label: "Extra Port", value: `${results.extraPortDays.toFixed(2)} d`, source: "Misc" },
            { label: "Extra Sea", value: `${results.extraSeaDays.toFixed(2)} d`, source: "Misc" },
          ]}
          result={{ label: "Total Voyage Days", value: `${results.totalVoyageDays.toFixed(2)} days` }}
        />
      </div>

      {/* Visual Timeline */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Time Distribution</h3>
        <div className="h-8 rounded-full overflow-hidden flex bg-muted">
          {results.seaDaysBallast > 0 && (
            <div 
              className="bg-blue-500/70 h-full flex items-center justify-center text-[10px] text-white font-medium"
              style={{ width: `${(results.seaDaysBallast / results.totalVoyageDays) * 100}%` }}
            >
              Ballast
            </div>
          )}
          {results.seaDaysLaden > 0 && (
            <div 
              className="bg-green-500/70 h-full flex items-center justify-center text-[10px] text-white font-medium"
              style={{ width: `${(results.seaDaysLaden / results.totalVoyageDays) * 100}%` }}
            >
              Laden
            </div>
          )}
          {results.totalPortDays > 0 && (
            <div 
              className="bg-orange-500/70 h-full flex items-center justify-center text-[10px] text-white font-medium"
              style={{ width: `${(results.totalPortDays / results.totalVoyageDays) * 100}%` }}
            >
              Port
            </div>
          )}
          {(results.extraCanalDays + results.extraPortDays + results.extraSeaDays) > 0 && (
            <div 
              className="bg-purple-500/70 h-full flex items-center justify-center text-[10px] text-white font-medium"
              style={{ width: `${((results.extraCanalDays + results.extraPortDays + results.extraSeaDays) / results.totalVoyageDays) * 100}%` }}
            >
              Extra
            </div>
          )}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>0 days</span>
          <span>{results.totalVoyageDays.toFixed(2)} days</span>
        </div>
      </div>
    </BreakdownCard>
  );
}
