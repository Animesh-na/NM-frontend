import { Package } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import type { CargoEntry, SequenceRowUI } from "@/context/VoyageContext";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";

interface CargoCalculationPanelProps {
  cargos: CargoEntry[];
  results: VoyageResults;
  sequence: SequenceRowUI[];
}

export function CargoCalculationPanel({ cargos, results, sequence }: CargoCalculationPanelProps) {
  const formatCurrency = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  // Calculate cargo quantity from sequence load operations
  const sequenceCargoQuantity = sequence
    .filter(row => row.operation === "loading")
    .reduce((sum, row) => sum + (row.quantity || 0), 0);

  return (
    <BreakdownCard 
      title="Cargo Revenue" 
      icon={<Package className="h-5 w-5" />}
      badge={`${cargos.length} cargo${cargos.length > 1 ? "s" : ""}`}
    >
      <div className="grid grid-cols-2 gap-6">
        {/* Cargo Inputs */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Cargo Entries</h3>
          
          {cargos.map((cargo, index) => (
            <div key={cargo.id} className="bg-muted/30 rounded-lg p-3 space-y-2">
              <div className="font-medium text-sm">Cargo #{index + 1}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <ValueRow label="Rate" value={`$${cargo.rate} / ${cargo.rateType}`} source="Cargo" />
                <ValueRow label="Quantity (from Seq)" value={`${(cargos.length > 1 ? sequenceCargoQuantity / cargos.length : sequenceCargoQuantity).toLocaleString()} MT`} source="Sequence" />
                <ValueRow label="Voy Commission" value={`${cargo.voyageCommission}%`} source="Cargo" />
                <ValueRow label="TC Commission" value={`${cargo.tcCommission}%`} source="Cargo" />
                <ValueRow label="Demurrage" value={formatCurrency(cargo.demurrageAmount)} source="Cargo" />
                <ValueRow label="Despatch" value={formatCurrency(cargo.despatchAmount)} source="Cargo" />
              </div>
            </div>
          ))}
        </div>

        {/* Revenue Calculations */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Revenue Breakdown</h3>
          
          <FormulaBlock
            name="Gross Freight"
            formula="Rate × Quantity from Sequence (or Lumpsum)"
            inputs={cargos.map((c, i) => {
              const cargoQty = cargos.length > 1 ? sequenceCargoQuantity / cargos.length : sequenceCargoQuantity;
              return {
                label: `Cargo #${i + 1}`,
                value: c.rateType === "lumpsum" 
                  ? formatCurrency(c.rate)
                  : formatCurrency(c.rate * cargoQty),
                source: "Calculated",
              };
            })}
            result={{ label: "Total Gross Freight", value: formatCurrency(results.grossFreight) }}
          />

          <FormulaBlock
            name="Voyage Commission Deduction"
            formula="Gross Freight × Voy Commission %"
            inputs={[
              { label: "Gross Freight", value: formatCurrency(results.grossFreight), source: "Calculated" },
              { label: "Voy Commission %", value: `${cargos[0]?.voyageCommission || 0}%`, source: "Cargo" },
            ]}
            result={{ label: "Voy Commission", value: formatCurrency(results.voyageCommission) }}
          />

          <FormulaBlock
            name="TC Commission Deduction"
            formula="Gross Freight × TC Commission %"
            inputs={[
              { label: "Gross Freight", value: formatCurrency(results.grossFreight), source: "Calculated" },
              { label: "TC Commission %", value: `${cargos[0]?.tcCommission || 0}%`, source: "Cargo" },
            ]}
            result={{ label: "TC Commission", value: formatCurrency(results.grossFreight * (cargos[0]?.tcCommission || 0) / 100) }}
          />

          <FormulaBlock
            name="Net Freight"
            formula="Gross Freight - Voy Commission - TC Commission"
            inputs={[
              { label: "Gross Freight", value: formatCurrency(results.grossFreight), source: "Calculated" },
              { label: "Voy Commission", value: formatCurrency(results.voyageCommission), source: "Calculated" },
              { label: "TC Commission", value: formatCurrency(results.grossFreight * (cargos[0]?.tcCommission || 0) / 100), source: "Calculated" },
            ]}
            result={{ label: "Net Freight", value: formatCurrency(results.netFreight) }}
          />
        </div>
      </div>

      {/* Key Financial Metrics */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Key Financial Metrics</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Gross Freight</div>
            <div className="font-mono font-semibold">{formatCurrency(results.grossFreight)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Net Freight</div>
            <div className="font-mono font-semibold">{formatCurrency(results.netFreight)}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">TCE</div>
            <div className="font-mono font-semibold">{formatCurrency(results.tce)}/day</div>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">P&L</div>
            <div className={`font-mono font-semibold ${results.pAndL >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(results.pAndL)}
            </div>
          </div>
        </div>
      </div>
    </BreakdownCard>
  );
}
