import { DollarSign } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import type { MiscState } from "@/context/VoyageContext";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";

interface MiscCalculationPanelProps {
  misc: MiscState;
  results: VoyageResults;
}

export function MiscCalculationPanel({ misc, results }: MiscCalculationPanelProps) {
  const formatCurrency = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalMiscCosts = misc.miscCost + misc.extraFees + misc.extraInsurance;
  const totalCanalCosts = misc.canalCost1;

  return (
    <BreakdownCard 
      title="Miscellaneous Costs" 
      icon={<DollarSign className="h-5 w-5" />}
      badge={misc.tradeType || undefined}
    >
      <div className="grid grid-cols-2 gap-6">
        {/* Cost Inputs */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Cost Inputs</h3>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Miscellaneous</div>
            <ValueRow label="Misc Cost" value={formatCurrency(misc.miscCost)} source="Manual" />
            <ValueRow label="Extra Fees" value={formatCurrency(misc.extraFees)} source="Manual" />
            <ValueRow label="Extra Insurance" value={formatCurrency(misc.extraInsurance)} source="Manual" />
            <ValueRow label="Subtotal" value={formatCurrency(totalMiscCosts)} isTotal />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Canal Costs</div>
            <ValueRow label="Canal Cost" value={formatCurrency(misc.canalCost1)} source="Manual" />
            <ValueRow label="Subtotal" value={formatCurrency(totalCanalCosts)} isTotal />
          </div>
        </div>

        {/* Cost Summary */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Cost Aggregation</h3>
          
          <FormulaBlock
            name="Total Miscellaneous Cost"
            formula="Misc + Extra Fees + Extra Insurance"
            inputs={[
              { label: "Misc Cost", value: formatCurrency(misc.miscCost), source: "Misc" },
              { label: "Extra Fees", value: formatCurrency(misc.extraFees), source: "Misc" },
              { label: "Extra Insurance", value: formatCurrency(misc.extraInsurance), source: "Misc" },
            ]}
            result={{ label: "Total Misc", value: formatCurrency(totalMiscCosts) }}
          />

          <FormulaBlock
            name="Total Canal Cost"
            formula="Canal Cost"
            inputs={[
              { label: "Canal", value: formatCurrency(misc.canalCost1), source: "Misc" },
            ]}
            result={{ label: "Total Canal", value: formatCurrency(totalCanalCosts) }}
          />

          <div className="bg-primary/10 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="font-medium">Combined Misc + Canal</span>
              <span className="font-mono font-semibold text-primary">
                {formatCurrency(results.miscCosts + results.canalCosts)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Impact on Voyage Cost */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Impact on Voyage Cost</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Misc Costs</div>
            <div className="font-mono font-semibold">{formatCurrency(results.miscCosts)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Canal Costs</div>
            <div className="font-mono font-semibold">{formatCurrency(results.canalCosts)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Port Costs</div>
            <div className="font-mono font-semibold">{formatCurrency(results.portCosts)}</div>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Total Voyage Cost</div>
            <div className="font-mono font-semibold text-primary">{formatCurrency(results.totalVoyageCosts)}</div>
          </div>
        </div>
      </div>
    </BreakdownCard>
  );
}
