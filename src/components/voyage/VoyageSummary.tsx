import { useState } from "react";
import { DollarSign, Clock, TrendingUp, Leaf, Download, ChevronDown, ChevronRight } from "lucide-react";
import { useVoyageContext } from "@/context/VoyageContext";
import { AlertTriangle } from "lucide-react";

import { CoverageInfoButton } from "./CoverageInfoButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { exportVoyageToExcel } from "@/utils/excelExport";
import { trackEvent } from "@/services/logger";
import { useAuth } from "@/context/AuthContext";
import { calculateDemurrageDespatchTotals } from "@/utils/demurrageDespatch";
import { SensitivityAnalysis } from "./SensitivityAnalysis";
import { InsightsPanel } from "./InsightsPanel";


export function VoyageSummary() {
  const { results, cargos, hireRate, vessel, sequence, bunker, misc, netBB, applyEuaImpact, setApplyEuaImpact, applyFuelEuImpact, setApplyFuelEuImpact, applyUkEtsImpact, setApplyUkEtsImpact, validationIssues, hasErrors } = useVoyageContext();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [collapsed, setCollapsed] = useState(false);

  // Why is the EUA freight impact zero? Surface the actual missing input.
  const euEtsPriceEff = bunker.euEtsPrice || bunker.co2Price || 0;
  const euCovered =
    results.euCoveredFuel.hsfo + results.euCoveredFuel.vlsfo + results.euCoveredFuel.lsmgo;
  const hasEuPort = sequence.some((r) => r.isEuEea === true);
  const cargoQty = sequence
    .filter((r) => r.operation === "loading")
    .reduce((sum, r) => sum + (r.quantity || 0), 0);
  const euaZeroReason = !hasEuPort
    ? "No EU/EEA port in the sequence (port eu_zone flag) — EU ETS does not apply."
    : euCovered === 0
      ? "EU ports lie outside the commercial window (first load → last discharge), so no fuel is EU-covered."
      : euEtsPriceEff === 0
        ? "Set an EU ETS price ($/t) in the Bunker section."
        : cargoQty === 0
          ? "No cargo quantity in the sequence — impact per mt cannot be derived."
          : "EU-covered CO₂ is zero for this voyage.";

  // Block summary visibility until all required fields are valid
  if (hasErrors) {
    const scrollTo = (elementId: string) => {
      const el = document.getElementById(elementId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLElement).focus?.();
      }
    };
    return (
      <div className="calc-card-compact">
        <div className="section-header-compact">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Voyage Summary</span>
        </div>
        <div className="p-2 space-y-2 text-[10px]">
          <div className="bg-destructive/10 border border-destructive/40 rounded-sm p-2 space-y-1">
            <div className="flex items-center gap-1 font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {validationIssues.length} field{validationIssues.length === 1 ? "" : "s"} need attention
            </div>
            <p className="text-[9px] text-muted-foreground">
              Voyage Summary will appear once the fields below are filled with valid values. Click any item to jump to it.
            </p>
            <button
              type="button"
              onClick={() => scrollTo(validationIssues[0]?.elementId)}
              className="text-[10px] underline text-destructive hover:text-destructive/80"
            >
              Scroll to first invalid field
            </button>
          </div>
          <ul className="max-h-[60vh] overflow-auto divide-y divide-border border border-border rounded-sm">
            {validationIssues.map((iss, i) => (
              <li key={`${iss.section}-${iss.field}-${iss.rowId ?? ""}-${i}`}>
                <button
                  type="button"
                  onClick={() => scrollTo(iss.elementId)}
                  className="w-full text-left px-2 py-1 hover:bg-accent flex items-start gap-1.5"
                >
                  <span className="text-destructive">•</span>
                  <span className="flex-1">
                    <span className="font-semibold capitalize">{iss.section}</span>
                    {iss.rowId !== undefined && iss.rowId !== "_header" && (
                      <span className="text-muted-foreground"> (row #{String(iss.rowId)})</span>
                    )}
                    {" — "}
                    <span className="text-muted-foreground">{iss.label}:</span>{" "}
                    <span className="text-destructive">{iss.message}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Get first cargo for display (or default values)
  const primaryCargo = cargos[0] || { rate: 0, rateType: "mt" };
  const demurrageDespatch = calculateDemurrageDespatchTotals(cargos, sequence);
  const totalDemurrage = demurrageDespatch.demurrageAmount;
  const totalDespatch = demurrageDespatch.despatchAmount;
  const totalExtraDays = demurrageDespatch.totalExtraDays;
  const showLaytimeImpact = cargos.length <= 1
    && (cargos[0]?.laytimeMode ?? "average") !== "cancelled"
    && (cargos.some((c) => (c.demurrageRate || 0) > 0 || (c.despatchRate || 0) > 0) || Math.abs(totalExtraDays) > 0.005);


  const formatCurrency = (value: number) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDays = (value: number) => {
    return value.toFixed(2);
  };

  /** Green when positive/zero, red when negative — applied to all key outputs. */
  const signColor = (value: number) =>
    (Number.isFinite(value) ? value : 0) < 0 ? "text-destructive" : "text-success";

  return (
    <div className="calc-card-compact">
      <button
        type="button"
        data-readonly-allowed="true"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="section-header-compact w-full justify-between cursor-pointer"
        title={collapsed ? "Expand Voyage Summary" : "Collapse Voyage Summary"}
      >
        <span className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Voyage Summary</span>
        </span>
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      <div className={`p-2 space-y-2 text-[10px] [&_.text-muted-foreground]:text-foreground [&_.text-muted-foreground]:font-bold [&_.font-medium]:text-primary [&_.font-medium]:font-bold ${collapsed ? "hidden" : ""}`}>
        {/* Financial Summary */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-b border-border pb-1">
          <div className="flex justify-between items-center">
            <span className="font-medium flex items-center">Incl Hire</span>
            <span className="font-mono tabular-nums font-semibold text-primary">${formatCurrency(results.voyageCostInclHire)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center">Excl Hire</span>
            <span className="font-mono tabular-nums">${formatCurrency(results.voyageCostExclHire)}</span>
          </div>
        </div>

        {/* Time Summary */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 border-b border-border pb-0.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">Time</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">Ballast</span>
              <span className="font-mono tabular-nums">{formatDays(results.seaDaysBallast)}d</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">Laden</span>
              <span className="font-mono tabular-nums">{formatDays(results.seaDaysLaden)}d</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">At Sea</span>
              <span className="font-mono tabular-nums">{formatDays(results.totalSeaDays)}d</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">In Port</span>
              <span className="font-mono tabular-nums">{formatDays(results.totalPortDays)}d</span>
            </div>
            <div className="flex justify-between col-span-2 border-t border-border pt-0.5">
              <span className="font-medium flex items-center">Total Time</span>
              <span className="font-mono tabular-nums font-semibold text-primary">{formatDays(results.totalVoyageDays)}d</span>
            </div>
          </div>
        </div>

        {/* Distance Summary */}
        <div className="bg-muted rounded-sm p-2">
          <div className="text-muted-foreground font-medium mb-1">Distance</div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <span className="flex items-center">Total distance</span>
            <span className="font-mono text-right">{(results.totalDistance + results.totalEcaDistance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} nm</span>
            <span className="flex items-center">ECA distance</span>
            <span className="font-mono text-right">{results.totalEcaDistance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} nm</span>
          </div>
        </div>

        {/* Financial Results */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 mb-2 border-b border-border pb-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">Cargo / Economics</span>
            <InsightsPanel />
            <SensitivityAnalysis />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">NTCE</span>
              <span className={`font-mono tabular-nums font-semibold ${signColor(results.ntce)}`}>${formatCurrency(results.ntce)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">GTCE</span>
              <span className={`font-mono tabular-nums font-semibold ${signColor(results.gtce)}`}>${formatCurrency(results.gtce)}</span>
            </div>
          </div>
          <div className="border-t border-border pt-1 mt-2 space-y-0.5">
{cargos.length > 1 && results.perCargoBreakdown && results.perCargoBreakdown.length > 1 ? (
              results.perCargoBreakdown.map((c) => {
                const cargoEntry = cargos.find((ce) => ce.id === c.cargoId);
                const laytimeMode = cargoEntry?.laytimeMode ?? "average";
                const cargoLaytime = demurrageDespatch.cargoBreakdowns.find((cb) => cb.cargoId === c.cargoId);
                const affectedRows = (cargoLaytime?.rows || []).filter((r) => Math.abs(r.diffDays) > 0.005);
                return (
                <div key={c.cargoId} className="space-y-0.5">
                  <div className="flex justify-between bg-primary/10 rounded-sm px-1 py-0.5 -mx-1">
                    <span className="text-muted-foreground flex items-center font-semibold">
                      Cargo {c.cargoLabel} Gross Rate
                      <span className="ml-1 text-muted-foreground/70 font-normal">
                        ({c.loadedQty.toLocaleString()} mt)
                      </span>
                    </span>
                    <span className={`font-mono tabular-nums font-bold ${signColor(c.grossRate)}`}>
                      ${formatCurrency(c.grossRate)} /mt
                    </span>
                  </div>
                  {laytimeMode !== "cancelled" && (Math.abs(c.extraDays) > 0.005 || (c.demurrage || 0) > 0 || (c.despatch || 0) > 0) && (
                    <div className="flex justify-between bg-accent/10 rounded-sm px-1 py-0.5 -mx-1 ml-2">
                      <span className="text-muted-foreground flex items-center font-semibold">Cargo {c.cargoLabel} Extra time</span>
                      <span className="font-mono tabular-nums font-bold">
                        <span className={c.extraDays >= 0 ? "text-destructive" : "text-success"}>{formatDays(c.extraDays)} d</span>
                        {(c.despatch || 0) > 0 && <span className="text-destructive"> / Despatch : $ {formatCurrency(c.despatch || 0)}</span>}
                        {(c.demurrage || 0) > 0 && <span className="text-success"> / Demurrage : $ {formatCurrency(c.demurrage || 0)}</span>}
                      </span>
                    </div>
                  )}
                  {laytimeMode === "non_reversible" && affectedRows.map((r) => (
                    <div key={r.rowId} className="flex justify-between bg-accent/5 rounded-sm px-1 py-0.5 -mx-1 ml-4">
                      <span className="text-muted-foreground">
                        {r.port}
                        {r.operation ? ` (${r.operation})` : ""}
                      </span>
                      <span className="font-mono tabular-nums">
                        <span className={r.diffDays >= 0 ? "text-destructive" : "text-success"}>{formatDays(r.diffDays)} d</span>
                        {r.diffDays > 0.005 && r.despatchRate > 0 && (
                          <span className="text-destructive"> / Despatch : $ {formatCurrency(r.diffDays * r.despatchRate)}</span>
                        )}
                        {r.diffDays < -0.005 && r.demurrageRate > 0 && (
                          <span className="text-success"> / Demurrage : $ {formatCurrency(Math.abs(r.diffDays) * r.demurrageRate)}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                );
              })
            ) : (
              <div className="flex justify-between bg-primary/10 rounded-sm px-1 py-0.5 -mx-1">
                <span className="text-muted-foreground flex items-center font-semibold">Gross Rate</span>
                <span className={`font-mono tabular-nums font-bold ${signColor(results.grossRate)}`}>
                  ${formatCurrency(results.grossRate)} /mt
                </span>
              </div>
            )}
            <div className="flex justify-between bg-success/10 rounded-sm px-1 py-0.5 -mx-1">
              <span className="text-muted-foreground flex items-center font-semibold">P&L</span>
              <span className={`font-mono tabular-nums font-bold ${signColor(results.pAndL)}`}>
                ${formatCurrency(results.pAndL)}
              </span>
            </div>
            <div className="flex justify-between bg-success/5 rounded-sm px-1 py-0.5 -mx-1">
              <span className="text-muted-foreground flex items-center font-semibold">P&L/d</span>
              <span className={`font-mono tabular-nums font-bold ${signColor(results.pAndL / (results.totalVoyageDays || 1))}`}>
                ${formatCurrency(results.totalVoyageDays > 0 ? results.pAndL / results.totalVoyageDays : 0)}
              </span>
            </div>
            {showLaytimeImpact && (
              <div className="flex justify-between bg-accent/10 rounded-sm px-1 py-0.5 -mx-1">
                <span className="text-muted-foreground flex items-center font-semibold">Extra time</span>
                <span className="font-mono tabular-nums font-bold">
                  <span className={totalExtraDays >= 0 ? "text-destructive" : "text-success"}>{formatDays(totalExtraDays)} d</span>
                  {totalDespatch > 0 && <span className="text-destructive"> / Despatch : $ {formatCurrency(totalDespatch)}</span>}
                  {totalDemurrage > 0 && <span className="text-success"> / Demurrage : $ {formatCurrency(totalDemurrage)}</span>}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-muted-foreground flex items-center text-[9px] whitespace-nowrap">Net Frt</span>
                <span className="font-mono tabular-nums font-bold text-success bg-success/15 rounded-sm px-1.5 py-0.5 leading-tight whitespace-nowrap">
                  ${formatCurrency(results.netFreight)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-muted-foreground flex items-center text-[9px] whitespace-nowrap">Gross Frt</span>
                <span className="font-mono tabular-nums font-bold text-success bg-success/15 rounded-sm px-1.5 py-0.5 leading-tight whitespace-nowrap">
                  ${formatCurrency(results.grossFreight)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bunker Summary */}
        <div className="space-y-1">
          <div className="flex justify-between border-b border-border pb-1">
            <span className="font-medium flex items-center">Bunker cost</span>
            <span className="font-mono tabular-nums font-semibold">
              ${formatCurrency(results.totalBunkerCost)}
            </span>
          </div>
          {/* Total fuel consumption + EU allocation (one row per fuel) */}
          <div className="space-y-0.5">
            {([
              { label: "HSFO", total: results.hsfoConsumption, eu: results.euCoveredFuel.hsfo },
              { label: "VLSFO", total: results.vlsfoConsumption, eu: results.euCoveredFuel.vlsfo },
              { label: "LSMGO", total: results.lsmgoConsumption, eu: results.euCoveredFuel.lsmgo },
            ]).map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">Total {f.label}</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono tabular-nums">{f.total.toFixed(2)} t</span>
                  <span className="text-[9px] text-muted-foreground">
                    EU ETS &amp; FuelEU: <span className="font-mono tabular-nums">{f.eu.toFixed(2)} t</span>
                  </span>
                </span>
              </div>
            ))}
          </div>

        </div>

        {/* Environmental Metrics */}
        <div className="space-y-1 border-t border-border pt-2">
          <div className="flex items-center gap-1 mb-2">
            <Leaf className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">Environmental</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-muted-foreground flex items-center">EEOI</span>
            <span className="font-mono tabular-nums text-right">
              {results.efoi.toFixed(2)} gCO₂/tnm
            </span>
            <span className="text-muted-foreground flex items-center">AER/CII</span>
            <span className="font-mono tabular-nums text-right">
              {results.afrCii.toFixed(2)} gCO₂/dwt-nm
            </span>
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
            <span className="font-medium flex items-center">Estimated Voyage CII Rating</span>
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
            <CoverageInfoButton mode="eu" results={results} />
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
          


          {/* CO2 totals */}
          <div className="mt-1 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">Total CO₂</span>
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
              <span className="text-muted-foreground pl-2">Commercial Sea Coverage</span>
              <span className="font-mono">{(results.etsVoyageCoverage * 100).toFixed(0)}% (Phase-in: {(results.etsPhaseIn * 100).toFixed(0)}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">EUA CO₂</span>
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

          {/* EUA Freight Impact (own section) */}
          <div className="mt-2 pt-2 border-t border-border space-y-1">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-medium">EUA Freight Impact</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center">EUA Freight Impact</span>
              <span className="font-mono tabular-nums font-semibold text-regulatory">
                ${results.euaFreightImpact.toFixed(2)} /mt
              </span>
            </div>
            {results.euaFreightImpact === 0 && (
              <div className="text-[9px] text-warning font-medium">
                ⚠ {euaZeroReason}
              </div>
            )}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={applyEuaImpact}
                onCheckedChange={(v) => { trackEvent("regulatory.toggle", { component: "VoyageSummary", scheme: "EU_ETS", enabled: !!v }); setApplyEuaImpact(!!v); }}
                className="h-3.5 w-3.5"
              />
              <span className="text-[9px] text-regulatory font-medium">Apply EUA Freight Impact</span>
            </label>
          </div>

          {/* UK ETS (independent section) */}
          <div className="mt-2 pt-2 border-t border-border space-y-1">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-medium">UK ETS</span>
              <CoverageInfoButton mode="uk" results={results} />
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground flex items-center">UK ETS Coverage</span>
              <span className="font-mono">
                {(results.ukEtsVoyageCoverage * 100).toFixed(0)}% (Phase-in: {(results.ukEtsPhaseIn * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">UK Chargeable CO₂</span>
              <span className="font-mono tabular-nums">
                {results.ukChargeableCo2.toFixed(2)} t
              </span>
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-muted-foreground pl-2">UK ETS cost</span>
              <span className="font-mono tabular-nums font-semibold text-primary">
                ${formatCurrency(results.ukEtsCost)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-muted-foreground flex items-center">UK ETS Freight Impact</span>
              <span className="font-mono tabular-nums font-semibold text-regulatory">
                ${results.ukEtsFreightImpact.toFixed(2)} /mt
              </span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={applyUkEtsImpact}
                onCheckedChange={(v) => { trackEvent("regulatory.toggle", { component: "VoyageSummary", scheme: "UK_ETS", enabled: !!v }); setApplyUkEtsImpact(!!v); }}
                className="h-3.5 w-3.5"
              />
              <span className="text-[9px] text-regulatory font-medium">Apply UK ETS Freight Impact</span>
            </label>
          </div>

        </div>

        {/* FuelEU Maritime Section */}
        <div className="space-y-1 border-t border-border pt-2">
          <div className="flex items-center gap-1 mb-2">
            <span className="font-medium">Fuel EU Maritime</span>
            <CoverageInfoButton mode="fueleu" results={results} />
          </div>
          
          <div className="bg-muted rounded-sm p-1.5 space-y-0.5 text-[9px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Wind Reward Factor</span>
              <span className="font-mono">{results.fuelEuResult.rewardFactor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Year / GHG Limit</span>
              <span className="font-mono">{results.fuelEuResult.voyageYear} · {results.fuelEuResult.ghgLimit.toFixed(2)} g/MJ</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Voyage GHG (WtW)</span>
              <span className="font-mono">{results.fuelEuResult.voyageGhg.toFixed(2)} g/MJ</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Compliance Balance</span>
              <span className={`font-mono ${results.fuelEuResult.totalBalance < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                {(results.fuelEuResult.totalBalance / 1e6).toFixed(2)} t·CO₂eq·MJ
              </span>
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
                    <span className="text-muted-foreground flex items-center">{fuel.toUpperCase()} Cost</span>
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
              <span className="text-muted-foreground flex items-center">FuelEU Freight Impact</span>
              <span className="font-mono tabular-nums font-semibold text-regulatory">
                ${results.fuelEuFreightImpact.toFixed(2)} /mt
              </span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={applyFuelEuImpact}
                onCheckedChange={(v) => { trackEvent("regulatory.toggle", { component: "VoyageSummary", scheme: "FuelEU", enabled: !!v }); setApplyFuelEuImpact(!!v); }}
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
              onClick={() => {
                trackEvent("voyage.export.excel", {
                  component: "VoyageSummary",
                  vessel: vessel?.name,
                  sequence_rows: sequence?.length ?? 0,
                  cargos: cargos?.length ?? 0,
                  tce: results?.tce,
                  pnl: results?.pAndL,
                });
                exportVoyageToExcel({
                vessel,
                sequence,
                cargos,
                bunker: {
                  hsfo: bunker.hsfo,
                  vlsfo: bunker.vlsfo,
                  lsmgo: bunker.lsmgo,
                  co2Price: bunker.co2Price,
                  rewardFactor: bunker.rewardFactor,
                  euEtsPrice: bunker.euEtsPrice,
                  ukEtsPrice: bunker.ukEtsPrice,
                  fuelMode: bunker.fuelMode,
                  ignoreBOB: bunker.ignoreBOB,
                  portBunkering: bunker.portBunkering,
                },
                misc,
                hireRate,
                netBB,
                results,
                applyEuaImpact,
                applyFuelEuImpact,
                applyUkEtsImpact,
                });
              }}
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
