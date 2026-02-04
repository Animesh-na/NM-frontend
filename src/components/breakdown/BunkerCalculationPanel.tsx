import { Fuel } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import type { VesselData } from "@/data/vessels";
import type { SequenceRowUI } from "@/context/VoyageContext";

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
  sequence: SequenceRowUI[];
}

export function BunkerCalculationPanel({ bunker, results, vessel, sequence }: BunkerCalculationPanelProps) {
  const formatCurrency = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatMT = (value: number) => `${value.toFixed(2)} MT`;
  const formatDays = (value: number) => `${value.toFixed(2)} d`;
  
  const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
  const rewardFactor = bunker.rewardFactor || 1.0;

  // ============================================
  // DETAILED CONSUMPTION CALCULATIONS (for validation)
  // ============================================
  
  // Calculate operation-specific time from sequence
  let loadingDays = 0;
  let dischargingDays = 0;
  let idleDays = 0;
  let bunkeringDays = 0;
  let canalDays = 0;
  let isLaden = false;
  let ballastDistance = 0;
  let ladenDistance = 0;

  sequence.forEach((leg) => {
    const operation = leg.operation?.toLowerCase() || "";
    const portDays = leg.calculatedPortDays || 0;
    
    if (operation === "load" || operation === "loading") {
      loadingDays += portDays;
      isLaden = true;
    } else if (operation === "disch" || operation === "discharging") {
      dischargingDays += portDays;
      isLaden = false;
    } else if (operation === "waiting" || operation === "idle") {
      idleDays += portDays;
    } else if (operation === "bunkering") {
      bunkeringDays += portDays;
    }

    if (isLaden) {
      ladenDistance += leg.distance || 0;
    } else {
      ballastDistance += leg.distance || 0;
    }
  });

  const idleAndBunkeringDays = idleDays + bunkeringDays + results.extraPortDays;
  const totalCanalDays = canalDays + results.extraCanalDays;

  // ============================================
  // HSFO CONSUMPTION BREAKDOWN
  // ============================================
  const hsfoSeaBallast = results.seaDaysBallast * (profile.hsfo.ballast || 0);
  const hsfoSeaLaden = results.seaDaysLaden * (profile.hsfo.laden || 0);
  const hsfoSeaExtra = results.extraSeaDays * (profile.hsfo.laden || 0);
  const hsfoSeaTotal = (hsfoSeaBallast + hsfoSeaLaden + hsfoSeaExtra) * rewardFactor;
  const hsfoLoading = loadingDays * (profile.hsfo.load || 0);
  const hsfoDischarging = dischargingDays * (profile.hsfo.discharge || 0);
  const hsfoIdle = idleAndBunkeringDays * (profile.hsfo.idle || 0);
  const hsfoCanal = totalCanalDays * (profile.hsfo.canal || 0);
  const hsfoPortTotal = hsfoLoading + hsfoDischarging + hsfoIdle + hsfoCanal;

  // ============================================
  // VLSFO CONSUMPTION BREAKDOWN
  // ============================================
  const vlsfoSeaBallast = results.seaDaysBallast * (profile.vlsfo.ballast || 0);
  const vlsfoSeaLaden = results.seaDaysLaden * (profile.vlsfo.laden || 0);
  const vlsfoSeaExtra = results.extraSeaDays * (profile.vlsfo.laden || 0);
  const vlsfoSeaTotal = (vlsfoSeaBallast + vlsfoSeaLaden + vlsfoSeaExtra) * rewardFactor;
  const vlsfoLoading = loadingDays * (profile.vlsfo.load || 0);
  const vlsfoDischarging = dischargingDays * (profile.vlsfo.discharge || 0);
  const vlsfoIdle = idleAndBunkeringDays * (profile.vlsfo.idle || 0);
  const vlsfoCanal = totalCanalDays * (profile.vlsfo.canal || 0);
  const vlsfoPortTotal = vlsfoLoading + vlsfoDischarging + vlsfoIdle + vlsfoCanal;

  // ============================================
  // LSMGO CONSUMPTION BREAKDOWN
  // ============================================
  const lsmgoSeaBallast = results.seaDaysBallast * (profile.lsmgo.ballast || 0);
  const lsmgoSeaLaden = results.seaDaysLaden * (profile.lsmgo.laden || 0);
  const lsmgoSeaExtra = results.extraSeaDays * (profile.lsmgo.laden || 0);
  const lsmgoSeaTotal = (lsmgoSeaBallast + lsmgoSeaLaden + lsmgoSeaExtra) * rewardFactor;
  const lsmgoLoading = loadingDays * (profile.lsmgo.load || profile.ae.load || 0);
  const lsmgoDischarging = dischargingDays * (profile.lsmgo.discharge || profile.ae.discharge || 0);
  const lsmgoIdle = idleAndBunkeringDays * (profile.lsmgo.idle || profile.ae.idle || 0);
  const lsmgoCanal = totalCanalDays * (profile.lsmgo.canal || profile.ae.canal || 0);
  
  // AE Consumption (added to LSMGO)
  const aeLoading = loadingDays * (profile.ae.load || 0);
  const aeDischarging = dischargingDays * (profile.ae.discharge || 0);
  const aeIdle = idleAndBunkeringDays * (profile.ae.idle || 0);
  const aeCanal = totalCanalDays * (profile.ae.canal || 0);
  const aeTotal = aeLoading + aeDischarging + aeIdle + aeCanal;
  
  const lsmgoPortTotal = lsmgoLoading + lsmgoDischarging + lsmgoIdle + lsmgoCanal;

  // ============================================
  // FUEL COSTS
  // ============================================
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

      {/* Time Breakdown by Operation */}
      <div className="mb-6">
        <h3 className="text-sm font-medium border-b border-border pb-2 mb-3">Time Breakdown (From Sequence)</h3>
        <div className="grid grid-cols-6 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Sea Ballast</div>
            <div className="font-mono font-semibold text-sm">{formatDays(results.seaDaysBallast)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Sea Laden</div>
            <div className="font-mono font-semibold text-sm">{formatDays(results.seaDaysLaden)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Loading</div>
            <div className="font-mono font-semibold text-sm">{formatDays(loadingDays)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Discharging</div>
            <div className="font-mono font-semibold text-sm">{formatDays(dischargingDays)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Idle/Bunkering</div>
            <div className="font-mono font-semibold text-sm">{formatDays(idleAndBunkeringDays)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Canal</div>
            <div className="font-mono font-semibold text-sm">{formatDays(totalCanalDays)}</div>
          </div>
        </div>
      </div>

      {/* DETAILED CONSUMPTION BY FUEL TYPE */}
      <div className="space-y-6">
        {/* HSFO Detailed Calculation */}
        <div className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            HSFO Consumption Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-1.5 px-2 font-medium">Operation</th>
                  <th className="text-right py-1.5 px-2 font-medium">Time (d)</th>
                  <th className="text-center py-1.5 px-2 font-medium">×</th>
                  <th className="text-right py-1.5 px-2 font-medium">Rate (MT/d)</th>
                  <th className="text-center py-1.5 px-2 font-medium">×</th>
                  <th className="text-right py-1.5 px-2 font-medium">Factor</th>
                  <th className="text-center py-1.5 px-2 font-medium">=</th>
                  <th className="text-right py-1.5 px-2 font-medium">Consumption (MT)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-1.5 px-2">Sea Ballast</td>
                  <td className="text-right font-mono">{results.seaDaysBallast.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.hsfo.ballast || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{rewardFactor.toFixed(2)}</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-primary">{(hsfoSeaBallast * rewardFactor).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1.5 px-2">Sea Laden</td>
                  <td className="text-right font-mono">{results.seaDaysLaden.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.hsfo.laden || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{rewardFactor.toFixed(2)}</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-primary">{(hsfoSeaLaden * rewardFactor).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Loading</td>
                  <td className="text-right font-mono">{loadingDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.hsfo.load || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{hsfoLoading.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Discharging</td>
                  <td className="text-right font-mono">{dischargingDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.hsfo.discharge || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{hsfoDischarging.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Idle/Bunkering</td>
                  <td className="text-right font-mono">{idleAndBunkeringDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.hsfo.idle || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{hsfoIdle.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Canal</td>
                  <td className="text-right font-mono">{totalCanalDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.hsfo.canal || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{hsfoCanal.toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-amber-500/10 font-semibold">
                  <td colSpan={7} className="py-1.5 px-2 text-right">HSFO Total:</td>
                  <td className="text-right font-mono text-amber-600">{formatMT(results.hsfoConsumption)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* VLSFO Detailed Calculation */}
        <div className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            VLSFO Consumption Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-1.5 px-2 font-medium">Operation</th>
                  <th className="text-right py-1.5 px-2 font-medium">Time (d)</th>
                  <th className="text-center py-1.5 px-2 font-medium">×</th>
                  <th className="text-right py-1.5 px-2 font-medium">Rate (MT/d)</th>
                  <th className="text-center py-1.5 px-2 font-medium">×</th>
                  <th className="text-right py-1.5 px-2 font-medium">Factor</th>
                  <th className="text-center py-1.5 px-2 font-medium">=</th>
                  <th className="text-right py-1.5 px-2 font-medium">Consumption (MT)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-1.5 px-2">Sea Ballast</td>
                  <td className="text-right font-mono">{results.seaDaysBallast.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.vlsfo.ballast || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{rewardFactor.toFixed(2)}</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-primary">{(vlsfoSeaBallast * rewardFactor).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1.5 px-2">Sea Laden</td>
                  <td className="text-right font-mono">{results.seaDaysLaden.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.vlsfo.laden || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{rewardFactor.toFixed(2)}</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-primary">{(vlsfoSeaLaden * rewardFactor).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Loading</td>
                  <td className="text-right font-mono">{loadingDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.vlsfo.load || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{vlsfoLoading.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Discharging</td>
                  <td className="text-right font-mono">{dischargingDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.vlsfo.discharge || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{vlsfoDischarging.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Idle/Bunkering</td>
                  <td className="text-right font-mono">{idleAndBunkeringDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.vlsfo.idle || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{vlsfoIdle.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Canal</td>
                  <td className="text-right font-mono">{totalCanalDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.vlsfo.canal || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{vlsfoCanal.toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-blue-500/10 font-semibold">
                  <td colSpan={7} className="py-1.5 px-2 text-right">VLSFO Total:</td>
                  <td className="text-right font-mono text-blue-600">{formatMT(results.vlsfoConsumption)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* LSMGO Detailed Calculation (with AE breakdown) */}
        <div className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            LSMGO Consumption Breakdown (includes AE)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-1.5 px-2 font-medium">Operation</th>
                  <th className="text-right py-1.5 px-2 font-medium">Time (d)</th>
                  <th className="text-center py-1.5 px-2 font-medium">×</th>
                  <th className="text-right py-1.5 px-2 font-medium">Rate (MT/d)</th>
                  <th className="text-center py-1.5 px-2 font-medium">×</th>
                  <th className="text-right py-1.5 px-2 font-medium">Factor</th>
                  <th className="text-center py-1.5 px-2 font-medium">=</th>
                  <th className="text-right py-1.5 px-2 font-medium">Consumption (MT)</th>
                </tr>
              </thead>
              <tbody>
                {/* Sea Consumption */}
                <tr className="border-b border-border/50">
                  <td className="py-1.5 px-2">Sea Ballast (LSMGO)</td>
                  <td className="text-right font-mono">{results.seaDaysBallast.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.lsmgo.ballast || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{rewardFactor.toFixed(2)}</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-primary">{(lsmgoSeaBallast * rewardFactor).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1.5 px-2">Sea Laden (LSMGO)</td>
                  <td className="text-right font-mono">{results.seaDaysLaden.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.lsmgo.laden || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{rewardFactor.toFixed(2)}</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-primary">{(lsmgoSeaLaden * rewardFactor).toFixed(2)}</td>
                </tr>
                
                {/* Port Consumption */}
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Loading (LSMGO)</td>
                  <td className="text-right font-mono">{loadingDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.lsmgo.load || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{(loadingDays * (profile.lsmgo.load || 0)).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-1.5 px-2">Discharging (LSMGO)</td>
                  <td className="text-right font-mono">{dischargingDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.lsmgo.discharge || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono">{(dischargingDays * (profile.lsmgo.discharge || 0)).toFixed(2)}</td>
                </tr>
                
                {/* AE Consumption Section */}
                <tr className="border-t-2 border-border">
                  <td colSpan={8} className="py-1.5 px-2 text-[10px] font-medium text-muted-foreground">+ AE (Auxiliary Engine) Consumption - Runs on MGO</td>
                </tr>
                <tr className="border-b border-border/50 bg-green-500/5">
                  <td className="py-1.5 px-2 pl-4">↳ Loading (AE)</td>
                  <td className="text-right font-mono">{loadingDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.ae.load || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-green-600">{aeLoading.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-green-500/5">
                  <td className="py-1.5 px-2 pl-4">↳ Discharging (AE)</td>
                  <td className="text-right font-mono">{dischargingDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.ae.discharge || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-green-600">{aeDischarging.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-green-500/5">
                  <td className="py-1.5 px-2 pl-4">↳ Idle/Bunkering (AE)</td>
                  <td className="text-right font-mono">{idleAndBunkeringDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.ae.idle || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-green-600">{aeIdle.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50 bg-green-500/5">
                  <td className="py-1.5 px-2 pl-4">↳ Canal (AE)</td>
                  <td className="text-right font-mono">{totalCanalDays.toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">{(profile.ae.canal || 0).toFixed(2)}</td>
                  <td className="text-center">×</td>
                  <td className="text-right font-mono">1.00</td>
                  <td className="text-center">=</td>
                  <td className="text-right font-mono text-green-600">{aeCanal.toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-green-500/5 border-t border-border">
                  <td colSpan={7} className="py-1 px-2 text-right text-[10px]">AE Subtotal:</td>
                  <td className="text-right font-mono text-green-600 text-[10px]">{formatMT(aeTotal)}</td>
                </tr>
                <tr className="bg-green-500/10 font-semibold">
                  <td colSpan={7} className="py-1.5 px-2 text-right">LSMGO Total (LSMGO + AE):</td>
                  <td className="text-right font-mono text-green-600">{formatMT(results.lsmgoConsumption)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Fuel Inventory Tracking Table */}
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
                <td className="text-right font-mono text-amber-600">{results.hsfoConsumption.toFixed(2)}</td>
                <td className="text-right font-mono">{(bunker.hsfo.robStart + totalBunkeredHsfo - results.hsfoConsumption).toFixed(2)}</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1">VLSFO</td>
                <td className="text-right font-mono">{bunker.vlsfo.robStart.toFixed(1)}</td>
                <td className="text-right font-mono">{totalBunkeredVlsfo.toFixed(1)}</td>
                <td className="text-right font-mono text-blue-600">{results.vlsfoConsumption.toFixed(2)}</td>
                <td className="text-right font-mono">{(bunker.vlsfo.robStart + totalBunkeredVlsfo - results.vlsfoConsumption).toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1">LSMGO</td>
                <td className="text-right font-mono">{bunker.lsmgo.robStart.toFixed(1)}</td>
                <td className="text-right font-mono">{totalBunkeredLsmgo.toFixed(1)}</td>
                <td className="text-right font-mono text-green-600">{results.lsmgoConsumption.toFixed(2)}</td>
                <td className="text-right font-mono">{(bunker.lsmgo.robStart + totalBunkeredLsmgo - results.lsmgoConsumption).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bunker Cost Calculation */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Bunker Cost (Consumption × Price)</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-amber-500/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">HSFO</div>
            <div className="font-mono font-semibold text-amber-600">{formatCurrency(hsfoCost)}</div>
            <div className="text-[10px] text-muted-foreground">{results.hsfoConsumption.toFixed(1)} MT × ${bunker.hsfo.price}</div>
          </div>
          <div className="bg-blue-500/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">VLSFO</div>
            <div className="font-mono font-semibold text-blue-600">{formatCurrency(vlsfoCost)}</div>
            <div className="text-[10px] text-muted-foreground">{results.vlsfoConsumption.toFixed(1)} MT × ${bunker.vlsfo.price}</div>
          </div>
          <div className="bg-green-500/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">LSMGO</div>
            <div className="font-mono font-semibold text-green-600">{formatCurrency(lsmgoCost)}</div>
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
