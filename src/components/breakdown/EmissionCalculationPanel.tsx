import { useState } from "react";
import { AlertTriangle, Leaf, RefreshCw, Ship, Anchor, Navigation, Flag, Fuel } from "lucide-react";
import { BreakdownCard, FormulaBlock, ValueRow } from "./BreakdownCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import type { VesselData } from "@/data/vessels";
import { CO2_EMISSION_FACTORS, getEtsPhaseInPercentage } from "@/utils/emissionCalculations";
import { FUEL_EU_PROPERTIES } from "@/utils/fuelEuMaritime";

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
  euEtsPrice?: number;
  ukEtsPrice?: number;
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

  const hasWarnings = results.emissionWarnings?.length > 0;
  const hasErrors = results.emissionErrors?.length > 0;
  const requiresAction = results.ciiRating === 'D' || results.ciiRating === 'E';

  const currentYear = new Date().getFullYear();
  const phaseInPercent = getEtsPhaseInPercentage(currentYear) * 100;
  const phaseInDecimal = phaseInPercent / 100;

  // Totals from leg details
  const legDetails = results.etsLegDetails || [];
  const totalChargeableVlsfo = legDetails.reduce((s, l) => s + l.chargeableVlsfo, 0);
  const totalChargeableLsmgo = legDetails.reduce((s, l) => s + l.chargeableLsmgo, 0);
  const totalChargeableHsfo = legDetails.reduce((s, l) => s + l.chargeableHsfo, 0);
  const totalChargeableCo2PrePhaseIn = legDetails.reduce((s, l) => s + l.chargeableCo2, 0);

  // ---------- Compact "Allowances" rows (screenshot-style) ----------
  // Each sea leg and each port stay become independent rows with a clear
  // Operation label and a single chargeable-CO₂ (EUAs / UKAs) value.
  type AllowanceRow = {
    key: string;
    label: string;              // "Origin > Destination" for sea, "Port" for port stay
    operation: string;          // Ballast / Laden / Load / Discharge / Stop / ...
    coveragePct: number;        // 0 / 50 / 100
    seaOrPort: "sea" | "port";
    chargeableCo2: number;
  };

  const opLabel = (op?: string, fallback = "Stop"): string => {
    const o = (op || "").toLowerCase();
    if (o === "loading" || o === "load") return "Load";
    if (o === "discharging" || o === "disch" || o === "discharge") return "Discharge";
    if (o === "pssg" || o === "passage") return "Stop";
    if (o === "bunker" || o === "bunkering") return "Bunker";
    if (o === "repos" || o === "repositioning") return "Repos";
    return op ? op.charAt(0).toUpperCase() + op.slice(1) : fallback;
  };

  const co2FromFuel = (h: number, v: number, l: number) =>
    h * CO2_EMISSION_FACTORS.hsfo +
    v * CO2_EMISSION_FACTORS.vlsfo +
    l * CO2_EMISSION_FACTORS.lsmgo;

  // Build EU allowance rows by walking legDetails and tracking laden state
  // from destination-port operations (Load -> laden onward, Discharge -> ballast).
  const buildEuAllowanceRows = (): AllowanceRow[] => {
    const rows: AllowanceRow[] = [];
    let cargoOnBoard = 0;
    legDetails.forEach((l) => {
      const destSeq = sequence.find((s) => s.port === l.destPort);
      const destOp = destSeq?.operation || "";
      const seaOp = cargoOnBoard > 0 ? "Laden" : "Ballast";
      const seaFactor = l.coveragePct / 100;
      const portFactor = l.portCoveragePct / 100;

      const seaCo2 = co2FromFuel(l.seaHsfo, l.seaVlsfo, l.seaLsmgo) * seaFactor;
      const portCo2 = co2FromFuel(l.portHsfo, l.portVlsfo, l.portLsmgo) * portFactor;

      // Always emit the sea segment row (even with zero fuel) so ballast legs
      // from an EU open port are visible in the allowance table.
      if (!l.isPortOnly) {
        rows.push({
          key: `sea-${l.legIndex}`,
          label: `${l.originPort || "—"} > ${l.destPort}`,
          operation: seaOp,
          coveragePct: l.coveragePct,
          seaOrPort: "sea",
          chargeableCo2: seaCo2,
        });
      }
      rows.push({
        key: `port-${l.legIndex}`,
        label: l.destPort,
        operation: opLabel(destOp),
        coveragePct: l.portCoveragePct,
        seaOrPort: "port",
        chargeableCo2: portCo2,
      });

      const op = destOp.toLowerCase();
      const qty = Math.max(0, Number((destSeq as unknown as { quantity?: number })?.quantity) || 0);
      if (op === "loading" || op === "load") cargoOnBoard += qty;
      else if (op === "discharging" || op === "disch" || op === "discharge")
        cargoOnBoard = Math.max(0, cargoOnBoard - qty);
    });
    return rows;
  };

  const euAllowanceRows = buildEuAllowanceRows();
  const euAllowanceTotal = euAllowanceRows.reduce((s, r) => s + r.chargeableCo2, 0);

  // UK allowance rows from ukEtsResult.legBreakdown (already per-leg)
  const ukAllowanceRows: AllowanceRow[] = [];
  {
    let cargoOnBoard = 0;
    const ukPhaseIn = results.ukEtsResult.phaseIn ?? 1;
    results.ukEtsResult.legBreakdown.forEach((l) => {
      const destSeq = sequence.find((s) => s.port === l.destPort);
      const destOp = destSeq?.operation || "";
      const seaOp = cargoOnBoard > 0 ? "Laden" : "Ballast";

      // We only have combined ukCoveredFuel / ukCoveredCo2 per leg – split by
      // coverage: if sea coverage > 0 emit a sea row for the leg CO2 minus port
      // portion; use portCoveragePct portion for the port row.
      // Approximation: chargeable × (sea share vs port share).
      const seaChargeable =
        l.seaCoveragePct > 0 ? l.chargeableCo2 * (l.seaCoveragePct / (l.seaCoveragePct + l.portCoveragePct || 1)) : 0;
      const portChargeable =
        l.portCoveragePct > 0
          ? l.chargeableCo2 * (l.portCoveragePct / (l.seaCoveragePct + l.portCoveragePct || 1))
          : 0;

      if (l.seaCoveragePct > 0) {
        ukAllowanceRows.push({
          key: `uk-sea-${l.legIndex}`,
          label: `${l.originPort} > ${l.destPort}`,
          operation: seaOp,
          coveragePct: l.seaCoveragePct,
          seaOrPort: "sea",
          chargeableCo2: seaChargeable,
        });
      }
      if (l.portCoveragePct > 0) {
        ukAllowanceRows.push({
          key: `uk-port-${l.legIndex}`,
          label: l.destPort,
          operation: opLabel(destOp),
          coveragePct: l.portCoveragePct,
          seaOrPort: "port",
          chargeableCo2: portChargeable,
        });
      }

      const op = destOp.toLowerCase();
      const qty = Math.max(0, Number((destSeq as unknown as { quantity?: number })?.quantity) || 0);
      if (op === "loading" || op === "load") cargoOnBoard += qty;
      else if (op === "discharging" || op === "disch" || op === "discharge")
        cargoOnBoard = Math.max(0, cargoOnBoard - qty);

      // Silence unused var (phase-in is baked in chargeableCo2 already)
      void ukPhaseIn;
    });
  }
  const ukAllowanceTotal = ukAllowanceRows.reduce((s, r) => s + r.chargeableCo2, 0);

  const renderAllowanceTable = (
    rows: AllowanceRow[],
    unitLabel: string,
    total: number,
  ) => (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left font-medium py-1 px-2">Segment / Port</th>
            <th className="text-left font-medium py-1 px-2">Operation</th>
            <th className="text-right font-medium py-1 px-2">Cov</th>
            <th className="text-right font-medium py-1 px-2">{unitLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-2 px-2 text-center text-muted-foreground">
                No covered legs.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.key}
              className={`border-t border-border/50 ${r.seaOrPort === "port" ? "bg-muted/20" : ""}`}
            >
              <td className="py-1 px-2 truncate max-w-[280px]">
                {r.seaOrPort === "sea" ? (
                  <span className="font-medium">{r.label}</span>
                ) : (
                  <span className="text-muted-foreground">{r.label}</span>
                )}
              </td>
              <td className="py-1 px-2">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${
                    r.operation === "Laden"
                      ? "bg-amber-500/15 text-amber-700"
                      : r.operation === "Ballast"
                      ? "bg-sky-500/15 text-sky-700"
                      : r.operation === "Load"
                      ? "bg-emerald-500/15 text-emerald-700"
                      : r.operation === "Discharge"
                      ? "bg-purple-500/15 text-purple-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {r.operation}
                </span>
              </td>
              <td className="py-1 px-2 text-right font-mono tabular-nums">
                {r.coveragePct}%
              </td>
              <td className="py-1 px-2 text-right font-mono tabular-nums font-medium">
                {r.chargeableCo2.toFixed(2)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border bg-muted/40 font-semibold">
            <td className="py-1 px-2" colSpan={3}>
              Total
            </td>
            <td className="py-1 px-2 text-right font-mono tabular-nums">
              {total.toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <BreakdownCard 
      title="CO₂ Emission & EU ETS Compliance" 
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
            <div>Distance: <span className="font-mono">{(results.totalDistance + results.totalEcaDistance).toLocaleString()} nm</span></div>
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

      {/* Step 1: Fuel → CO₂ */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Step 1: Total Voyage Fuel → CO₂</h3>
          
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">IMO Emission Factors</div>
            <ValueRow label="HSFO Factor" value={`${CO2_EMISSION_FACTORS.hsfo} t CO₂/t`} source="IMO" />
            <ValueRow label="VLSFO Factor" value={`${CO2_EMISSION_FACTORS.vlsfo} t CO₂/t`} source="IMO" />
            <ValueRow label="LSMGO Factor" value={`${CO2_EMISSION_FACTORS.lsmgo} t CO₂/t`} source="IMO" />
          </div>

          <FormulaBlock
            name="Total Voyage Fuel Consumption"
            formula="Daily Rate × Time × Reward Factor"
            inputs={[
              { label: "HSFO", value: `${results.hsfoConsumption.toFixed(2)} MT`, source: "Calc" },
              { label: "VLSFO", value: `${results.vlsfoConsumption.toFixed(2)} MT`, source: "Calc" },
              { label: "LSMGO", value: `${results.lsmgoConsumption.toFixed(2)} MT`, source: "Calc" },
            ]}
          />

          <FormulaBlock
            name="Total Voyage CO₂"
            formula="Fuel × Emission Factor"
            inputs={[
              { label: "HSFO CO₂", value: `${results.co2ByFuel.hsfo.toFixed(2)} t`, source: "Calc" },
              { label: "VLSFO CO₂", value: `${results.co2ByFuel.vlsfo.toFixed(2)} t`, source: "Calc" },
              { label: "LSMGO CO₂", value: `${results.co2ByFuel.lsmgo.toFixed(2)} t`, source: "Calc" },
            ]}
            result={{ label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t` }}
          />
        </div>

        {/* Step 2: EU Chargeable Fuel Summary */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium border-b border-border pb-2">Step 2: EU Chargeable Fuel (Bottom-Up)</h3>
          
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="font-medium text-sm">EU ETS Allocation Rules</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>• EU → EU: <span className="font-mono font-medium">100%</span> of sea fuel chargeable</div>
              <div>• EU ↔ Non-EU: <span className="font-mono font-medium">50%</span> of sea fuel chargeable</div>
              <div>• Non-EU → Non-EU: <span className="font-mono font-medium">0%</span></div>
              <div>• Port at EU: <span className="font-mono font-medium">100%</span> of port fuel chargeable</div>
            </div>
          </div>

          <FormulaBlock
            name="EU Chargeable Fuel Totals"
            formula="Sum of per-leg chargeable fuel"
            inputs={[
              { label: "EU HSFO", value: `${totalChargeableHsfo.toFixed(2)} MT`, source: "Legs" },
              { label: "EU VLSFO", value: `${totalChargeableVlsfo.toFixed(2)} MT`, source: "Legs" },
              { label: "EU LSMGO", value: `${totalChargeableLsmgo.toFixed(2)} MT`, source: "Legs" },
            ]}
          />

          {/* Fuel comparison: Total vs EU */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Total Voyage vs EU Chargeable</div>
            {results.vlsfoConsumption > 0 && (
              <div className="flex justify-between text-xs">
                <span>VLSFO</span>
                <span className="font-mono">
                  {results.vlsfoConsumption.toFixed(2)} → <span className="text-primary font-medium">{totalChargeableVlsfo.toFixed(2)} MT</span>
                  {' '}({results.vlsfoConsumption > 0 ? ((totalChargeableVlsfo / results.vlsfoConsumption) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            )}
            {results.lsmgoConsumption > 0 && (
              <div className="flex justify-between text-xs">
                <span>LSMGO</span>
                <span className="font-mono">
                  {results.lsmgoConsumption.toFixed(2)} → <span className="text-primary font-medium">{totalChargeableLsmgo.toFixed(2)} MT</span>
                  {' '}({results.lsmgoConsumption > 0 ? ((totalChargeableLsmgo / results.lsmgoConsumption) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            )}
            {results.hsfoConsumption > 0 && (
              <div className="flex justify-between text-xs">
                <span>HSFO</span>
                <span className="font-mono">
                  {results.hsfoConsumption.toFixed(2)} → <span className="text-primary font-medium">{totalChargeableHsfo.toFixed(2)} MT</span>
                  {' '}({results.hsfoConsumption > 0 ? ((totalChargeableHsfo / results.hsfoConsumption) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leg-by-Leg ETS Breakdown Table */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Navigation className="h-4 w-4" />
          Step 3: Leg-by-Leg ETS Responsibility
        </h3>

        {/* Screenshot-style compact EU Allowances table */}
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            EU Allowances (EUAs) — per segment &amp; port
          </div>
          {renderAllowanceTable(euAllowanceRows, "EUAs (t CO₂)", euAllowanceTotal)}
          <div className="text-[10px] text-muted-foreground mt-1">
            Sea rows use the leg&apos;s sea coverage (EU↔EU 100%, EU↔Non-EU 50%, else 0%).
            Port rows use the port stay coverage (EU port 100%, else the bracketed factor).
          </div>
        </div>
        
        {legDetails.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Leg</TableHead>
                  <TableHead className="text-xs">Origin</TableHead>
                  <TableHead className="text-xs">Destination</TableHead>
                  <TableHead className="text-xs text-right">Sea Coverage</TableHead>
                  <TableHead className="text-xs text-right">Sea VLSFO</TableHead>
                  <TableHead className="text-xs text-right">Sea LSMGO</TableHead>
                  <TableHead className="text-xs text-right">Port Coverage</TableHead>
                  <TableHead className="text-xs text-right">Port Fuel</TableHead>
                  <TableHead className="text-xs text-right">EU VLSFO</TableHead>
                  <TableHead className="text-xs text-right">EU LSMGO</TableHead>
                  <TableHead className="text-xs text-right">EU CO₂</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legDetails.map((leg) => (
                  <TableRow key={leg.legIndex}>
                    <TableCell className="font-mono text-xs py-2">Leg {leg.legIndex + 1}</TableCell>
                    <TableCell className="text-xs py-2">
                      <span className={leg.originIsEu ? 'text-blue-500 font-medium' : 'text-muted-foreground'}>
                        {leg.isPortOnly ? '—' : (leg.originPort?.substring(0, 12) || leg.originUnloc)}
                      </span>
                      {leg.originIsEu && <span className="ml-1 text-[10px] bg-blue-500/10 text-blue-500 px-1 rounded">EU</span>}
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      <span className={leg.destIsEu ? 'text-blue-500 font-medium' : 'text-muted-foreground'}>
                        {leg.destPort?.substring(0, 12) || leg.destUnloc}
                      </span>
                      {leg.destIsEu && <span className="ml-1 text-[10px] bg-blue-500/10 text-blue-500 px-1 rounded">EU</span>}
                    </TableCell>
                    <TableCell className="text-xs text-right py-2">
                      <span className={`font-mono font-medium ${leg.coveragePct === 100 ? 'text-green-600' : leg.coveragePct === 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {leg.isPortOnly ? '—' : `${leg.coveragePct}%`}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">{(leg.seaVlsfo + leg.seaHsfo).toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">{leg.seaLsmgo.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right py-2">
                      <span className={`font-mono font-medium ${leg.portCoveragePct === 100 ? 'text-green-600' : leg.portCoveragePct === 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {(leg.portVlsfo + leg.portHsfo + leg.portLsmgo) > 0 ? `${leg.portCoveragePct}%` : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">
                      {(leg.portVlsfo + leg.portHsfo + leg.portLsmgo).toFixed(2)}
                      {leg.destIsEu && <span className="ml-1 text-[10px] text-blue-500">EU</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right py-2 text-primary font-medium">{(leg.chargeableVlsfo + leg.chargeableHsfo).toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2 text-primary font-medium">{leg.chargeableLsmgo.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2 font-medium">{leg.chargeableCo2.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="border-t-2 border-border font-semibold">
                  <TableCell className="text-xs py-2" colSpan={4}>TOTAL</TableCell>
                  <TableCell className="font-mono text-xs text-right py-2">
                    {legDetails.reduce((s, l) => s + l.seaVlsfo + l.seaHsfo, 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right py-2">
                    {legDetails.reduce((s, l) => s + l.seaLsmgo, 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs text-right py-2" />
                  <TableCell className="font-mono text-xs text-right py-2">
                    {legDetails.reduce((s, l) => s + l.portVlsfo + l.portHsfo + l.portLsmgo, 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right py-2 text-primary">
                    {(totalChargeableVlsfo + totalChargeableHsfo).toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right py-2 text-primary">
                    {totalChargeableLsmgo.toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-right py-2 font-bold">
                    {totalChargeableCo2PrePhaseIn.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-4 text-center">
            No voyage legs defined — add ports to the sequence to see leg-by-leg ETS breakdown.
          </div>
        )}
      </div>

      {/* Step 4: Phase-in & Final EUA Calculation */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3">Step 4: Phase-In & Final EUA Liability</h3>
        <div className="grid grid-cols-2 gap-6">
          <FormulaBlock
            name={`Chargeable CO₂ EUA (${currentYear})`}
            formula="(EU HSFO×3.114 + EU VLSFO×3.151 + EU LSMGO×3.206) × Phase-In%"
            inputs={[
              { label: "EU CO₂ (pre phase-in)", value: `${totalChargeableCo2PrePhaseIn.toFixed(2)} t`, source: "Legs" },
              { label: `Phase-In (${currentYear})`, value: `${phaseInPercent}%`, source: "IMO" },
            ]}
            result={{ label: "Final EUA Liability", value: `${results.chargeableCo2.toFixed(2)} t CO₂` }}
          />

          <FormulaBlock
            name="EU ETS Cost"
            formula="Final EUA Liability × Carbon Price"
            inputs={[
              { label: "EUA Liability", value: `${results.chargeableCo2.toFixed(2)} t`, source: "Calc" },
              { label: "Carbon Price", value: `€${bunker.euEtsPrice || bunker.co2Price}/t`, source: "Bunker" },
            ]}
            result={{ label: "Total ETS Cost", value: `€${results.etsCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }}
          />
        </div>
      </div>

      {/* ═══════════════════ UK ETS COVERAGE ═══════════════════ */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Flag className="h-4 w-4 text-red-600" />
          UK ETS — Coverage & Chargeable CO₂
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600">
            Phase-In: {(results.ukEtsPhaseIn * 100).toFixed(0)}%
          </span>
        </h3>

        <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-1 text-xs text-muted-foreground">
          <div className="font-medium text-sm text-foreground mb-1">Coverage Rules (uk_zone)</div>
          <div>• GB ↔ GB: <span className="font-mono font-medium">100% (1.0)</span></div>
          <div>• NI ↔ NI: <span className="font-mono font-medium">100% (1.0)</span></div>
          <div>• GB ↔ NI: <span className="font-mono font-medium">50% (0.5)</span></div>
          <div>• Any leg with no UK zone: <span className="font-mono font-medium">0%</span></div>
          <div>• Port stay: <span className="font-mono font-medium">100%</span> if <code>uk_ets = true</code>, else 0%</div>
        </div>

        {results.ukEtsResult.legBreakdown.length > 0 ? (
          <div className="overflow-x-auto">
            {/* Screenshot-style compact UK Allowances table */}
            <div className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                UK Allowances (UKAs) — per segment &amp; port
              </div>
              {renderAllowanceTable(ukAllowanceRows, "UKAs (t CO₂)", ukAllowanceTotal)}
              <div className="text-[10px] text-muted-foreground mt-1">
                GB↔GB / NI↔NI = 100%, GB↔NI = 50%, UK↔Non-UK = 0%. UK port stay = 100%.
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Leg</TableHead>
                  <TableHead className="text-xs">Origin</TableHead>
                  <TableHead className="text-xs">Destination</TableHead>
                  <TableHead className="text-xs text-right">Sea Cov</TableHead>
                  <TableHead className="text-xs text-right">Port Cov</TableHead>
                  <TableHead className="text-xs text-right">Factor</TableHead>
                  <TableHead className="text-xs text-right">UK HSFO (t)</TableHead>
                  <TableHead className="text-xs text-right">UK VLSFO (t)</TableHead>
                  <TableHead className="text-xs text-right">UK LSMGO (t)</TableHead>
                  <TableHead className="text-xs text-right">UK CO₂ (t)</TableHead>
                  <TableHead className="text-xs text-right">Chargeable CO₂ (t)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.ukEtsResult.legBreakdown.map((l) => (
                  <TableRow key={l.legIndex}>
                    <TableCell className="font-mono text-xs py-2">Leg {l.legIndex + 1}</TableCell>
                    <TableCell className="text-xs py-2">
                      {l.originPort}
                      <span className="ml-1 text-[10px] uppercase text-muted-foreground">{l.originZone ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      {l.destPort}
                      <span className="ml-1 text-[10px] uppercase text-muted-foreground">{l.destZone ?? "—"}</span>
                    </TableCell>
                    <TableCell className={`font-mono text-xs text-right py-2 ${l.seaCoveragePct === 100 ? 'text-green-600' : l.seaCoveragePct === 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {l.seaCoveragePct}%
                    </TableCell>
                    <TableCell className={`font-mono text-xs text-right py-2 ${l.portCoveragePct === 100 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {l.portCoveragePct}%
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">
                      {(Math.max(l.seaCoveragePct, l.portCoveragePct) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">{l.ukCoveredFuel.hsfo.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">{l.ukCoveredFuel.vlsfo.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2">{l.ukCoveredFuel.lsmgo.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2 text-primary">{l.ukCoveredCo2.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs text-right py-2 font-semibold">{l.chargeableCo2.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-border font-semibold">
                  <TableCell colSpan={6} className="text-xs py-2">TOTAL</TableCell>
                  <TableCell className="font-mono text-xs text-right py-2">{results.ukEtsResult.ukCoveredFuel.hsfo.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs text-right py-2">{results.ukEtsResult.ukCoveredFuel.vlsfo.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs text-right py-2">{results.ukEtsResult.ukCoveredFuel.lsmgo.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs text-right py-2 text-primary">{results.ukEtsResult.ukCoveredCo2.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs text-right py-2 font-bold">{results.ukChargeableCo2.toFixed(2)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-4 text-center">
            No UK-relevant legs (no port has <code>uk_ets = true</code>).
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">UK Voyage Coverage</div>
            <div className="font-mono font-semibold text-lg">{(results.ukEtsVoyageCoverage * 100).toFixed(1)}%</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Chargeable CO₂ (post phase-in)</div>
            <div className="font-mono font-semibold text-lg">{results.ukChargeableCo2.toFixed(2)} t</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">UK ETS Cost</div>
            <div className="font-mono font-semibold text-lg text-red-600">
              ${results.ukEtsCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              @ ${bunker.ukEtsPrice || bunker.co2Price || 0}/t
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════ FUEL EU MARITIME COVERAGE ═══════════════════ */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Fuel className="h-4 w-4 text-emerald-600" />
          FuelEU Maritime — Coverage & Compliance
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
            Year {results.fuelEuResult.voyageYear} · Target ≤ {results.fuelEuResult.ghgLimit.toFixed(2)} gCO₂eq/MJ
          </span>
        </h3>

        <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-1 text-xs text-muted-foreground">
          <div className="font-medium text-sm text-foreground mb-1">EU Coverage Factor (per leg, eu_zone)</div>
          <div>• EU ↔ EU: <span className="font-mono font-medium">100% (1.0)</span> of sea fuel counts</div>
          <div>• EU ↔ Non-EU: <span className="font-mono font-medium">50% (0.5)</span> of sea fuel counts</div>
          <div>• Non-EU ↔ Non-EU: <span className="font-mono font-medium">0% (0.0)</span></div>
          <div>• Port stay at EU port: <span className="font-mono font-medium">100%</span> of port fuel counts</div>
          <div className="pt-1">Penalty rate: <span className="font-mono font-medium">€2,400 / t CO₂eq</span> shortfall (WtW).</div>
        </div>

        {/* Reuse EU ETS leg table for coverage (FuelEU uses the same eu_zone factor) */}
        {legDetails.length > 0 && (
          <div className="overflow-x-auto mb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Leg</TableHead>
                  <TableHead className="text-xs">Origin</TableHead>
                  <TableHead className="text-xs">Destination</TableHead>
                  <TableHead className="text-xs text-right">EU Factor</TableHead>
                  <TableHead className="text-xs text-right">EU HSFO (t)</TableHead>
                  <TableHead className="text-xs text-right">EU VLSFO (t)</TableHead>
                  <TableHead className="text-xs text-right">EU LSMGO (t)</TableHead>
                  <TableHead className="text-xs text-right">EU Energy (GJ)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legDetails.map((l) => {
                  const factor = l.coveragePct / 100;
                  const gj =
                    (l.chargeableHsfo * FUEL_EU_PROPERTIES.hsfo.lcv +
                      l.chargeableVlsfo * FUEL_EU_PROPERTIES.vlsfo.lcv +
                      l.chargeableLsmgo * FUEL_EU_PROPERTIES.lsmgo.lcv) * 1000;
                  return (
                    <TableRow key={l.legIndex}>
                      <TableCell className="font-mono text-xs py-2">Leg {l.legIndex + 1}</TableCell>
                      <TableCell className="text-xs py-2">
                        {l.originPort}
                        <span className={`ml-1 text-[10px] ${l.originIsEu ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {l.originIsEu ? 'EU' : 'Non-EU'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {l.destPort}
                        <span className={`ml-1 text-[10px] ${l.destIsEu ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {l.destIsEu ? 'EU' : 'Non-EU'}
                        </span>
                      </TableCell>
                      <TableCell className={`font-mono text-xs text-right py-2 ${factor === 1 ? 'text-green-600' : factor === 0.5 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {factor.toFixed(2)} ({l.coveragePct}%)
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right py-2">{l.chargeableHsfo.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs text-right py-2">{l.chargeableVlsfo.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs text-right py-2">{l.chargeableLsmgo.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs text-right py-2 text-primary">{gj.toFixed(1)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Per-fuel compliance balance */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {(['hsfo', 'vlsfo', 'lsmgo'] as const).map((ft) => {
            const f = results.fuelEuResult.fuels[ft];
            const compliant = f.balance >= 0;
            return (
              <div key={ft} className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="text-xs font-medium uppercase">{ft}</div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">EU Qty</span>
                  <span className="font-mono">{f.euQuantity.toFixed(2)} t</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">WtW GHG</span>
                  <span className="font-mono">{f.ghg.toFixed(2)} gCO₂eq/MJ</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Balance</span>
                  <span className={`font-mono font-semibold ${compliant ? 'text-emerald-600' : 'text-red-600'}`}>
                    {(f.balance / 1e6).toFixed(2)} tCO₂eq
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Penalty</span>
                  <span className={`font-mono font-semibold ${f.penaltyEur > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    €{f.penaltyEur.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Total EU Energy</div>
            <div className="font-mono font-semibold text-sm">{(results.fuelEuResult.totalEuEnergy / 1e6).toFixed(1)} GJ</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Voyage GHG (WtW)</div>
            <div className="font-mono font-semibold text-sm">{results.fuelEuResult.voyageGhg.toFixed(2)} gCO₂eq/MJ</div>
          </div>
          <div className={`rounded-lg p-3 text-center ${results.fuelEuResult.totalBalance >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
            <div className="text-xs text-muted-foreground">Total Balance</div>
            <div className={`font-mono font-semibold text-sm ${results.fuelEuResult.totalBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {(results.fuelEuResult.totalBalance / 1e6).toFixed(2)} tCO₂eq
            </div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">FuelEU Penalty</div>
            <div className="font-mono font-semibold text-lg text-red-600">
              €{results.fuelEuTotalPenalty.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      {/* CII Rating Section */}
      <div className="mt-6 pt-4 border-t border-border">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Anchor className="h-4 w-4" />
          Step 5: CII Efficiency Rating
        </h3>
        
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <FormulaBlock
              name="Actual CII (Attained)"
              formula="Total CO₂ × 10⁶ / (DWT × Distance)"
              inputs={[
                { label: "Total CO₂", value: `${results.totalCo2.toFixed(2)} t`, source: "Calc" },
                { label: "DWT", value: `${vessel.dwt.toLocaleString()} t`, source: "Vessel" },
                { label: "Distance", value: `${(results.totalDistance + results.totalEcaDistance).toLocaleString()} nm`, source: "Seq" },
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

          <div className="space-y-4">
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
        <h3 className="text-sm font-medium mb-3">Regulatory Summary — EU ETS · UK ETS · FuelEU</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">Total CO₂</div>
            <div className="font-mono font-semibold text-lg">{results.totalCo2.toFixed(1)} t</div>
            <div className="text-[10px] text-muted-foreground mt-1">All voyage fuel</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">EU ETS Chargeable</div>
            <div className="font-mono font-semibold text-lg">{results.chargeableCo2.toFixed(1)} t</div>
            <div className="text-[10px] text-muted-foreground mt-1">{(results.etsVoyageCoverage * 100).toFixed(0)}% cov · {(results.etsPhaseIn * 100).toFixed(0)}% phase-in</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">UK ETS Chargeable</div>
            <div className="font-mono font-semibold text-lg">{results.ukChargeableCo2.toFixed(1)} t</div>
            <div className="text-[10px] text-muted-foreground mt-1">{(results.ukEtsVoyageCoverage * 100).toFixed(0)}% cov · {(results.ukEtsPhaseIn * 100).toFixed(0)}% phase-in</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">EU ETS Cost</div>
            <div className="font-mono font-semibold text-lg text-primary">€{results.etsCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">UK ETS Cost</div>
            <div className="font-mono font-semibold text-lg text-red-600">${results.ukEtsCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground">FuelEU Penalty</div>
            <div className="font-mono font-semibold text-lg text-emerald-700">€{results.fuelEuTotalPenalty.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
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
