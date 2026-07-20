import { useState } from "react";
import { AlertTriangle, Leaf, RefreshCw, Ship, Anchor, Navigation, Flag, Fuel } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import type { VesselData } from "@/data/vessels";
import { CO2_EMISSION_FACTORS, getEtsPhaseInPercentage } from "@/utils/emissionCalculations";
import { FUEL_EU_PROPERTIES } from "@/utils/fuelEuMaritime";

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
  euEtsPrice?: number;
  ukEtsPrice?: number;
}

interface SequenceRow {
  id: number;
  port: string;
  portUnloc: string;
  operation?: string;
  distance: number;
}

interface EmissionCalculationPanelProps {
  results: VoyageResults;
  bunker: BunkerState;
  vessel: VesselData;
  sequence?: SequenceRow[];
  onRefresh?: () => void;
}

export function EmissionCalculationPanel({ results, bunker, vessel, sequence = [], onRefresh }: EmissionCalculationPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const getCiiColor = (rating: string) => {
    switch (rating) {
      case 'A': return 'bg-green-600';
      case 'B': return 'bg-green-500';
      case 'C': return 'bg-yellow-500';
      case 'D': return 'bg-orange-500';
      case 'E': return 'bg-red-500';
      default: return 'bg-muted';
    }
  };

  const hasWarnings = results.emissionWarnings?.length > 0;
  const hasErrors = results.emissionErrors?.length > 0;
  const requiresAction = results.ciiRating === 'D' || results.ciiRating === 'E';

  const currentYear = new Date().getFullYear();
  const phaseInPercent = getEtsPhaseInPercentage(currentYear) * 100;
  const phaseInDecimal = phaseInPercent / 100;

  // Totals from leg details
  const legDetails = results.etsLegDetails || [];
  const totalChargeableVlsfo = legDetails.reduce((s, l) => s + l.chargeableVlsfo, 0);
  const totalChargeableLsmgo = legDetails.reduce((s, l) => s + l.chargeableLsmgo, 0);
  const totalChargeableHsfo = legDetails.reduce((s, l) => s + l.chargeableHsfo, 0);
  const totalChargeableCo2PrePhaseIn = legDetails.reduce((s, l) => s + l.chargeableCo2, 0);

  return (
    <BreakdownCard 
      title="CO₂ Emission & EU ETS Compliance" 
      icon={<Leaf className="h-5 w-5" />}
      badge={`CII: ${results.ciiRating}`}
    >
      {/* Validation Warnings/Errors */}
      {(hasErrors || hasWarnings || requiresAction) && (
        <div className="space-y-2 mb-4">
          {hasErrors && results.emissionErrors.map((error, i) => (
            <Alert key={i} variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ))}
          {hasWarnings && results.emissionWarnings.map((warning, i) => (
            <Alert key={i}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          ))}
          {requiresAction && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>CII Rating Alert</AlertTitle>
              <AlertDescription>
                Vessel CII rating is {results.ciiRating}. IMO requires corrective action plan within 3 years for D/E ratings.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-end mb-4">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Calculation
        </Button>
      </div>

      {/* Input Sources Panel */}
      <div className="bg-muted/30 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Ship className="h-4 w-4" />
          Input Sources (Live Data)
        </h3>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="space-y-1">
            <div className="font-medium text-muted-foreground">Vessel</div>
            <div>DWT: <span className="font-mono">{vessel.dwt.toLocaleString()} t</span></div>
            <div>Type: <span className="font-mono">{vessel.type || 'bulk_carrier'}</span></div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-muted-foreground">Voyage</div>
            <div>Distance: <span className="font-mono">{(results.totalDistance + results.totalEcaDistance).toLocaleString()} nm</span></div>
            <div>Laden Dist: <span className="font-mono">{results.ladenDistance?.toLocaleString() || 0} nm</span></div>
            <div>Sea Days: <span className="font-mono">{results.totalSeaDays.toFixed(2)} d</span></div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-muted-foreground">Time Breakdown</div>
            <div>Base Sea: <span className="font-mono">{results.baseSeaTime.toFixed(2)} d</span></div>
            <div>+ Sea Margin: <span className="font-mono text-amber-600">{results.seaMarginTime.toFixed(2)} d</span></div>
            <div>Port Days: <span className="font-mono">{results.totalPortDays.toFixed(2)} d</span></div>
          </div>
        </div>
      </div>

      {/* Step 1: Fuel → CO₂ */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Step 1: Total Voyage Fuel → CO₂</h3>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">IMO Emission Factors</div>
            <ValueRow label="HSFO Factor" value={`${CO2_EMISSION_FACTORS.hsfo} t CO₂/t`} source="IMO" />
            <ValueRow label="VLSFO Factor" value={`${CO2_EMISSION_FACTORS.vlsfo} t CO₂/t`} source="IMO" />
            <ValueRow label="LSMGO Factor" value={`${CO2_EMISSION_FACTORS.lsmgo} t CO₂/t`} source="IMO" />
          </div>

          <FormulaBlock
            name="Total Voyage Fuel Consumption"
            formula="Daily Rate × Time × Reward Factor"
            inputs={[
              { label: "HSFO", value: `${results.hsfoConsumption.toFixed(2)} MT`, source: "Calc" },
              { label: "VLSFO", value: `${results.vlsfoConsumption.toFixed(2)} MT`, source: "Calc" },
              { label: "LSMGO", value: `${results.lsmgoConsumption.toFixed(2)} MT`, source: "Calc" },
            ]}
          />

          <FormulaBlock
            name="Total Voyage CO₂"
            formula="Fuel × Emission Factor"
            inputs={[
              { label: "HSFO CO₂", value: `${results.co2ByFuel.hsfo.toFixed(2)} t`, source: "Calc" },
              { label: "VLSFO CO₂", value: `${results.co2ByFuel.vlsfo.toFixed(2)} t`, source: "Calc" },
              { label: "LSMGO CO₂", value: `${results.co2ByFuel.lsmgo.toFixed(2)} t`, source: "Calc" },
            ]}
            result={{ label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t` }}
          />
        </div>

        {/* Step 2: EU Chargeable Fuel Summary */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Step 2: EU Chargeable Fuel (Bottom-Up)</h3>
          
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="font-medium text-sm">EU ETS Allocation Rules</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>• EU → EU: <span className="font-mono font-medium">100%</span> of sea fuel chargeable</div>
              <div>• EU ↔ Non-EU: <span className="font-mono font-medium">50%</span> of sea fuel chargeable</div>
              <div>• Non-EU → Non-EU: <span className="font-mono font-medium">0%</span></div>
              <div>• Port at EU: <span className="font-mono font-medium">100%</span> of port fuel chargeable</div>
            </div>
          </div>

          <FormulaBlock
            name="EU Chargeable Fuel Totals"
            formula="Sum of per-leg chargeable fuel"
            inputs={[
              { label: "EU HSFO", value: `${totalChargeableHsfo.toFixed(2)} MT`, source: "Legs" },
              { label: "EU VLSFO", value: `${totalChargeableVlsfo.toFixed(2)} MT`, source: "Legs" },
              { label: "EU LSMGO", value: `${totalChargeableLsmgo.toFixed(2)} MT`, source: "Legs" },
            ]}
          />

          {/* Fuel comparison: Total vs EU */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Total Voyage vs EU Chargeable</div>
            {results.vlsfoConsumption > 0 && (
              <div className="flex justify-between text-xs">
                <span>VLSFO</span>
                <span className="font-mono">
                  {results.vlsfoConsumption.toFixed(2)} → <span className="text-primary font-medium">{totalChargeableVlsfo.toFixed(2)} MT</span>
                  {' '}({results.vlsfoConsumption > 0 ? ((totalChargeableVlsfo / results.vlsfoConsumption) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            )}
            {results.lsmgoConsumption > 0 && (
              <div className="flex justify-between text-xs">
                <span>LSMGO</span>
                <span className="font-mono">
                  {results.lsmgoConsumption.toFixed(2)} → <span className="text-primary font-medium">{totalChargeableLsmgo.toFixed(2)} MT</span>
                  {' '}({results.lsmgoConsumption > 0 ? ((totalChargeableLsmgo / results.lsmgoConsumption) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            )}
            {results.hsfoConsumption > 0 && (
              <div className="flex justify-between text-xs">
                <span>HSFO</span>
                <span className="font-mono">
                  {results.hsfoConsumption.toFixed(2)} → <span className="text-primary font-medium">{totalChargeableHsfo.toFixed(2)} MT</span>
                  {' '}({results.hsfoConsumption > 0 ? ((totalChargeableHsfo / results.hsfoConsumption) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leg-by-Leg ETS Breakdown Table */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Navigation className="h-4 w-4" />
          Step 3: Leg-by-Leg ETS Responsibility
        </h3>
        
        {legDetails.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Leg</TableHead>
                  <TableHead className="text-xs">Origin</TableHead>
                  <TableHead className="text-xs">Destination</TableHead>
                  <TableHead className="text-xs text-right">Sea Coverage</TableHead>
                  <TableHead className="text-xs text-right">Sea VLSFO</TableHead>
                  <TableHead className="text-xs text-right">Sea LSMGO</TableHead>
                  <TableHead className="text-xs text-right">Port Fuel</TableHead>
                  <TableHead className="text-xs text-right">EU VLSFO</TableHead>
                  <TableHead className="text-xs text-right">EU LSMGO</TableHead>
                  <TableHead className="text-xs text-right">EU CO₂</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legDetails.map((leg) => (
                  <TableRow key={leg.legIndex}>
                    <TableCell className="font-mono text-xs py-2">Leg {leg.legIndex + 1}</TableCell>
                    <TableCell className="text-xs py-2">
                      <span className={leg.originIsEu ? 'text-blue-500 font-medium' : 'text-muted-foreground'}>
                        {leg.originPort?.substring(0, 12) || leg.originUnloc}
                      </span>
                      {leg.originIsEu && <span className="ml-1 text-[10px] bg-blue-500/10 text-blue-500 px-1 rounded">EU</span>}
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      <span className={leg.destIsEu ? 'text-blue-500 font-medium' : 'text-muted-foreground'}>
                        {leg.destPort?.substring(0, 12) || leg.destUnloc}
                      </span>
                      {leg.destIsEu && <span className="ml-1 text-[10px] bg-blue-500/10 text-blue-500 px-1 rounded">EU</span>}
                    </TableCell>
                    <TableCell className="text-xs text-right py-2">
                      <span className={`font-mono font-medium ${leg.coveragePct === 100 ? 'text-green-600' : leg.coveragePct === 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {leg.coveragePct}%
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">{(leg.seaVlsfo + leg.seaHsfo).toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">{leg.seaLsmgo.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">
                      {(leg.portVlsfo + leg.portHsfo + leg.portLsmgo).toFixed(2)}
                      {leg.destIsEu && <span className="ml-1 text-[10px] text-blue-500">EU</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right py-2 text-primary font-medium">{(leg.chargeableVlsfo + leg.chargeableHsfo).toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2 text-primary font-medium">{leg.chargeableLsmgo.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2 font-medium">{leg.chargeableCo2.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="border-t-2 border-border font-semibold">
                  <TableCell className="text-xs py-2" colSpan={4}>TOTAL</TableCell>
                  <TableCell className="font-mono text-xs text-right py-2">
                    {legDetails.reduce((s, l) => s + l.seaVlsfo + l.seaHsfo, 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right py-2">
                    {legDetails.reduce((s, l) => s + l.seaLsmgo, 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right py-2">
                    {legDetails.reduce((s, l) => s + l.portVlsfo + l.portHsfo + l.portLsmgo, 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right py-2 text-primary">
                    {(totalChargeableVlsfo + totalChargeableHsfo).toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right py-2 text-primary">
                    {totalChargeableLsmgo.toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right py-2 font-bold">
                    {totalChargeableCo2PrePhaseIn.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-4 text-center">
            No voyage legs defined — add ports to the sequence to see leg-by-leg ETS breakdown.
          </div>
        )}
      </div>

      {/* Step 4: Phase-in & Final EUA Calculation */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Step 4: Phase-In & Final EUA Liability</h3>
        <div className="grid grid-cols-2 gap-6">
          <FormulaBlock
            name={`Chargeable CO₂ EUA (${currentYear})`}
            formula="(EU HSFO×3.114 + EU VLSFO×3.151 + EU LSMGO×3.206) × Phase-In%"
            inputs={[
              { label: "EU CO₂ (pre phase-in)", value: `${totalChargeableCo2PrePhaseIn.toFixed(2)} t`, source: "Legs" },
              { label: `Phase-In (${currentYear})`, value: `${phaseInPercent}%`, source: "IMO" },
            ]}
            result={{ label: "Final EUA Liability", value: `${results.chargeableCo2.toFixed(2)} t CO₂` }}
          />

          <FormulaBlock
            name="EU ETS Cost"
            formula="Final EUA Liability × Carbon Price"
            inputs={[
              { label: "EUA Liability", value: `${results.chargeableCo2.toFixed(2)} t`, source: "Calc" },
              { label: "Carbon Price", value: `€${bunker.co2Price}/t`, source: "Bunker" },
            ]}
            result={{ label: "Total ETS Cost", value: `€${results.etsCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }}
          />
        </div>
      </div>

      {/* CII Rating Section */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Anchor className="h-4 w-4" />
          Step 5: CII Efficiency Rating
        </h3>
        
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <FormulaBlock
              name="Actual CII (Attained)"
              formula="Total CO₂ × 10⁶ / (DWT × Distance)"
              inputs={[
                { label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t`, source: "Calc" },
                { label: "DWT", value: `${vessel.dwt.toLocaleString()} t`, source: "Vessel" },
                { label: "Distance", value: `${(results.totalDistance + results.totalEcaDistance).toLocaleString()} nm`, source: "Seq" },
              ]}
              result={{ label: "Actual CII", value: `${results.afrCii.toFixed(2)} gCO₂/dwt-nm` }}
            />
            
            <FormulaBlock
              name="Required CII (Reference)"
              formula="a × DWT^(-c) × (1 - reduction)"
              inputs={[
                { label: "Ship Type", value: vessel.type || 'bulk_carrier', source: "Vessel" },
                { label: "Required CII", value: `${results.ciiResult.requiredCii.toFixed(2)} gCO₂/dwt-nm`, source: "IMO" },
                { label: "CII Ratio", value: `${(results.ciiResult.ciiRatio * 100).toFixed(1)}%`, source: "Calc" },
              ]}
            />
          </div>

          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">CII Rating Boundaries</div>
              <div className="h-8 rounded-full overflow-hidden flex mb-2">
                <div className="bg-green-600 flex-1 flex items-center justify-center text-white text-xs font-medium">A</div>
                <div className="bg-green-500 flex-1 flex items-center justify-center text-white text-xs font-medium">B</div>
                <div className="bg-yellow-500 flex-1 flex items-center justify-center text-white text-xs font-medium">C</div>
                <div className="bg-orange-500 flex-1 flex items-center justify-center text-white text-xs font-medium">D</div>
                <div className="bg-red-500 flex-1 flex items-center justify-center text-white text-xs font-medium">E</div>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>≤{results.ciiResult.boundaries.A.toFixed(1)}</span>
                <span>≤{results.ciiResult.boundaries.B.toFixed(1)}</span>
                <span>≤{results.ciiResult.boundaries.C.toFixed(1)}</span>
                <span>≤{results.ciiResult.boundaries.D.toFixed(1)}</span>
                <span>&gt;{results.ciiResult.boundaries.D.toFixed(1)}</span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <div className="text-xs text-muted-foreground mb-2">Current Rating</div>
              <div className={`inline-block px-6 py-2 rounded-full font-bold text-lg text-white ${getCiiColor(results.ciiRating)}`}>
                {results.ciiRating}
              </div>
              <div className="mt-2 text-sm">{results.ciiResult.ratingDescription}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {results.afrCii.toFixed(2)} gCO₂/dwt-nm (Ratio: {(results.ciiResult.ciiRatio * 100).toFixed(1)}%)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EFOI Section */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Energy Efficiency Metrics</h3>
        <div className="grid grid-cols-2 gap-6">
          <FormulaBlock
            name="EFOI (gCO₂/tnm)"
            formula="Total CO₂ × 10⁶ / (Cargo × Laden Distance)"
            inputs={[
              { label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t`, source: "Calc" },
              { label: "Cargo", value: `${results.ladenDistance > 0 ? 'Available' : 'N/A'}`, source: "Cargo" },
              { label: "Laden Distance", value: `${results.ladenDistance?.toLocaleString() || 0} nm`, source: "Seq" },
            ]}
            result={{ label: "EFOI", value: `${results.efoi.toFixed(2)} gCO₂/tnm` }}
          />

          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="font-medium text-sm">CO₂ Distribution</div>
            <div className="h-6 rounded-full overflow-hidden flex bg-muted">
              {results.co2Laden > 0 && (
                <div 
                  className="bg-primary/70 h-full flex items-center justify-center text-[10px] text-white font-medium"
                  style={{ width: `${(results.co2Laden / results.totalCo2) * 100}%` }}
                >
                  Laden: {results.co2Laden.toFixed(1)}t
                </div>
              )}
              {results.co2Ballast > 0 && (
                <div 
                  className="bg-blue-500/70 h-full flex items-center justify-center text-[10px] text-white font-medium"
                  style={{ width: `${(results.co2Ballast / results.totalCo2) * 100}%` }}
                >
                  Ballast: {results.co2Ballast.toFixed(1)}t
                </div>
              )}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Laden: {((results.co2Laden / (results.totalCo2 || 1)) * 100).toFixed(0)}%</span>
              <span>Ballast: {((results.co2Ballast / (results.totalCo2 || 1)) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Result Summary */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Summary Results</h3>
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Total CO₂</div>
            <div className="font-mono font-semibold text-lg">{results.totalCo2.toFixed(1)} t</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Chargeable CO₂ EUA</div>
            <div className="font-mono font-semibold text-lg">{results.chargeableCo2.toFixed(1)} t</div>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">ETS Cost</div>
            <div className="font-mono font-semibold text-lg text-primary">€{results.etsCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Actual CII</div>
            <div className="font-mono font-semibold text-lg">{results.afrCii.toFixed(2)}</div>
          </div>
          <div className={`rounded-lg p-3 text-center ${getCiiColor(results.ciiRating)}`}>
            <div className="text-xs text-white/80">CII Rating</div>
            <div className="font-bold text-2xl text-white">{results.ciiRating}</div>
          </div>
        </div>
      </div>
    </BreakdownCard>
  );
}
