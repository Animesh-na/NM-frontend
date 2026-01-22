import { DollarSign, Clock, TrendingUp, Leaf } from "lucide-react";
import { useVoyageContext } from "@/context/VoyageContext";

export function VoyageSummary() {
  const { results, cargo, hireRate } = useVoyageContext();

  const formatCurrency = (value: number) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDays = (value: number) => {
    return value.toFixed(2);
  };

  return (
    <div className="calc-card h-full">
      <div className="section-header">
        <TrendingUp className="h-4 w-4" />
        <span>Voyage Summary</span>
      </div>

      <div className="p-3 space-y-4 text-xs">
        {/* Financial Summary */}
        <div className="space-y-1">
          <div className="flex justify-between items-center border-b border-border pb-1">
            <span className="font-medium">Voyage - Total Incl Hire :</span>
            <span className="font-mono tabular-nums font-semibold text-primary">
              ${formatCurrency(results.voyageCostInclHire)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Excl Hire :</span>
            <span className="font-mono tabular-nums">
              ${formatCurrency(results.voyageCostExclHire)}
            </span>
          </div>
        </div>

        {/* Time Summary */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 mb-2 border-b border-border pb-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">Time</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Time ballast :</span>
            <span className="font-mono tabular-nums text-right">{formatDays(results.seaDaysBallast)} d</span>
            <span className="text-muted-foreground">Time laden :</span>
            <span className="font-mono tabular-nums text-right">{formatDays(results.seaDaysLaden)} d</span>
            <span className="text-muted-foreground">Time at sea :</span>
            <span className="font-mono tabular-nums text-right">{formatDays(results.totalSeaDays)} d</span>
            <span className="text-muted-foreground">Time in port :</span>
            <span className="font-mono tabular-nums text-right">{formatDays(results.totalPortDays)} d</span>
            <span className="font-medium">Total time :</span>
            <span className="font-mono tabular-nums text-right font-semibold text-primary">
              {formatDays(results.totalVoyageDays)} d
            </span>
          </div>
        </div>

        {/* Distance Summary */}
        <div className="bg-muted rounded-sm p-2">
          <div className="text-muted-foreground font-medium mb-1">Distance</div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <span>Total distance</span>
            <span className="font-mono text-right">{results.totalDistance.toLocaleString()} nm</span>
            <span>ECA distance</span>
            <span className="font-mono text-right">{results.totalEcaDistance.toLocaleString()} nm</span>
          </div>
        </div>

        {/* Financial Results */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 mb-2 border-b border-border pb-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">Cargo / Economics</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">NTCE:</span>
            <span className="font-mono tabular-nums text-right font-semibold">
              ${formatCurrency(results.ntce)}
            </span>
            <span className="text-muted-foreground">GTCE:</span>
            <span className="font-mono tabular-nums text-right text-success font-semibold">
              ${formatCurrency(results.gtce)}
            </span>
            <span className="text-muted-foreground">TCE:</span>
            <span className="font-mono tabular-nums text-right">
              ${formatCurrency(results.tce)}
            </span>
          </div>
          <div className="border-t border-border pt-1 mt-2 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Rate :</span>
              <span className="font-mono tabular-nums">
                ${cargo.rate} /{cargo.rateType}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P&L :</span>
              <span className={`font-mono tabular-nums ${results.pAndL >= 0 ? "text-success" : "text-destructive"}`}>
                ${formatCurrency(results.pAndL)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Net Freight :</span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.netFreight)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Freight :</span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.grossFreight)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Port Costs :</span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.portCosts)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hire ({hireRate}/day) :</span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.hireCost)}
              </span>
            </div>
          </div>
        </div>

        {/* Bunker Summary */}
        <div className="space-y-1">
          <div className="flex justify-between border-b border-border pb-1">
            <span className="font-medium">Bunker cost :</span>
            <span className="font-mono tabular-nums font-semibold">
              ${formatCurrency(results.totalBunkerCost)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <span className="text-muted-foreground">Total HSFO:</span>
            <span className="font-mono tabular-nums text-right">{results.hsfoConsumption.toFixed(2)} t</span>
            <span className="text-muted-foreground">Total VLSFO:</span>
            <span className="font-mono tabular-nums text-right">{results.vlsfoConsumption.toFixed(2)} t</span>
            <span className="text-muted-foreground">Total LSMGO:</span>
            <span className="font-mono tabular-nums text-right">{results.lsmgoConsumption.toFixed(2)} t</span>
          </div>
        </div>

        {/* Environmental Metrics */}
        <div className="space-y-1 border-t border-border pt-2">
          <div className="flex items-center gap-1 mb-2">
            <Leaf className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">Environmental</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-muted-foreground">EFOI:</span>
            <span className="font-mono tabular-nums text-right">
              {results.efoi.toFixed(2)} gCO₂/tnm
            </span>
            <span className="text-muted-foreground">AFR/CII:</span>
            <span className="font-mono tabular-nums text-right">
              {results.afrCii.toFixed(2)} gCO₂/dwt-nm
            </span>
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
            <span className="font-medium">Estimated Voyage CII Rating:</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              results.ciiRating === "A" || results.ciiRating === "B" 
                ? "bg-success text-success-foreground"
                : results.ciiRating === "C" 
                  ? "bg-warning text-warning-foreground" 
                  : "bg-destructive text-destructive-foreground"
            }`}>
              {results.ciiRating}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total CO₂:</span>
            <span className="font-mono tabular-nums">
              {results.totalCo2.toFixed(2)} t (L {results.co2Laden.toFixed(2)} / B {results.co2Ballast.toFixed(2)})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
