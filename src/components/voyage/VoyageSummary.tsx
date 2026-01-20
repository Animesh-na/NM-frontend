import { DollarSign, Clock, TrendingUp } from "lucide-react";

interface VoyageSummaryData {
  totalInclHire: number;
  exclHire: number;
  timeBallast: number;
  timeLaden: number;
  timeAtSea: number;
  timeInPortCanal: number;
  totalTime: number;
  ntce: number;
  gtce: number;
  grossRateCargo: number;
  pAndL: number;
  netFreight: number;
  grossFreight: number;
  bunkerCost: number;
  totalHsfo: number;
  totalVlsfo: number;
  totalLsmgo: number;
  efoi: number;
  efoiAlignment: number;
  afrCii: number;
  afrCiiAlignment: number;
  ciiRating: string;
  totalCo2: number;
}

const summaryData: VoyageSummaryData = {
  totalInclHire: 373974.72,
  exclHire: 213175.12,
  timeBallast: 1.3,
  timeLaden: 7.86,
  timeAtSea: 9.16,
  timeInPortCanal: 9.67,
  totalTime: 18.82,
  ntce: 8875.55,
  gtce: 9221.35,
  grossRateCargo: 7.29,
  pAndL: 167074.88,
  netFreight: 380250.0,
  grossFreight: 390000.0,
  bunkerCost: 109175.12,
  totalHsfo: 0.0,
  totalVlsfo: 236.34,
  totalLsmgo: 3.76,
  efoi: 11.39,
  efoiAlignment: 31.45,
  afrCii: 7.56,
  afrCiiAlignment: 27.78,
  ciiRating: "E",
  totalCo2: 756.78,
};

export function VoyageSummary() {
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
            <span className="font-medium">
              Voyage - Total Incl Hire :
            </span>
            <span className="font-mono tabular-nums font-semibold text-primary">
              ${summaryData.totalInclHire.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Excl Hire :</span>
            <span className="font-mono tabular-nums">
              ${summaryData.exclHire.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
            <span className="font-mono tabular-nums text-right">{summaryData.timeBallast} d</span>
            <span className="text-muted-foreground">Time laden :</span>
            <span className="font-mono tabular-nums text-right">{summaryData.timeLaden} d</span>
            <span className="text-muted-foreground">Time at sea :</span>
            <span className="font-mono tabular-nums text-right">{summaryData.timeAtSea} d</span>
            <span className="text-muted-foreground">Time in port/canal :</span>
            <span className="font-mono tabular-nums text-right">{summaryData.timeInPortCanal} d</span>
            <span className="font-medium">Total time :</span>
            <span className="font-mono tabular-nums text-right font-semibold text-primary">
              {summaryData.totalTime} d
            </span>
          </div>
        </div>

        {/* Sequence Time Breakdown */}
        <div className="bg-muted rounded-sm p-2">
          <div className="text-muted-foreground font-medium mb-1">Sequence</div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <span>at sea</span>
            <span className="text-right">in port/canal</span>
            <span className="font-mono">1.30 d</span>
            <span className="font-mono text-right">5.42 d</span>
            <span className="font-mono">5.44 d</span>
            <span className="font-mono text-right">0.50 d</span>
            <span className="font-mono">2.42 d</span>
            <span className="font-mono text-right">3.75 d</span>
            <span className="font-mono">0.00 d</span>
            <span className="font-mono text-right"></span>
          </div>
        </div>

        {/* Financial Results */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 mb-2 border-b border-border pb-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">Cargo</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">NTCE:</span>
            <span className="font-mono tabular-nums text-right font-semibold">
              ${summaryData.ntce.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-muted-foreground">GTCE:</span>
            <span className="font-mono tabular-nums text-right text-success font-semibold">
              ${summaryData.gtce.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="border-t border-border pt-1 mt-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Rate cargo #1 :</span>
              <span className="font-mono tabular-nums">
                ${summaryData.grossRateCargo} /mt
                <button className="ml-2 text-primary hover:underline">Sensitivity</button>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P&L :</span>
              <span className="font-mono tabular-nums">
                ${summaryData.pAndL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Net Freight :</span>
              <span className="font-mono tabular-nums">
                ${summaryData.netFreight.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Freight :</span>
              <span className="font-mono tabular-nums">
                ${summaryData.grossFreight.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Bunker Summary */}
        <div className="space-y-1">
          <div className="flex justify-between border-b border-border pb-1">
            <span className="font-medium">Bunker cost :</span>
            <span className="font-mono tabular-nums">
              ${summaryData.bunkerCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              <button className="ml-2 text-primary hover:underline">Sensitivity</button>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <span className="text-muted-foreground">Total HSFO:</span>
            <span className="font-mono tabular-nums text-right">{summaryData.totalHsfo} t</span>
            <span className="text-muted-foreground">Total VLSFO:</span>
            <span className="font-mono tabular-nums text-right">{summaryData.totalVlsfo} t</span>
            <span className="text-muted-foreground">Total LSMGO:</span>
            <span className="font-mono tabular-nums text-right">{summaryData.totalLsmgo} t</span>
          </div>
        </div>

        {/* Environmental Metrics */}
        <div className="space-y-1 border-t border-border pt-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-muted-foreground">EFOI:</span>
            <span className="font-mono tabular-nums text-right">
              {summaryData.efoi} gCO2/tnm
              <span className="ml-2 text-success">EFOI Alignment: {summaryData.efoiAlignment}</span>
            </span>
            <span className="text-muted-foreground">AFR/CII:</span>
            <span className="font-mono tabular-nums text-right">
              {summaryData.afrCii} gCO2/dwtnm
              <span className="ml-2 text-warning">AFR/CII Alignment: {summaryData.afrCiiAlignment}</span>
            </span>
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
            <span className="font-medium">Estimated Voyage CII Rating:</span>
            <span className="px-2 py-0.5 bg-destructive text-destructive-foreground rounded font-bold">
              {summaryData.ciiRating}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total CO2:</span>
            <span className="font-mono tabular-nums">
              {summaryData.totalCo2} t (L 605.20 / B 151.57)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
