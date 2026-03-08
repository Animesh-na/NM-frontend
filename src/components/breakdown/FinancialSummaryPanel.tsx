import { TrendingUp } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import type { CargoEntry } from "@/context/VoyageContext";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";

interface FinancialSummaryPanelProps {
  results: VoyageResults;
  hireRate: number;
  cargos: CargoEntry[];
}

export function FinancialSummaryPanel({ results, hireRate, cargos }: FinancialSummaryPanelProps) {
  const formatCurrency = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Get primary cargo for display
  const primaryCargo = cargos[0];

  return (
    <BreakdownCard 
      title="Financial Summary" 
      icon={<TrendingUp className="h-5 w-5" />}
      defaultOpen={true}
    >
      {/* Final Calculation Chain */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium border-b border-border pb-2">Complete Calculation Chain</h3>
        
        <div className="grid grid-cols-2 gap-6">
          {/* Revenue Side */}
          <div className="space-y-4">
            <div className="text-xs font-medium text-muted-foreground">Revenue</div>
            
            <FormulaBlock
              name="1. Gross Freight"
              formula="Rate × Quantity"
              inputs={[
                { label: "Rate", value: `$${primaryCargo?.rate || 0}/${primaryCargo?.rateType || "mt"}`, source: "Cargo" },
                { label: "Quantity", value: `${(primaryCargo?.quantity || 0).toLocaleString()} MT`, source: "Cargo" },
              ]}
              result={{ label: "Gross Freight", value: formatCurrency(results.grossFreight) }}
            />

            <FormulaBlock
              name="2. Net Freight"
              formula="Gross Freight - Commission"
              inputs={[
                { label: "Gross Freight", value: formatCurrency(results.grossFreight), source: "Step 1" },
                { label: "Commission", value: formatCurrency(results.voyageCommission), source: "Cargo" },
              ]}
              result={{ label: "Net Freight", value: formatCurrency(results.netFreight) }}
            />
          </div>

          {/* Cost Side */}
          <div className="space-y-4">
            <div className="text-xs font-medium text-muted-foreground">Costs</div>
            
            <FormulaBlock
              name="3. Voyage Costs (Excl Hire)"
              formula="Port + Bunker + Misc + Canal"
              inputs={[
                { label: "Port Costs", value: formatCurrency(results.portCosts), source: "Sequence" },
                { label: "Bunker Cost", value: formatCurrency(results.totalBunkerCost), source: "Bunker" },
                { label: "Misc Costs", value: formatCurrency(results.miscCosts), source: "Misc" },
                { label: "Canal Costs", value: formatCurrency(results.canalCosts), source: "Misc" },
              ]}
              result={{ label: "Voyage Cost Excl Hire", value: formatCurrency(results.voyageCostExclHire) }}
            />

            <FormulaBlock
              name="4. Hire Cost"
              formula="Hire Rate × Voyage Days + Net BB"
              inputs={[
                { label: "Hire Rate", value: `${formatCurrency(hireRate)}/day`, source: "Manual" },
                { label: "Voyage Days", value: `${results.totalVoyageDays.toFixed(2)} d`, source: "Sequence" },
              ]}
              result={{ label: "Hire Cost", value: formatCurrency(results.hireCost) }}
            />
          </div>
        </div>
      </div>

      {/* Profitability Metrics */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Profitability Metrics</h3>
        
        <div className="grid grid-cols-2 gap-6">
          <FormulaBlock
            name="5. Gross Profit"
            formula="Net Freight - Voyage Cost Excl Hire + Demurrage - Despatch"
            inputs={[
              { label: "Net Freight", value: formatCurrency(results.netFreight), source: "Step 2" },
              { label: "Voyage Cost", value: formatCurrency(results.voyageCostExclHire), source: "Step 3" },
              { label: "Demurrage", value: formatCurrency(primaryCargo?.demurrageAmount || 0), source: "Cargo" },
              { label: "Despatch", value: formatCurrency(primaryCargo?.despatchAmount || 0), source: "Cargo" },
            ]}
            result={{ label: "Gross Profit", value: formatCurrency(results.grossProfit) }}
          />

          <FormulaBlock
            name="6. P&L (Profit & Loss)"
            formula="Gross Profit - Hire Cost"
            inputs={[
              { label: "Gross Profit", value: formatCurrency(results.grossProfit), source: "Step 5" },
              { label: "Hire Cost", value: formatCurrency(results.hireCost), source: "Step 4" },
            ]}
            result={{ label: "P&L", value: formatCurrency(results.pAndL) }}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <FormulaBlock
            name="NTCE"
            formula="(Net Freight - Voyage Costs) / Voyage Days"
            inputs={[
              { label: "Net Freight", value: formatCurrency(results.netFreight), source: "Step 2" },
              { label: "Voyage Costs", value: formatCurrency(results.voyageCostExclHire), source: "Step 3" },
              { label: "Voyage Days", value: `${results.totalVoyageDays.toFixed(2)} d`, source: "Sequence" },
            ]}
            result={{ label: "NTCE", value: `${formatCurrency(results.ntce)}/day` }}
          />
          <FormulaBlock
            name="GTCE"
            formula="NTCE / (1 - TC Commission%)"
            inputs={[
              { label: "NTCE", value: `${formatCurrency(results.ntce)}/day`, source: "Calculated" },
              { label: "TC Commission", value: `${primaryCargo?.tcCommission || 0}%`, source: "Cargo" },
            ]}
            result={{ label: "GTCE", value: `${formatCurrency(results.gtce)}/day` }}
          />
          <FormulaBlock
            name="TCE"
            formula="= GTCE"
            inputs={[
              { label: "GTCE", value: `${formatCurrency(results.gtce)}/day`, source: "Calculated" },
            ]}
            result={{ label: "TCE", value: `${formatCurrency(results.tce)}/day` }}
          />
        </div>
      </div>

      {/* Final Summary Cards */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Final Results</h3>
        <div className="grid grid-cols-6 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-muted-foreground">Voyage Days</div>
            <div className="font-mono font-semibold">{results.totalVoyageDays.toFixed(2)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-muted-foreground">Gross Freight</div>
            <div className="font-mono font-semibold text-sm">{formatCurrency(results.grossFreight)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-muted-foreground">Net Freight</div>
            <div className="font-mono font-semibold text-sm">{formatCurrency(results.netFreight)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-muted-foreground">Total Cost</div>
            <div className="font-mono font-semibold text-sm">{formatCurrency(results.voyageCostInclHire)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-muted-foreground">TCE</div>
            <div className="font-mono font-semibold text-sm">{formatCurrency(results.tce)}</div>
          </div>
          <div className={`rounded-lg p-3 text-center ${results.pAndL >= 0 ? "bg-success/20" : "bg-destructive/20"}`}>
            <div className="text-[10px] text-muted-foreground">P&L</div>
            <div className={`font-mono font-bold text-sm ${results.pAndL >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(results.pAndL)}
            </div>
          </div>
        </div>
      </div>

      {/* Comparison to Benchmarks */}
      {primaryCargo && (primaryCargo.ntcBase > 0 || primaryCargo.gtcTarget > 0) && (
        <div className="mt-6 pt-4 border-t border-border">
          <h3 className="text-sm font-medium mb-3">Benchmark Comparison</h3>
          <div className="grid grid-cols-2 gap-4">
            {primaryCargo.ntcBase > 0 && (
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">NTC Base</span>
                  <span className="font-mono">${primaryCargo.ntcBase}/day</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-muted-foreground">Actual NTCE</span>
                  <span className={`font-mono font-semibold ${results.ntce >= primaryCargo.ntcBase ? "text-success" : "text-destructive"}`}>
                    ${results.ntce.toFixed(0)}/day
                  </span>
                </div>
                <div className="text-xs mt-2">
                  {results.ntce >= primaryCargo.ntcBase ? (
                    <span className="text-success">✓ Above benchmark by ${(results.ntce - primaryCargo.ntcBase).toFixed(0)}/day</span>
                  ) : (
                    <span className="text-destructive">✗ Below benchmark by ${(primaryCargo.ntcBase - results.ntce).toFixed(0)}/day</span>
                  )}
                </div>
              </div>
            )}
            {primaryCargo.gtcTarget > 0 && (
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">GTC Target</span>
                  <span className="font-mono">${primaryCargo.gtcTarget}/day</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-muted-foreground">Actual GTCE</span>
                  <span className={`font-mono font-semibold ${results.gtce >= primaryCargo.gtcTarget ? "text-success" : "text-destructive"}`}>
                    ${results.gtce.toFixed(0)}/day
                  </span>
                </div>
                <div className="text-xs mt-2">
                  {results.gtce >= primaryCargo.gtcTarget ? (
                    <span className="text-success">✓ Above target by ${(results.gtce - primaryCargo.gtcTarget).toFixed(0)}/day</span>
                  ) : (
                    <span className="text-destructive">✗ Below target by ${(primaryCargo.gtcTarget - results.gtce).toFixed(0)}/day</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </BreakdownCard>
  );
}
