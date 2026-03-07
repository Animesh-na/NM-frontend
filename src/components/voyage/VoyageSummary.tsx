import { DollarSign, Clock, TrendingUp, Leaf, Download } from "lucide-react";
import { useVoyageContext } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "@/components/ui/button";
import { exportVoyageToExcel } from "@/utils/excelExport";

export function VoyageSummary() {
  const { results, cargos, hireRate, vessel, sequence, bunker, misc, netBB } = useVoyageContext();

  // Get first cargo for display (or default values)
  const primaryCargo = cargos[0] || { rate: 0, rateType: "mt" };

  const formatCurrency = (value: number) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDays = (value: number) => {
    return value.toFixed(2);
  };

  return (
    <div className="calc-card-compact">
      <div className="section-header-compact">
        <TrendingUp className="h-3.5 w-3.5" />
        <span>Voyage Summary</span>
      </div>

      <div className="p-2 space-y-2 text-[10px]">
        {/* Financial Summary */}
        <div className="space-y-1">
          <div className="flex justify-between items-center border-b border-border pb-1">
            <span className="font-medium flex items-center">
              Voyage - Total Incl Hire
              <InfoTooltip 
                formula="Voyage Cost Excl Hire + Hire Cost" 
                description="Total voyage cost including vessel hire"
              />
            </span>
            <span className="font-mono tabular-nums font-semibold text-primary">
              ${formatCurrency(results.voyageCostInclHire)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center">
              Excl Hire
              <InfoTooltip 
                formula="Port Costs + Bunker Cost + CO₂ Cost" 
                description="Total voyage cost excluding vessel hire"
              />
            </span>
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
            <span className="text-muted-foreground flex items-center">
              Time ballast
              <InfoTooltip 
                formula="Ballast Distance / (Speed × 24)" 
                description="Days spent sailing in ballast condition"
              />
            </span>
            <span className="font-mono tabular-nums text-right">{formatDays(results.seaDaysBallast)} d</span>
            <span className="text-muted-foreground flex items-center">
              Time laden
              <InfoTooltip 
                formula="Laden Distance / (Speed × 24)" 
                description="Days spent sailing with cargo"
              />
            </span>
            <span className="font-mono tabular-nums text-right">{formatDays(results.seaDaysLaden)} d</span>
            <span className="text-muted-foreground flex items-center">
              Time at sea
              <InfoTooltip 
                formula="Time Ballast + Time Laden" 
                description="Total sailing time"
              />
            </span>
            <span className="font-mono tabular-nums text-right">{formatDays(results.totalSeaDays)} d</span>
            <span className="text-muted-foreground flex items-center">
              Time in port
              <InfoTooltip 
                formula="Σ Port Days (all ports)" 
                description="Sum of days in all ports"
              />
            </span>
            <span className="font-mono tabular-nums text-right">{formatDays(results.totalPortDays)} d</span>
            <span className="font-medium flex items-center">
              Total time
              <InfoTooltip 
                formula="Time at Sea + Time in Port" 
                description="Total voyage duration"
              />
            </span>
            <span className="font-mono tabular-nums text-right font-semibold text-primary">
              {formatDays(results.totalVoyageDays)} d
            </span>
          </div>
        </div>

        {/* Distance Summary */}
        <div className="bg-muted rounded-sm p-2">
          <div className="text-muted-foreground font-medium mb-1">Distance</div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <span className="flex items-center">
              Total distance
              <InfoTooltip 
                formula="Σ Leg Distances (port to port)" 
                description="Sum of all leg distances via sea route"
              />
            </span>
            <span className="font-mono text-right">{results.totalDistance.toLocaleString()} nm</span>
            <span className="flex items-center">
              ECA distance
              <InfoTooltip 
                formula="Σ ECA Leg Distances" 
                description="Distance within Emission Control Areas"
              />
            </span>
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
            <span className="text-muted-foreground flex items-center">
              NTCE
              <InfoTooltip 
                formula="(Net Freight - Voyage Cost Excl Hire) / Total Days" 
                description="Net Time Charter Equivalent - daily earning after all costs"
              />
            </span>
            <span className="font-mono tabular-nums text-right font-semibold">
              ${formatCurrency(results.ntce)}
            </span>
            <span className="text-muted-foreground flex items-center">
              GTCE
              <InfoTooltip 
                formula="Gross Freight / Total Days" 
                description="Gross Time Charter Equivalent - daily gross earning"
              />
            </span>
            <span className="font-mono tabular-nums text-right text-success font-semibold">
              ${formatCurrency(results.gtce)}
            </span>
            <span className="text-muted-foreground flex items-center">
              TCE
              <InfoTooltip 
                formula="(Gross Freight - Voyage Cost Excl Hire) / Total Days" 
                description="Time Charter Equivalent - standard profitability measure"
              />
            </span>
            <span className="font-mono tabular-nums text-right">
              ${formatCurrency(results.tce)}
            </span>
          </div>
          <div className="border-t border-border pt-1 mt-2 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">
                Gross Rate
                <InfoTooltip 
                  formula="(Voyage Cost Incl Hire / Load Qty) / (1 - Voyage Commission%)" 
                  description="Breakeven freight rate per MT including hire and commission"
                />
              </span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.grossRate)} /mt
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">
                P&L
                <InfoTooltip 
                  formula="Net Freight - Voyage Cost Incl Hire" 
                  description="Profit & Loss for the voyage"
                />
              </span>
              <span className={`font-mono tabular-nums ${results.pAndL >= 0 ? "text-success" : "text-destructive"}`}>
                ${formatCurrency(results.pAndL)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">
                Net Freight
                <InfoTooltip 
                  formula="Gross Freight × (1 - Commission%)" 
                  description="Freight after deducting commissions"
                />
              </span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.netFreight)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">
                Gross Freight
                <InfoTooltip 
                  formula="Rate × Quantity (or Lumpsum)" 
                  description="Total freight before commissions"
                />
              </span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.grossFreight)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">
                Port Costs
                <InfoTooltip 
                  formula="Σ Expected DA (all ports)" 
                  description="Sum of Disbursement Account costs at each port"
                />
              </span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.portCosts)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">
                Hire ({hireRate}/day)
                <InfoTooltip 
                  formula="Daily Hire Rate × Total Days" 
                  description="Total vessel hire cost for the voyage"
                />
              </span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.hireCost)}
              </span>
            </div>
          </div>
        </div>

        {/* Bunker Summary */}
        <div className="space-y-1">
          <div className="flex justify-between border-b border-border pb-1">
            <span className="font-medium flex items-center">
              Bunker cost
              <InfoTooltip 
                formula="(HSFO × Price) + (VLSFO × Price) + (LSMGO × Price) + (CO₂ × Price)" 
                description="Total fuel and emissions cost"
              />
            </span>
            <span className="font-mono tabular-nums font-semibold">
              ${formatCurrency(results.totalBunkerCost)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <span className="text-muted-foreground flex items-center">
              Total HSFO
              <InfoTooltip 
                formula="(Ballast Days × Consumption) + (Laden Days × Consumption)" 
                description="High Sulphur Fuel Oil consumption"
              />
            </span>
            <span className="font-mono tabular-nums text-right">{results.hsfoConsumption.toFixed(2)} t</span>
            <span className="text-muted-foreground flex items-center">
              Total VLSFO
              <InfoTooltip 
                formula="(Ballast Days × Consumption) + (Laden Days × Consumption)" 
                description="Very Low Sulphur Fuel Oil consumption"
              />
            </span>
            <span className="font-mono tabular-nums text-right">{results.vlsfoConsumption.toFixed(2)} t</span>
            <span className="text-muted-foreground flex items-center">
              Total LSMGO
              <InfoTooltip 
                formula="Port Days × Daily Consumption" 
                description="Low Sulphur Marine Gas Oil consumption (port use)"
              />
            </span>
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
            <span className="text-muted-foreground flex items-center">
              EFOI
              <InfoTooltip 
                formula="Total CO₂ / (Cargo Qty × Total Distance) × 1,000,000" 
                description="Energy Efficiency Operational Indicator"
              />
            </span>
            <span className="font-mono tabular-nums text-right">
              {results.efoi.toFixed(2)} gCO₂/tnm
            </span>
            <span className="text-muted-foreground flex items-center">
              AFR/CII
              <InfoTooltip 
                formula="Total CO₂ / (DWT × Total Distance) × 1,000,000" 
                description="Annual Fuel Ratio / Carbon Intensity Indicator"
              />
            </span>
            <span className="font-mono tabular-nums text-right">
              {results.afrCii.toFixed(2)} gCO₂/dwt-nm
            </span>
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
            <span className="font-medium flex items-center">
              Estimated Voyage CII Rating
              <InfoTooltip 
                formula="Rating = Actual CII / Required CII. A (≤82%), B (82-93%), C (93-108%), D (108-120%), E (>120%)" 
                description="IMO CII rating based on ratio of actual to required CII for the vessel type and year"
              />
            </span>
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
            <span className="text-muted-foreground flex items-center">
              Total CO₂
              <InfoTooltip 
                formula="(HSFO × 3.114) + (VLSFO × 3.151) + (LSMGO × 3.206)" 
                description="CO₂ emissions using IMO emission factors (t CO₂/t fuel)"
              />
            </span>
            <span className="font-mono tabular-nums">
              {results.totalCo2.toFixed(2)} t (L {results.co2Laden.toFixed(2)} / B {results.co2Ballast.toFixed(2)})
            </span>
          </div>
        </div>

        {/* Export Excel */}
        <div className="pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 h-6 text-[10px]"
            onClick={() => exportVoyageToExcel({
              vessel,
              sequence,
              cargos,
              bunker: {
                hsfo: bunker.hsfo,
                vlsfo: bunker.vlsfo,
                lsmgo: bunker.lsmgo,
                co2Price: bunker.co2Price,
                rewardFactor: bunker.rewardFactor,
              },
              misc,
              hireRate,
              netBB,
              results,
            })}
          >
            <Download className="h-3 w-3" />
            Export Excel
          </Button>
        </div>
      </div>
    </div>
  );
}
