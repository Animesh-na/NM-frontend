import { useState } from "react";
import { AlertTriangle, Leaf, RefreshCw, Ship, Anchor, Navigation } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import type { VesselData } from "@/data/vessels";
import { CO2_EMISSION_FACTORS, isEuPort, getEtsPhaseInPercentage } from "@/utils/emissionCalculations";

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

  // Get CII rating color
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

  // Check for warnings
  const hasWarnings = results.emissionWarnings?.length > 0;
  const hasErrors = results.emissionErrors?.length > 0;
  const requiresAction = results.ciiRating === 'D' || results.ciiRating === 'E';

  // Build voyage legs info for display
  const voyageLegs = sequence.reduce((legs, row, idx) => {
    if (idx > 0 && row.portUnloc) {
      const prevPort = sequence[idx - 1]?.portUnloc || '';
      legs.push({
        origin: sequence[idx - 1]?.port || prevPort,
        originUnloc: prevPort,
        destination: row.port || row.portUnloc,
        destinationUnloc: row.portUnloc,
        isOriginEu: isEuPort(prevPort),
        isDestEu: isEuPort(row.portUnloc),
      });
    }
    return legs;
  }, [] as Array<{ origin: string; originUnloc: string; destination: string; destinationUnloc: string; isOriginEu: boolean; isDestEu: boolean }>);

  const currentYear = new Date().getFullYear();
  const phaseInPercent = getEtsPhaseInPercentage(currentYear) * 100;

  return (
    <BreakdownCard 
      title="CO₂ Emission & Compliance" 
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
            <div>Distance: <span className="font-mono">{results.totalDistance.toLocaleString()} nm</span></div>
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

      {/* Calculation Flow Panel */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column: CO2 Calculation */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Step 1: Fuel → CO₂</h3>
          
          {/* Emission Factors */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">IMO Emission Factors</div>
            <ValueRow label="HSFO Factor" value={`${CO2_EMISSION_FACTORS.hsfo} t CO₂/t`} source="IMO" />
            <ValueRow label="VLSFO Factor" value={`${CO2_EMISSION_FACTORS.vlsfo} t CO₂/t`} source="IMO" />
            <ValueRow label="LSMGO Factor" value={`${CO2_EMISSION_FACTORS.lsmgo} t CO₂/t`} source="IMO" />
          </div>

          {/* Fuel Consumption */}
          <FormulaBlock
            name="Fuel Consumption (from voyage)"
            formula="Daily Rate × Time × Reward Factor"
            inputs={[
              { label: "HSFO", value: `${results.hsfoConsumption.toFixed(2)} MT`, source: "Calc" },
              { label: "VLSFO", value: `${results.vlsfoConsumption.toFixed(2)} MT`, source: "Calc" },
              { label: "LSMGO", value: `${results.lsmgoConsumption.toFixed(2)} MT`, source: "Calc" },
            ]}
          />

          {/* CO2 by Fuel */}
          <FormulaBlock
            name="CO₂ Emissions"
            formula="Fuel × Emission Factor"
            inputs={[
              { label: "HSFO CO₂", value: `${results.co2ByFuel.hsfo.toFixed(2)} t`, source: "Calc" },
              { label: "VLSFO CO₂", value: `${results.co2ByFuel.vlsfo.toFixed(2)} t`, source: "Calc" },
              { label: "LSMGO CO₂", value: `${results.co2ByFuel.lsmgo.toFixed(2)} t`, source: "Calc" },
            ]}
            result={{ label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t` }}
          />
        </div>

        {/* Right Column: ETS & CII */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Step 2: EU ETS Cost</h3>
          
          {/* ETS Coverage */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="font-medium text-sm">EU ETS Voyage Coverage</div>
            <div className="text-xs text-muted-foreground mb-2">
              EU-EU: 100% | EU-NonEU: 50% | NonEU-EU: 50% | NonEU-NonEU: 0%
            </div>
            
            {voyageLegs.length > 0 ? (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {voyageLegs.map((leg, i) => {
                  let coverage = 0;
                  if (leg.isOriginEu && leg.isDestEu) coverage = 100;
                  else if (leg.isOriginEu || leg.isDestEu) coverage = 50;
                  
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1">
                        <span className={leg.isOriginEu ? 'text-blue-500' : 'text-muted-foreground'}>
                          {leg.origin.substring(0, 10)}
                        </span>
                        <Navigation className="h-3 w-3" />
                        <span className={leg.isDestEu ? 'text-blue-500' : 'text-muted-foreground'}>
                          {leg.destination.substring(0, 10)}
                        </span>
                      </div>
                      <span className="font-mono">{coverage}%</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No voyage legs defined</div>
            )}
            
            <div className="pt-2 border-t border-border text-xs">
              <div className="flex justify-between">
                <span>Weighted Coverage</span>
                <span className="font-mono">{(results.etsVoyageCoverage * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Phase-in */}
          <FormulaBlock
            name="ETS Phase-In ({currentYear})"
            formula="Chargeable CO₂ = Total × Coverage × Phase-In"
            inputs={[
              { label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t`, source: "Calc" },
              { label: "Voyage Coverage", value: `${(results.etsVoyageCoverage * 100).toFixed(0)}%`, source: "Route" },
              { label: `Phase-In (${currentYear})`, value: `${phaseInPercent}%`, source: "IMO" },
            ]}
            result={{ label: "Chargeable CO₂", value: `${results.chargeableCo2.toFixed(2)} t` }}
          />

          {/* ETS Cost */}
          <FormulaBlock
            name="EU ETS Cost"
            formula="Chargeable CO₂ × CO₂ Price"
            inputs={[
              { label: "Chargeable CO₂", value: `${results.chargeableCo2.toFixed(2)} t`, source: "Calc" },
              { label: "CO₂ Price", value: `€${bunker.co2Price}/t`, source: "Bunker" },
            ]}
            result={{ label: "ETS Cost", value: `€${results.etsCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }}
          />
        </div>
      </div>

      {/* CII Rating Section */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Anchor className="h-4 w-4" />
          Step 3: CII Efficiency Rating
        </h3>
        
        <div className="grid grid-cols-2 gap-6">
          {/* CII Calculation */}
          <div className="space-y-4">
            <FormulaBlock
              name="Actual CII (Attained)"
              formula="Total CO₂ × 10⁶ / (DWT × Distance)"
              inputs={[
                { label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t`, source: "Calc" },
                { label: "DWT", value: `${vessel.dwt.toLocaleString()} t`, source: "Vessel" },
                { label: "Distance", value: `${results.totalDistance.toLocaleString()} nm`, source: "Seq" },
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

          {/* CII Rating Display */}
          <div className="space-y-4">
            {/* Rating Scale */}
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

            {/* Current Rating */}
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

          {/* CO2 Distribution */}
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
            <div className="text-xs text-muted-foreground">Chargeable CO₂</div>
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
