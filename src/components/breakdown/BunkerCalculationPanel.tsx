import { Fuel } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import type { VesselData } from "@/data/vessels";

interface BunkerState {
  hsfo: { price: number; robStart: number };
  vlsfo: { price: number; robStart: number };
  lsmgo: { price: number; robStart: number };
  co2Price: number;
  fuelMode: "average" | "fifo";
  ignoreBOB: boolean;
  rewardFactor: number;
  portBunkering: Array<{
    id: number;
    portUnloc: string;
    portName: string;
    hsfo: { quantity: number; price: number };
    vlsfo: { quantity: number; price: number };
    lsmgo: { quantity: number; price: number };
  }>;
  euEtsHsfo: number;
  euEtsVlsfo: number;
  euEtsLsmgo: number;
}

interface BunkerCalculationPanelProps {
  bunker: BunkerState;
  results: VoyageResults;
  vessel: VesselData;
}

export function BunkerCalculationPanel({ bunker, results, vessel }: BunkerCalculationPanelProps) {
  const formatCurrency = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;

  // Calculate fuel costs
  const hsfoCost = results.hsfoConsumption * bunker.hsfo.price;
  const vlsfoCost = results.vlsfoConsumption * bunker.vlsfo.price;
  const lsmgoCost = results.lsmgoConsumption * bunker.lsmgo.price;

  // Calculate total bunkered
  const totalBunkeredHsfo = bunker.portBunkering.reduce((sum, p) => sum + p.hsfo.quantity, 0);
  const totalBunkeredVlsfo = bunker.portBunkering.reduce((sum, p) => sum + p.vlsfo.quantity, 0);
  const totalBunkeredLsmgo = bunker.portBunkering.reduce((sum, p) => sum + p.lsmgo.quantity, 0);

  return (
    <BreakdownCard 
      title="Bunker Consumption & Cost" 
      icon={<Fuel className="h-5 w-5" />}
      badge={bunker.fuelMode === "average" ? "Average Mode" : "FIFO Mode"}
    >
      <div className="grid grid-cols-2 gap-6">
        {/* Input Parameters */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Bunker Inputs</h3>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">BOB (Bunker On Board)</div>
            <ValueRow label="HSFO ROB Start" value={`${bunker.hsfo.robStart} MT`} source="Bunker" />
            <ValueRow label="VLSFO ROB Start" value={`${bunker.vlsfo.robStart} MT`} source="Bunker" />
            <ValueRow label="LSMGO ROB Start" value={`${bunker.lsmgo.robStart} MT`} source="Bunker" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Fuel Prices</div>
            <ValueRow label="HSFO Price" value={formatCurrency(bunker.hsfo.price) + "/MT"} source="Bunker" />
            <ValueRow label="VLSFO Price" value={formatCurrency(bunker.vlsfo.price) + "/MT"} source="Bunker" />
            <ValueRow label="LSMGO Price" value={formatCurrency(bunker.lsmgo.price) + "/MT"} source="Bunker" />
            <ValueRow label="CO₂ Price" value={formatCurrency(bunker.co2Price) + "/t"} source="Bunker" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Settings</div>
            <ValueRow label="Fuel Mode" value={bunker.fuelMode.toUpperCase()} source="Bunker" />
            <ValueRow label="Ignore BOB" value={bunker.ignoreBOB ? "Yes" : "No"} source="Bunker" />
            <ValueRow label="Reward Factor" value={bunker.rewardFactor.toFixed(2)} source="Bunker" />
          </div>
        </div>

        {/* Consumption Breakdown */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Consumption Breakdown</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1 font-medium">Fuel</th>
                  <th className="text-right py-1 font-medium">BOB</th>
                  <th className="text-right py-1 font-medium">Bunkered</th>
                  <th className="text-right py-1 font-medium">Consumed</th>
                  <th className="text-right py-1 font-medium">ROB End</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-1">HSFO</td>
                  <td className="text-right font-mono">{bunker.hsfo.robStart}</td>
                  <td className="text-right font-mono">{totalBunkeredHsfo}</td>
                  <td className="text-right font-mono">{results.hsfoConsumption.toFixed(2)}</td>
                  <td className="text-right font-mono">{(bunker.hsfo.robStart + totalBunkeredHsfo - results.hsfoConsumption).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1">VLSFO</td>
                  <td className="text-right font-mono">{bunker.vlsfo.robStart}</td>
                  <td className="text-right font-mono">{totalBunkeredVlsfo}</td>
                  <td className="text-right font-mono">{results.vlsfoConsumption.toFixed(2)}</td>
                  <td className="text-right font-mono">{(bunker.vlsfo.robStart + totalBunkeredVlsfo - results.vlsfoConsumption).toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-1">LSMGO</td>
                  <td className="text-right font-mono">{bunker.lsmgo.robStart}</td>
                  <td className="text-right font-mono">{totalBunkeredLsmgo}</td>
                  <td className="text-right font-mono">{results.lsmgoConsumption.toFixed(2)}</td>
                  <td className="text-right font-mono">{(bunker.lsmgo.robStart + totalBunkeredLsmgo - results.lsmgoConsumption).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Consumption Calculation */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Consumption Formulas</h3>
        <div className="grid grid-cols-3 gap-4">
          <FormulaBlock
            name="Sea Consumption (Ballast)"
            formula="Ballast Days × Ballast Rate"
            inputs={[
              { label: "Days", value: `${results.seaDaysBallast.toFixed(2)} d`, source: "Sequence" },
              { label: "VLSFO Rate", value: `${profile.vlsfo.ballast.toFixed(1)} MT/d`, source: "Matrix" },
            ]}
          />
          <FormulaBlock
            name="Sea Consumption (Laden)"
            formula="Laden Days × Laden Rate"
            inputs={[
              { label: "Days", value: `${results.seaDaysLaden.toFixed(2)} d`, source: "Sequence" },
              { label: "VLSFO Rate", value: `${profile.vlsfo.laden.toFixed(1)} MT/d`, source: "Matrix" },
            ]}
          />
          <FormulaBlock
            name="Port Consumption"
            formula="Port Days × AE Rate"
            inputs={[
              { label: "Port Days", value: `${results.totalPortDays.toFixed(2)} d`, source: "Sequence" },
              { label: "AE Rate", value: `${profile.ae.load.toFixed(2)} MT/d`, source: "Matrix" },
            ]}
          />
        </div>
      </div>

      {/* Cost Summary */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Bunker Cost Summary</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">HSFO Cost</div>
            <div className="font-mono font-semibold">{formatCurrency(hsfoCost)}</div>
            <div className="text-[10px] text-muted-foreground">{results.hsfoConsumption.toFixed(1)} MT × ${bunker.hsfo.price}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">VLSFO Cost</div>
            <div className="font-mono font-semibold">{formatCurrency(vlsfoCost)}</div>
            <div className="text-[10px] text-muted-foreground">{results.vlsfoConsumption.toFixed(1)} MT × ${bunker.vlsfo.price}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">LSMGO Cost</div>
            <div className="font-mono font-semibold">{formatCurrency(lsmgoCost)}</div>
            <div className="text-[10px] text-muted-foreground">{results.lsmgoConsumption.toFixed(1)} MT × ${bunker.lsmgo.price}</div>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Total Bunker Cost</div>
            <div className="font-mono font-semibold text-primary">{formatCurrency(results.totalBunkerCost)}</div>
          </div>
        </div>
      </div>
    </BreakdownCard>
  );
}
