import { Leaf } from "lucide-react";
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

interface EmissionCalculationPanelProps {
  results: VoyageResults;
  bunker: BunkerState;
  vessel: VesselData;
}

// CO2 emission factors (tonnes CO2 per tonne fuel)
const CO2_FACTORS = {
  hsfo: 3.114,
  vlsfo: 3.151,
  lsmgo: 3.206,
};

export function EmissionCalculationPanel({ results, bunker, vessel }: EmissionCalculationPanelProps) {
  // Calculate individual CO2 contributions
  const co2Hsfo = results.hsfoConsumption * CO2_FACTORS.hsfo;
  const co2Vlsfo = results.vlsfoConsumption * CO2_FACTORS.vlsfo;
  const co2Lsmgo = results.lsmgoConsumption * CO2_FACTORS.lsmgo;

  // CO2 cost
  const co2Cost = results.totalCo2 * bunker.co2Price;

  return (
    <BreakdownCard 
      title="Emission / Compliance" 
      icon={<Leaf className="h-5 w-5" />}
      badge={`CII: ${results.ciiRating}`}
    >
      <div className="grid grid-cols-2 gap-6">
        {/* Emission Factors */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">IMO Emission Factors</h3>
          
          <div className="space-y-2">
            <ValueRow label="HSFO Factor" value={`${CO2_FACTORS.hsfo} t CO₂/t fuel`} source="IMO" />
            <ValueRow label="VLSFO Factor" value={`${CO2_FACTORS.vlsfo} t CO₂/t fuel`} source="IMO" />
            <ValueRow label="LSMGO Factor" value={`${CO2_FACTORS.lsmgo} t CO₂/t fuel`} source="IMO" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">CO₂ by Fuel Type</div>
            <ValueRow label="HSFO CO₂" value={`${co2Hsfo.toFixed(2)} t`} source="Calculated" />
            <ValueRow label="VLSFO CO₂" value={`${co2Vlsfo.toFixed(2)} t`} source="Calculated" />
            <ValueRow label="LSMGO CO₂" value={`${co2Lsmgo.toFixed(2)} t`} source="Calculated" />
            <ValueRow label="Total CO₂" value={`${results.totalCo2.toFixed(2)} t`} isTotal />
          </div>
        </div>

        {/* CII / EEOI Calculations */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Efficiency Metrics</h3>
          
          <FormulaBlock
            name="EFOI (gCO₂/tnm)"
            formula="Total CO₂ × 1,000,000 / (Cargo Qty × Laden Distance)"
            inputs={[
              { label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t`, source: "Calculated" },
              { label: "Cargo Qty", value: "MT", source: "Cargo" },
              { label: "Laden Distance", value: "nm", source: "Sequence" },
            ]}
            result={{ label: "EFOI", value: `${results.efoi.toFixed(2)} gCO₂/tnm` }}
          />

          <FormulaBlock
            name="AFR/CII (gCO₂/dwt-nm)"
            formula="Total CO₂ × 1,000,000 / (DWT × Total Distance)"
            inputs={[
              { label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t`, source: "Calculated" },
              { label: "DWT", value: `${vessel.dwt.toLocaleString()} t`, source: "Vessel" },
              { label: "Total Distance", value: `${results.totalDistance.toLocaleString()} nm`, source: "Sequence" },
            ]}
            result={{ label: "AFR/CII", value: `${results.afrCii.toFixed(2)} gCO₂/dwt-nm` }}
          />
        </div>
      </div>

      {/* CII Rating Scale */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">CII Rating Scale</h3>
        <div className="space-y-2">
          <div className="h-8 rounded-full overflow-hidden flex">
            <div className="bg-green-600 flex-1 flex items-center justify-center text-white text-xs font-medium">A</div>
            <div className="bg-green-500 flex-1 flex items-center justify-center text-white text-xs font-medium">B</div>
            <div className="bg-yellow-500 flex-1 flex items-center justify-center text-white text-xs font-medium">C</div>
            <div className="bg-orange-500 flex-1 flex items-center justify-center text-white text-xs font-medium">D</div>
            <div className="bg-red-500 flex-1 flex items-center justify-center text-white text-xs font-medium">E</div>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>≤5.5</span>
            <span>5.5-6.5</span>
            <span>6.5-7.5</span>
            <span>7.5-8.5</span>
            <span>&gt;8.5</span>
          </div>
          <div className="text-center mt-2">
            <span className="text-sm text-muted-foreground">Current Rating: </span>
            <span className={`inline-block px-3 py-1 rounded-full font-bold text-white ${
              results.ciiRating === "A" ? "bg-green-600" :
              results.ciiRating === "B" ? "bg-green-500" :
              results.ciiRating === "C" ? "bg-yellow-500" :
              results.ciiRating === "D" ? "bg-orange-500" :
              "bg-red-500"
            }`}>
              {results.ciiRating}
            </span>
            <span className="ml-2 text-sm">({results.afrCii.toFixed(2)} gCO₂/dwt-nm)</span>
          </div>
        </div>
      </div>

      {/* EU ETS Tracking */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">EU ETS Fuel Allocation</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">HSFO (EU ETS)</div>
            <div className="font-mono font-semibold">{bunker.euEtsHsfo.toFixed(2)} MT</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">VLSFO (EU ETS)</div>
            <div className="font-mono font-semibold">{bunker.euEtsVlsfo.toFixed(2)} MT</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">LSMGO (EU ETS)</div>
            <div className="font-mono font-semibold">{bunker.euEtsLsmgo.toFixed(2)} MT</div>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">CO₂ Cost</div>
            <div className="font-mono font-semibold text-primary">
              ${co2Cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-muted-foreground">{results.totalCo2.toFixed(1)} t × ${bunker.co2Price}/t</div>
          </div>
        </div>
      </div>

      {/* CO2 Distribution */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">CO₂ Distribution (Laden vs Ballast)</h3>
        <div className="h-8 rounded-full overflow-hidden flex bg-muted">
          {results.co2Laden > 0 && (
            <div 
              className="bg-green-500/70 h-full flex items-center justify-center text-[10px] text-white font-medium"
              style={{ width: `${(results.co2Laden / results.totalCo2) * 100}%` }}
            >
              Laden: {results.co2Laden.toFixed(1)} t
            </div>
          )}
          {results.co2Ballast > 0 && (
            <div 
              className="bg-blue-500/70 h-full flex items-center justify-center text-[10px] text-white font-medium"
              style={{ width: `${(results.co2Ballast / results.totalCo2) * 100}%` }}
            >
              Ballast: {results.co2Ballast.toFixed(1)} t
            </div>
          )}
        </div>
      </div>
    </BreakdownCard>
  );
}
