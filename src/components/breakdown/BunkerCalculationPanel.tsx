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
  const rewardFactor = bunker.rewardFactor || 1.0;

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
      {/* AXS Marine Model Explanation */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-6">
        <h4 className="text-sm font-medium text-primary mb-2">AXS Marine Bunker Calculation Model</h4>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Consumption:</strong> Vessel Daily Rate (MT/day) × Voyage Time (days) × Reward Factor</p>
          <p><strong>Cost:</strong> Total Consumption (MT) × Fuel Price ($/MT)</p>
          <p className="text-primary/80">Consumption is derived from Vessel Section rates, NOT manually entered in Bunker Section.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Vessel Daily Consumption Rates (Source) */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Vessel Daily Consumption Rates</h3>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">HSFO (MT/day)</div>
            <ValueRow label="Ballast Rate" value={`${profile.hsfo.ballast.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="Laden Rate" value={`${profile.hsfo.laden.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="Load Rate" value={`${profile.hsfo.load.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="Discharge Rate" value={`${profile.hsfo.discharge.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="Idle Rate" value={`${profile.hsfo.idle.toFixed(2)} MT/d`} source="Vessel" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">VLSFO (MT/day)</div>
            <ValueRow label="Ballast Rate" value={`${profile.vlsfo.ballast.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="Laden Rate" value={`${profile.vlsfo.laden.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="Load Rate" value={`${profile.vlsfo.load.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="Discharge Rate" value={`${profile.vlsfo.discharge.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="Idle Rate" value={`${profile.vlsfo.idle.toFixed(2)} MT/d`} source="Vessel" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">LSMGO (MT/day)</div>
            <ValueRow label="Ballast Rate" value={`${profile.lsmgo.ballast.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="Laden Rate" value={`${profile.lsmgo.laden.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="AE Load" value={`${profile.ae.load.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="AE Discharge" value={`${profile.ae.discharge.toFixed(2)} MT/d`} source="Vessel" />
            <ValueRow label="AE Idle" value={`${profile.ae.idle.toFixed(2)} MT/d`} source="Vessel" />
          </div>
        </div>

        {/* Voyage Time (From Sequence) */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Voyage Time (From Sequence)</h3>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Sea Time</div>
            <ValueRow label="Ballast Days" value={`${results.seaDaysBallast.toFixed(2)} days`} source="Sequence" />
            <ValueRow label="Laden Days" value={`${results.seaDaysLaden.toFixed(2)} days`} source="Sequence" />
            <ValueRow label="Extra Sea Days" value={`${results.extraSeaDays.toFixed(2)} days`} source="Misc" />
            <ValueRow label="Total Sea Days" value={`${results.totalSeaDays.toFixed(2)} days`} source="Calculated" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Port/Canal Time</div>
            <ValueRow label="Port Days" value={`${results.totalPortDays.toFixed(2)} days`} source="Sequence" />
            <ValueRow label="Extra Port Days" value={`${results.extraPortDays.toFixed(2)} days`} source="Misc" />
            <ValueRow label="Extra Canal Days" value={`${results.extraCanalDays.toFixed(2)} days`} source="Misc" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Bunker Settings</div>
            <ValueRow label="Fuel Mode" value={bunker.fuelMode.toUpperCase()} source="Bunker" />
            <ValueRow label="Reward Factor" value={rewardFactor.toFixed(2)} source="Bunker" />
            <ValueRow label="Ignore BOB" value={bunker.ignoreBOB ? "Yes" : "No"} source="Bunker" />
          </div>
        </div>
      </div>

      {/* Consumption Calculation Formulas */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Consumption Calculation (Daily Rate × Days × Reward Factor)</h3>
        <div className="grid grid-cols-3 gap-4">
          <FormulaBlock
            name="HSFO Consumption"
            formula="(Ballast Days × Ballast Rate + Laden Days × Laden Rate) × Reward Factor"
            inputs={[
              { label: "Ballast Days", value: `${results.seaDaysBallast.toFixed(2)} d`, source: "Sequence" },
              { label: "Ballast Rate", value: `${profile.hsfo.ballast.toFixed(2)} MT/d`, source: "Vessel" },
              { label: "Laden Days", value: `${results.seaDaysLaden.toFixed(2)} d`, source: "Sequence" },
              { label: "Laden Rate", value: `${profile.hsfo.laden.toFixed(2)} MT/d`, source: "Vessel" },
              { label: "Reward Factor", value: rewardFactor.toFixed(2), source: "Bunker" },
            ]}
            result={{ label: "Total", value: `${results.hsfoConsumption.toFixed(2)} MT` }}
          />
          <FormulaBlock
            name="VLSFO Consumption"
            formula="(Ballast Days × Ballast Rate + Laden Days × Laden Rate) × Reward Factor"
            inputs={[
              { label: "Ballast Days", value: `${results.seaDaysBallast.toFixed(2)} d`, source: "Sequence" },
              { label: "Ballast Rate", value: `${profile.vlsfo.ballast.toFixed(2)} MT/d`, source: "Vessel" },
              { label: "Laden Days", value: `${results.seaDaysLaden.toFixed(2)} d`, source: "Sequence" },
              { label: "Laden Rate", value: `${profile.vlsfo.laden.toFixed(2)} MT/d`, source: "Vessel" },
              { label: "Reward Factor", value: rewardFactor.toFixed(2), source: "Bunker" },
            ]}
            result={{ label: "Total", value: `${results.vlsfoConsumption.toFixed(2)} MT` }}
          />
          <FormulaBlock
            name="LSMGO Consumption"
            formula="Sea Consumption + Port AE Consumption"
            inputs={[
              { label: "Port Days", value: `${results.totalPortDays.toFixed(2)} d`, source: "Sequence" },
              { label: "AE Rate", value: `${profile.ae.load.toFixed(2)} MT/d`, source: "Vessel" },
            ]}
            result={{ label: "Total", value: `${results.lsmgoConsumption.toFixed(2)} MT` }}
          />
        </div>
      </div>

      {/* Inventory Tracking Table */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Fuel Inventory Tracking</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 font-medium">Fuel</th>
                <th className="text-right py-1 font-medium">BOB (MT)</th>
                <th className="text-right py-1 font-medium">Bunkered (MT)</th>
                <th className="text-right py-1 font-medium">Consumed (MT)</th>
                <th className="text-right py-1 font-medium">ROB End (MT)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-1">HSFO</td>
                <td className="text-right font-mono">{bunker.hsfo.robStart.toFixed(1)}</td>
                <td className="text-right font-mono">{totalBunkeredHsfo.toFixed(1)}</td>
                <td className="text-right font-mono text-primary">{results.hsfoConsumption.toFixed(2)}</td>
                <td className="text-right font-mono">{(bunker.hsfo.robStart + totalBunkeredHsfo - results.hsfoConsumption).toFixed(2)}</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1">VLSFO</td>
                <td className="text-right font-mono">{bunker.vlsfo.robStart.toFixed(1)}</td>
                <td className="text-right font-mono">{totalBunkeredVlsfo.toFixed(1)}</td>
                <td className="text-right font-mono text-primary">{results.vlsfoConsumption.toFixed(2)}</td>
                <td className="text-right font-mono">{(bunker.vlsfo.robStart + totalBunkeredVlsfo - results.vlsfoConsumption).toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1">LSMGO</td>
                <td className="text-right font-mono">{bunker.lsmgo.robStart.toFixed(1)}</td>
                <td className="text-right font-mono">{totalBunkeredLsmgo.toFixed(1)}</td>
                <td className="text-right font-mono text-primary">{results.lsmgoConsumption.toFixed(2)}</td>
                <td className="text-right font-mono">{(bunker.lsmgo.robStart + totalBunkeredLsmgo - results.lsmgoConsumption).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bunker Cost Calculation */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Bunker Cost (Consumption × Price)</h3>
        <div className="grid grid-cols-2 gap-6 mb-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Fuel Prices (from Bunker Section)</div>
            <ValueRow label="HSFO Price" value={formatCurrency(bunker.hsfo.price) + "/MT"} source="Bunker" />
            <ValueRow label="VLSFO Price" value={formatCurrency(bunker.vlsfo.price) + "/MT"} source="Bunker" />
            <ValueRow label="LSMGO Price" value={formatCurrency(bunker.lsmgo.price) + "/MT"} source="Bunker" />
            <ValueRow label="CO₂ Price" value={formatCurrency(bunker.co2Price) + "/t"} source="Bunker" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Cost Calculation</div>
            <ValueRow 
              label="HSFO Cost" 
              value={formatCurrency(hsfoCost)} 
              source="Calculated" 
            />
            <ValueRow 
              label="VLSFO Cost" 
              value={formatCurrency(vlsfoCost)} 
              source="Calculated" 
            />
            <ValueRow 
              label="LSMGO Cost" 
              value={formatCurrency(lsmgoCost)} 
              source="Calculated" 
            />
          </div>
        </div>

        {/* Cost Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">HSFO</div>
            <div className="font-mono font-semibold">{formatCurrency(hsfoCost)}</div>
            <div className="text-[10px] text-muted-foreground">{results.hsfoConsumption.toFixed(1)} MT × ${bunker.hsfo.price}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">VLSFO</div>
            <div className="font-mono font-semibold">{formatCurrency(vlsfoCost)}</div>
            <div className="text-[10px] text-muted-foreground">{results.vlsfoConsumption.toFixed(1)} MT × ${bunker.vlsfo.price}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">LSMGO</div>
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
