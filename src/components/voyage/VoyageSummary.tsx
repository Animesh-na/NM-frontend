import { DollarSign, Clock, TrendingUp, Leaf, Download } from "lucide-react";
import { useVoyageContext } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { exportVoyageToExcel } from "@/utils/excelExport";
import { useAuth } from "@/context/AuthContext";


export function VoyageSummary() {
  const { results, cargos, hireRate, vessel, sequence, bunker, misc, netBB, applyEuaImpact, setApplyEuaImpact, applyFuelEuImpact, setApplyFuelEuImpact } = useVoyageContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

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

      <div className="p-2 space-y-2 text-[10px] [&_.text-muted-foreground]:text-foreground [&_.text-muted-foreground]:font-bold [&_.font-medium]:text-primary [&_.font-medium]:font-bold">
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
            <span className="font-mono text-right">{(results.totalDistance + results.totalEcaDistance).toLocaleString()} nm</span>
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
                formula="NTCE / (1 - TC Commission%)" 
                description="Gross Time Charter Equivalent - NTCE grossed up by TC commission"
              />
            </span>
            <span className="font-mono tabular-nums text-right text-success font-semibold">
              ${formatCurrency(results.gtce)}
            </span>
            <span className="text-muted-foreground flex items-center">
              TCE
              <InfoTooltip 
                formula="NTCE / (1 - TC Commission%)" 
                description="Time Charter Equivalent - equals GTCE in this model"
              />
            </span>
            <span className="font-mono tabular-nums text-right">
              ${formatCurrency(results.tce)}
            </span>
          </div>
          <div className="border-t border-border pt-1 mt-2 space-y-0.5">
            <div className="flex justify-between bg-primary/10 rounded-sm px-1 py-0.5 -mx-1">
              <span className="text-muted-foreground flex items-center font-semibold">
                Gross Rate
                <InfoTooltip 
                  formula="(Voyage Cost Incl Hire / Load Qty) / (1 - Voyage Commission%)" 
                  description="Breakeven freight rate per MT including hire and commission"
                />
              </span>
              <span className="font-mono tabular-nums font-bold text-primary">
                ${formatCurrency(results.grossRate)} /mt
              </span>
            </div>
            {cargos.length > 1 && results.perCargoBreakdown && results.perCargoBreakdown.length > 1 && (
              <div className="pl-3 space-y-0.5 border-l-2 border-primary/30 ml-1">
                {results.perCargoBreakdown.map((c, i) => (
                  <div key={c.cargoId} className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">
                      Cargo {c.cargoLabel} Gross Rate
                      <span className="ml-1 text-muted-foreground/70">
                        ({c.loadedQty.toLocaleString()} mt)
                      </span>
                    </span>
                    <span className="font-mono tabular-nums">
                      ${formatCurrency(c.grossRate)} /mt
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between bg-success/10 rounded-sm px-1 py-0.5 -mx-1">
              <span className="text-muted-foreground flex items-center font-semibold">
                P&L
                <InfoTooltip 
                  formula="Net Freight - Voyage Cost Incl Hire" 
                  description="Profit & Loss for the voyage"
                />
              </span>
              <span className={`font-mono tabular-nums font-bold ${results.pAndL >= 0 ? "text-success" : "text-destructive"}`}>
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
                formula="(HSFO × Price) + (VLSFO × Price) + (LSMGO × Price)" 
                description="Total fuel cost (excluding CO₂)"
              />
            </span>
            <span className="font-mono tabular-nums font-semibold">
              ${formatCurrency(results.totalBunkerCost)}
            </span>
          </div>
          {/* Total fuel consumption */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-muted-foreground">Total HSFO</span>
            <span className="font-mono tabular-nums text-right">{results.hsfoConsumption.toFixed(2)} t</span>
            <span className="text-muted-foreground">Total VLSFO</span>
            <span className="font-mono tabular-nums text-right">{results.vlsfoConsumption.toFixed(2)} t</span>
            <span className="text-muted-foreground">Total LSMGO</span>
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
        </div>

        {/* CO₂ & EU ETS Section */}
        <div className="space-y-1 border-t border-border pt-2">
          <div className="flex items-center gap-1 mb-2">
            <span className="font-medium">CO₂ & EU ETS</span>
          </div>

          {/* Validation warnings */}
          {results.emissionWarnings.length > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-sm p-1.5 space-y-0.5">
              {results.emissionWarnings.map((w, i) => (
                <div key={i} className="text-[9px] text-warning font-medium">⚠ {w}</div>
              ))}
            </div>
          )}
          {results.emissionErrors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-sm p-1.5 space-y-0.5">
              {results.emissionErrors.map((e, i) => (
                <div key={i} className="text-[9px] text-destructive font-medium">✕ {e}</div>
              ))}
            </div>
          )}
          

          {/* EU ETS fuel allocation */}
          <div className="bg-muted rounded-sm p-1.5 mt-1 space-y-0.5">
            <div className="text-[9px] text-muted-foreground font-medium">EU ETS & Fuel EU Allocation</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span className="text-muted-foreground">HSFO (EU)</span>
              <span className="font-mono tabular-nums text-right">{results.euCoveredFuel.hsfo.toFixed(2)} t</span>
              <span className="text-muted-foreground">VLSFO (EU)</span>
              <span className="font-mono tabular-nums text-right">{results.euCoveredFuel.vlsfo.toFixed(2)} t</span>
              <span className="text-muted-foreground">LSMGO (EU)</span>
              <span className="font-mono tabular-nums text-right">{results.euCoveredFuel.lsmgo.toFixed(2)} t</span>
            </div>
          </div>

          {/* CO2 totals */}
          <div className="mt-1 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">
                Total CO₂
                <InfoTooltip 
                  formula="(HSFO × 3.114) + (VLSFO × 3.151) + (LSMGO × 3.206)" 
                  description="CO₂ emissions using IMO emission factors"
                />
              </span>
              <span className="font-mono tabular-nums">
                {results.totalCo2.toFixed(2)} t
              </span>
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-muted-foreground pl-2">
                (L {results.co2Laden.toFixed(2)} / B {results.co2Ballast.toFixed(2)})
              </span>
              <span className="font-mono tabular-nums">
                ${formatCurrency(results.totalCo2Cost)}
              </span>
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-muted-foreground pl-2">ETS Coverage</span>
              <span className="font-mono">{(results.etsVoyageCoverage * 100).toFixed(0)}% (Phase-in: {(results.etsPhaseIn * 100).toFixed(0)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">
                EUA CO₂
                <InfoTooltip 
                  formula="Total CO₂ × Voyage Coverage × Phase-In %" 
                  description="Chargeable CO₂ under EU ETS after coverage and phase-in"
                />
              </span>
              <span className="font-mono tabular-nums">
                {results.chargeableCo2.toFixed(2)} t
              </span>
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-muted-foreground pl-2">EUA CO₂ cost</span>
              <span className="font-mono tabular-nums font-semibold text-primary">
                ${formatCurrency(results.euaCo2Cost)}
              </span>
            </div>
          </div>

          {/* EUA Freight Impact with checkbox */}
          <div className="mt-1 pt-1 border-t border-border space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center">
                EUA Freight Impact
                <InfoTooltip 
                  formula="EUA CO₂ Cost / Cargo Quantity" 
                  description="EU ETS cost per metric ton of cargo"
                />
              </span>
              <span className="font-mono tabular-nums font-semibold text-regulatory">
                ${results.euaFreightImpact.toFixed(2)} /mt
              </span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={applyEuaImpact}
                onCheckedChange={(v) => setApplyEuaImpact(!!v)}
                className="h-3.5 w-3.5"
              />
              <span className="text-[9px] text-regulatory font-medium">Apply EUA Freight Impact</span>
            </label>
          </div>
        </div>

        {/* FuelEU Maritime Section */}
        <div className="space-y-1 border-t border-border pt-2">
          <div className="flex items-center gap-1 mb-2">
            <span className="font-medium">Fuel EU Maritime</span>
          </div>
          
          <div className="bg-muted rounded-sm p-1.5 space-y-0.5 text-[9px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Reward Factor</span>
              <span className="font-mono">{results.fuelEuResult.rewardFactor.toFixed(2)}</span>
            </div>
           </div>

          {/* Static Cost Per Ton & Costs */}
          <div className="space-y-0.5 mt-1">
            {(['hsfo', 'vlsfo', 'lsmgo'] as const).map(fuel => {
              const f = results.fuelEuResult.fuels[fuel];
              return (
                <div key={fuel} className="space-y-0.5">
                  <div className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground pl-2">$/ton</span>
                    <span className="font-mono">${f.costPerTon.toFixed(2)} /t</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center">
                      {fuel.toUpperCase()} Cost
                      <InfoTooltip 
                        formula={`${f.euQuantity.toFixed(1)}t × $${f.costPerTon.toFixed(2)}/t`}
                        description={`EU Qty: ${f.euQuantity.toFixed(1)}t × Cost/ton: $${f.costPerTon.toFixed(2)}`}
                      />
                    </span>
                    <span className="font-mono tabular-nums">
                      ${formatCurrency(f.cost)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* FuelEU Total */}
          <div className="flex justify-between mt-1 pt-1 border-t border-border font-semibold">
            <span>Total Fuel EU</span>
            <span className="font-mono tabular-nums text-primary">
              ${formatCurrency(results.fuelEuTotalPenalty)}
            </span>
          </div>

          {/* FuelEU Freight Impact with checkbox */}
          <div className="mt-1 pt-1 border-t border-border space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center">
                FuelEU Freight Impact
                <InfoTooltip 
                  formula="Total FuelEU Penalty / Cargo Quantity" 
                  description="FuelEU Maritime penalty cost per metric ton of cargo"
                />
              </span>
              <span className="font-mono tabular-nums font-semibold text-regulatory">
                ${results.fuelEuFreightImpact.toFixed(2)} /mt
              </span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={applyFuelEuImpact}
                onCheckedChange={(v) => setApplyFuelEuImpact(!!v)}
                className="h-3.5 w-3.5"
              />
              <span className="text-[9px] text-regulatory font-medium">Apply FuelEU Freight Impact</span>
            </label>
          </div>
        </div>

        {/* Export Excel - Admin only */}
        {isAdmin && (
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
        )}

        {/* Disclaimer */}
        <div className="pt-2 border-t border-border text-[9px] text-muted-foreground/60 text-center italic leading-relaxed">
          All information is provided in good faith and without guarantee.
        </div>
      </div>
    </div>
  );
}
