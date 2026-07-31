import React, { useState } from "react";
import { ChevronDown, Fuel, X } from "lucide-react";
import { useVoyageContext, type FuelAccountingMode } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";
import { buildFuelPricing, effectivePrice } from "@/utils/bunkerPricing";
import { computeFifoCoverage } from "@/utils/fuelBreakdown";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function BunkerSection() {
  const { 
    bunker, updateBunker, updateBunkerField, addPortBunkering, removePortBunkering,
    updatePortBunkering, results, sequence, vessel 
  } = useVoyageContext();
  
  const [isExpanded, setIsExpanded] = useState(true);
  const bunkeringPorts = sequence.filter(row => row.operation === "bunkering" && row.port);

  const totalBunkeredHsfo = bunker.portBunkering.reduce((sum, p) => sum + p.hsfo.quantity, 0);
  const totalBunkeredVlsfo = bunker.portBunkering.reduce((sum, p) => sum + p.vlsfo.quantity, 0);
  const totalBunkeredLsmgo = bunker.portBunkering.reduce((sum, p) => sum + p.lsmgo.quantity, 0);

  const robEndHsfo = bunker.hsfo.robStart + totalBunkeredHsfo - results.hsfoConsumption;
  const robEndVlsfo = bunker.vlsfo.robStart + totalBunkeredVlsfo - results.vlsfoConsumption;
  const robEndLsmgo = bunker.lsmgo.robStart + totalBunkeredLsmgo - results.lsmgoConsumption;

  const consumptionOf = {
    hsfo: results.hsfoConsumption,
    vlsfo: results.vlsfoConsumption,
    lsmgo: results.lsmgoConsumption,
  } as const;

  // Same consumption-weighted FIFO coverage the engine uses.
  const fifoCoverage = computeFifoCoverage(
    sequence,
    vessel,
    bunker.portBunkering.map((p) => p.portUnloc),
    bunker.rewardFactor ?? 1,
  );

  // Mirrors the calculation engine: average / FIFO / ignore-BOB pricing
  const getAveragePrice = (fuelType: 'hsfo' | 'vlsfo' | 'lsmgo') =>
    effectivePrice(buildFuelPricing(bunker, fuelType, fifoCoverage[fuelType]), consumptionOf[fuelType]);

  const handleAddBunkeringPort = (portUnloc: string) => {
    const port = bunkeringPorts.find(p => p.portUnloc === portUnloc);
    if (port) addPortBunkering(port.portUnloc, port.port);
  };

  const fuels = ["hsfo", "vlsfo", "lsmgo"] as const;

  return (
    <div className="calc-card-row">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Bunker"
      >
        <span>Bunker</span>
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 p-3 space-y-3">
          {/* Global Controls - single line */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">EU ETS</span>
              <input type="number" className="form-input-sm w-16 font-mono text-right text-xs"
                value={bunker.euEtsPrice || ""} onChange={(e) => updateBunkerField("euEtsPrice", parseFloat(e.target.value) || 0)} placeholder="0" />
              <span className="text-[10px] text-muted-foreground">$/t</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">UK ETS</span>
              <input type="number" className="form-input-sm w-16 font-mono text-right text-xs"
                value={bunker.ukEtsPrice || ""} onChange={(e) => updateBunkerField("ukEtsPrice", parseFloat(e.target.value) || 0)} placeholder="0" />
              <span className="text-[10px] text-muted-foreground">$/t</span>
            </div>
            {bunker.portBunkering.length > 0 && (
            <>
            <RadioGroup value={bunker.fuelMode} onValueChange={(value) => updateBunkerField("fuelMode", value as FuelAccountingMode)} className="flex gap-3 items-center">
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="average" id="average" className="h-3.5 w-3.5" />
                <Label htmlFor="average" className="text-[10px] cursor-pointer">Avg</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="fifo" id="fifo" className="h-3.5 w-3.5" />
                <Label htmlFor="fifo" className="text-[10px] cursor-pointer">FIFO</Label>
              </div>
            </RadioGroup>
            <div className="flex items-center gap-1">
              <Checkbox id="ignoreBOB" checked={bunker.ignoreBOB} onCheckedChange={(checked) => updateBunkerField("ignoreBOB", checked === true)} className="h-3.5 w-3.5" />
              <Label htmlFor="ignoreBOB" className="text-[10px] cursor-pointer">Ignore BOB</Label>
            </div>
            </>
            )}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Reward</span>
              <input type="number" step="0.01" className="form-input-sm w-14 font-mono text-right text-xs"
                value={bunker.rewardFactor} onChange={(e) => updateBunkerField("rewardFactor", parseFloat(e.target.value) || 1)} />
            </div>
          </div>

          {/* BOB - single row layout */}
          <div className="border border-border rounded overflow-hidden">
            <div className="subsection-header px-2 py-1 text-[10px] font-medium border-b border-border">BOB</div>
            <div className="flex divide-x divide-border">
              {fuels.map(fuel => (
                <div key={fuel} className="flex-1 flex items-center gap-1 px-2 py-1">
                  <span className="text-[10px] font-medium w-12">{fuel.toUpperCase()}</span>
                  <input type="number" className="form-input-sm w-16 font-mono text-right text-xs"
                    value={bunker[fuel].price || ""} onChange={(e) => updateBunker(fuel, "price", parseFloat(e.target.value) || 0)} placeholder="0" />
                  <span className="text-[9px] text-muted-foreground">$/t</span>
                </div>
              ))}
            </div>
          </div>

          {/* Port Bunkering - tabular (only when bunkering ports exist in sequence) */}
          {bunkeringPorts.length > 0 && (
          <div className="border border-border rounded overflow-hidden">
            <div className="subsection-header px-2 py-1 border-b border-border flex items-center justify-between">
              <span className="text-[10px] font-medium">Port Fuel Prices</span>
              {bunkeringPorts.length > 0 && (
                <Select onValueChange={handleAddBunkeringPort}>
                  <SelectTrigger className="w-28 h-6 text-[10px]"><SelectValue placeholder="Add port..." /></SelectTrigger>
                  <SelectContent>
                    {bunkeringPorts
                      .filter(p => !bunker.portBunkering.find(pb => pb.portUnloc === p.portUnloc))
                      .map(port => (
                        <SelectItem key={port.id} value={port.portUnloc} className="text-xs">{port.port}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {bunker.portBunkering.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-2">No bunkering ports in sequence.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="subsection-header">
                    <th className="text-left px-2 py-1 text-[10px] font-medium">Port</th>
                    <th className="text-center px-1 py-1 text-[10px] font-medium">HSFO</th>
                    <th className="text-center px-1 py-1 text-[10px] font-medium">VLSFO</th>
                    <th className="text-center px-1 py-1 text-[10px] font-medium">LSMGO</th>
                    <th className="w-6"></th>
                  </tr>
                  <tr className="subsection-header border-t border-border">
                    <th></th>
                    <th className="text-right px-1 py-0.5 text-[9px] text-muted-foreground font-normal">$/t</th>
                    <th className="text-right px-1 py-0.5 text-[9px] text-muted-foreground font-normal">$/t</th>
                    <th className="text-right px-1 py-0.5 text-[9px] text-muted-foreground font-normal">$/t</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bunker.portBunkering.map((port) => (
                    <tr key={port.id} className="border-t border-border">
                      <td className="px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">{port.portName}</td>
                      {fuels.map(fuel => (
                        <React.Fragment key={fuel}>
                          <td className="px-0.5 py-0.5">
                            <input type="number" className="form-input-sm w-full font-mono text-right text-xs"
                              value={port[fuel].price || ""} onChange={(e) => updatePortBunkering(port.id, fuel, "price", parseFloat(e.target.value) || 0)} placeholder="0" />
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="px-0.5 py-0.5">
                        <Button variant="ghost" size="sm" onClick={() => removePortBunkering(port.id)} className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          )}

          {/* Summary - only when bunkering ports exist */}
          {bunkeringPorts.length > 0 && (
          <details className="border border-border rounded overflow-hidden">
            <summary className="subsection-header px-2 py-1 cursor-pointer text-[10px] font-medium flex items-center justify-between">
              <span>Summary</span>
              <span className="font-mono text-primary">${results.totalBunkerCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </summary>
            <table className="w-full text-xs">
              <thead>
                <tr className="subsection-header">
                  <th className="text-left px-2 py-1 text-[10px] font-medium">Fuel</th>
                  <th className="text-right px-2 py-1 text-[10px] font-medium">Consumed</th>
                  <th className="text-right px-2 py-1 text-[10px] font-medium">Avg $/t</th>
                  <th className="text-right px-2 py-1 text-[10px] font-medium">Cost</th>
                  <th className="text-right px-2 py-1 text-[10px] font-medium">ROB End</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { label: "HSFO", consumed: results.hsfoConsumption, price: getAveragePrice('hsfo'), robEnd: robEndHsfo },
                  { label: "VLSFO", consumed: results.vlsfoConsumption, price: getAveragePrice('vlsfo'), robEnd: robEndVlsfo },
                  { label: "LSMGO", consumed: results.lsmgoConsumption, price: getAveragePrice('lsmgo'), robEnd: robEndLsmgo },
                ] as const).map(f => (
                  <tr key={f.label} className="border-t border-border">
                    <td className="px-2 py-0.5 text-[10px] font-medium">{f.label}</td>
                    <td className="px-2 py-0.5 font-mono text-right text-[10px]">{f.consumed.toFixed(1)} t</td>
                    <td className="px-2 py-0.5 font-mono text-right text-[10px]">${f.price.toFixed(0)}</td>
                    <td className="px-2 py-0.5 font-mono text-right text-[10px]">${(f.consumed * f.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-2 py-0.5 font-mono text-right text-[10px]">{f.robEnd.toFixed(1)} t</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          )}
        </div>
      )}
    </div>
  );
}


