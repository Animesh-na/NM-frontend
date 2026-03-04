import { ChevronDown, Fuel, Plus, X } from "lucide-react";
import { useState } from "react";
import { useVoyageContext, type FuelAccountingMode } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";
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
    updatePortBunkering, results, sequence 
  } = useVoyageContext();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const bunkeringPorts = sequence.filter(row => row.operation === "bunkering" && row.port);

  const totalBunkeredHsfo = bunker.portBunkering.reduce((sum, p) => sum + p.hsfo.quantity, 0);
  const totalBunkeredVlsfo = bunker.portBunkering.reduce((sum, p) => sum + p.vlsfo.quantity, 0);
  const totalBunkeredLsmgo = bunker.portBunkering.reduce((sum, p) => sum + p.lsmgo.quantity, 0);

  const robEndHsfo = bunker.hsfo.robStart + totalBunkeredHsfo - results.hsfoConsumption;
  const robEndVlsfo = bunker.vlsfo.robStart + totalBunkeredVlsfo - results.vlsfoConsumption;
  const robEndLsmgo = bunker.lsmgo.robStart + totalBunkeredLsmgo - results.lsmgoConsumption;

  const getAveragePrice = (fuelType: 'hsfo' | 'vlsfo' | 'lsmgo') => {
    const bobQty = bunker.ignoreBOB ? 0 : bunker[fuelType].robStart;
    const bobPrice = bunker[fuelType].price;
    const bunkeredQty = bunker.portBunkering.reduce((sum, p) => sum + p[fuelType].quantity, 0);
    const bunkeredValue = bunker.portBunkering.reduce((sum, p) => sum + (p[fuelType].quantity * p[fuelType].price), 0);
    const totalQty = bobQty + bunkeredQty;
    const totalValue = (bobQty * bobPrice) + bunkeredValue;
    return totalQty > 0 ? totalValue / totalQty : bobPrice;
  };

  const handleAddBunkeringPort = (portUnloc: string) => {
    const port = bunkeringPorts.find(p => p.portUnloc === portUnloc);
    if (port) addPortBunkering(port.portUnloc, port.port);
  };

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Fuel className="h-4 w-4" />
          <span>Bunker</span>
          <span className="text-[10px] font-normal text-muted-foreground ml-2">
            Cost: ${results.totalBunkerCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Global Controls */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="form-field w-28">
              <label className="form-label">CO₂ Price</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono text-right"
                  value={bunker.co2Price || ""}
                  onChange={(e) => updateBunkerField("co2Price", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <span className="unit">$/t</span>
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Fuel Pricing</label>
              <RadioGroup
                value={bunker.fuelMode}
                onValueChange={(value) => updateBunkerField("fuelMode", value as FuelAccountingMode)}
                className="flex gap-4 h-7 items-center"
              >
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="average" id="average" className="h-4 w-4" />
                  <Label htmlFor="average" className="text-xs cursor-pointer">Average</Label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="fifo" id="fifo" className="h-4 w-4" />
                  <Label htmlFor="fifo" className="text-xs cursor-pointer">FIFO</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center gap-2 pb-1">
              <Checkbox id="ignoreBOB" checked={bunker.ignoreBOB} onCheckedChange={(checked) => updateBunkerField("ignoreBOB", checked === true)} className="h-4 w-4" />
              <Label htmlFor="ignoreBOB" className="text-xs cursor-pointer">Ignore BOB</Label>
              <InfoTooltip formula="Excludes starting fuel from pricing" description="When enabled, ignores BOB inventory" />
            </div>

            <div className="form-field w-24">
              <label className="form-label flex items-center gap-1">
                Reward Factor
                <InfoTooltip formula="Consumption × Factor" description="Wind-assisted propulsion multiplier" />
              </label>
              <input
                type="number" step="0.01"
                className="form-input-sm w-full font-mono text-right"
                value={bunker.rewardFactor}
                onChange={(e) => updateBunkerField("rewardFactor", parseFloat(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* BOB Section */}
          <div className="border border-border rounded-md overflow-hidden">
            <div className="subsection-header px-4 py-2 border-b border-border">
              BOB (Bunker On Board)
            </div>
            <div className="p-4 space-y-3">
              {(["hsfo", "vlsfo", "lsmgo"] as const).map(fuel => (
                <div key={fuel} className="flex flex-wrap gap-4 items-end">
                  <div className="w-16 text-xs font-medium pb-1">{fuel.toUpperCase()}</div>
                  <div className="form-field w-28">
                    <label className="form-label">Quantity (t)</label>
                    <input
                      type="number"
                      className="form-input-sm w-full font-mono text-right"
                      value={bunker[fuel].robStart || ""}
                      onChange={(e) => updateBunker(fuel, "robStart", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground pb-1">@</div>
                  <div className="form-field w-28">
                    <label className="form-label">Price ($/t)</label>
                    <input
                      type="number"
                      className="form-input-sm w-full font-mono text-right"
                      value={bunker[fuel].price || ""}
                      onChange={(e) => updateBunker(fuel, "price", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Port Bunkering */}
          <div className="border border-border rounded-md overflow-hidden">
            <div className="subsection-header px-4 py-2 border-b border-border flex items-center justify-between">
              <span>Port Fuel Prices</span>
              {bunkeringPorts.length > 0 && (
                <Select onValueChange={handleAddBunkeringPort}>
                  <SelectTrigger className="w-36 h-7 text-xs">
                    <SelectValue placeholder="Add port..." />
                  </SelectTrigger>
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
            <div className="p-4">
              {bunker.portBunkering.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No port bunkering. Add a bunkering operation in the sequence first.
                </p>
              ) : (
                <div className="space-y-4">
                  {bunker.portBunkering.map((port) => (
                    <div key={port.id} className="border border-border rounded-md p-4 bg-card">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold">{port.portName}</span>
                        <Button variant="ghost" size="sm" onClick={() => removePortBunkering(port.id)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {(["hsfo", "vlsfo", "lsmgo"] as const).map(fuel => (
                          <div key={fuel} className="flex flex-wrap gap-4 items-end">
                            <div className="w-16 text-xs text-muted-foreground pb-1">{fuel.toUpperCase()}</div>
                            <div className="form-field w-24">
                              <input type="number" className="form-input-sm w-full font-mono text-right"
                                value={port[fuel].quantity || ""}
                                onChange={(e) => updatePortBunkering(port.id, fuel, "quantity", parseFloat(e.target.value) || 0)}
                                placeholder="0" />
                            </div>
                            <span className="text-xs text-muted-foreground pb-1">@</span>
                            <div className="form-field w-24">
                              <input type="number" className="form-input-sm w-full font-mono text-right"
                                value={port[fuel].price || ""}
                                onChange={(e) => updatePortBunkering(port.id, fuel, "price", parseFloat(e.target.value) || 0)}
                                placeholder="0" />
                            </div>
                            <span className="text-xs text-muted-foreground pb-1">$/t</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bunker Summary */}
          <div className="border border-border rounded-md overflow-hidden">
            <div className="subsection-header px-4 py-2 border-b border-border flex items-center gap-1">
              Bunker Summary
              <InfoTooltip formula="Consumption = Vessel Daily Rate × Voyage Time" description="All values auto-calculated" />
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-6">
                {([ 
                  { label: "HSFO", consumed: results.hsfoConsumption, price: getAveragePrice('hsfo'), robEnd: robEndHsfo },
                  { label: "VLSFO", consumed: results.vlsfoConsumption, price: getAveragePrice('vlsfo'), robEnd: robEndVlsfo },
                  { label: "LSMGO", consumed: results.lsmgoConsumption, price: getAveragePrice('lsmgo'), robEnd: robEndLsmgo },
                ] as const).map(fuel => (
                  <div key={fuel.label} className="space-y-1 min-w-[140px]">
                    <div className="text-xs font-semibold">{fuel.label}</div>
                    <div className="text-xs text-muted-foreground">Consumed: <span className="font-mono text-foreground">{fuel.consumed.toFixed(2)} t</span></div>
                    <div className="text-xs text-muted-foreground">Avg Price: <span className="font-mono text-foreground">${fuel.price.toFixed(0)}</span></div>
                    <div className="text-xs text-muted-foreground">Cost: <span className="font-mono text-foreground">${(fuel.consumed * fuel.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                    <div className="text-xs text-muted-foreground">ROB End: <span className="font-mono text-foreground">{fuel.robEnd.toFixed(1)} t</span></div>
                  </div>
                ))}
              </div>
              
              <div className="border-t border-border mt-3 pt-3 flex flex-wrap gap-6 text-xs">
                <div>Total Cost: <span className="font-mono font-semibold text-primary">${results.totalBunkerCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                <div>CO₂ Cost: <span className="font-mono">${results.co2Cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
