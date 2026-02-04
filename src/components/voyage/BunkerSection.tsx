import { ChevronDown, Fuel, Plus, X, Info } from "lucide-react";
import { useState } from "react";
import { useVoyageContext, type FuelAccountingMode } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function BunkerSection() {
  const { 
    bunker, 
    updateBunker, 
    updateBunkerField,
    addPortBunkering,
    removePortBunkering,
    updatePortBunkering,
    results,
    sequence 
  } = useVoyageContext();
  
  const [isExpanded, setIsExpanded] = useState(false); // Start collapsed

  // Get bunkering ports from sequence for dropdown
  const bunkeringPorts = sequence.filter(row => row.operation === "bunkering" && row.port);

  // Calculate total bunkered amounts during voyage
  const totalBunkeredHsfo = bunker.portBunkering.reduce((sum, p) => sum + p.hsfo.quantity, 0);
  const totalBunkeredVlsfo = bunker.portBunkering.reduce((sum, p) => sum + p.vlsfo.quantity, 0);
  const totalBunkeredLsmgo = bunker.portBunkering.reduce((sum, p) => sum + p.lsmgo.quantity, 0);

  // Calculate ROB End (BOB + Bunkered - Consumed)
  const robEndHsfo = bunker.hsfo.robStart + totalBunkeredHsfo - results.hsfoConsumption;
  const robEndVlsfo = bunker.vlsfo.robStart + totalBunkeredVlsfo - results.vlsfoConsumption;
  const robEndLsmgo = bunker.lsmgo.robStart + totalBunkeredLsmgo - results.lsmgoConsumption;

  // Calculate average bunker prices (weighted)
  const getAveragePrice = (fuelType: 'hsfo' | 'vlsfo' | 'lsmgo') => {
    const bobQty = bunker.ignoreBOB ? 0 : bunker[fuelType].robStart;
    const bobPrice = bunker[fuelType].price;
    const bunkeredQty = bunker.portBunkering.reduce((sum, p) => sum + p[fuelType].quantity, 0);
    const bunkeredValue = bunker.portBunkering.reduce((sum, p) => 
      sum + (p[fuelType].quantity * p[fuelType].price), 0);
    
    const totalQty = bobQty + bunkeredQty;
    const totalValue = (bobQty * bobPrice) + bunkeredValue;
    
    return totalQty > 0 ? totalValue / totalQty : bobPrice;
  };

  // Add bunkering port from sequence
  const handleAddBunkeringPort = (portUnloc: string) => {
    const port = bunkeringPorts.find(p => p.portUnloc === portUnloc);
    if (port) {
      addPortBunkering(port.portUnloc, port.port);
    }
  };

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Fuel className="h-3.5 w-3.5" />
          <span>Bunker</span>
          <span className="text-[9px] font-normal text-section-header-foreground/70 ml-2">
            Cost: ${results.totalBunkerCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-2 space-y-3">
          {/* Global Controls Row - CO2 Price, Pricing Mode, Ignore BOB, Reward Factor */}
          <div className="grid grid-cols-4 gap-4 items-end">
            {/* CO2 Price */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                CO₂ Price
              </label>
              <div className="input-with-unit">
                <input
                  type="number"
                  className="form-input w-20 font-mono text-right"
                  value={bunker.co2Price || ""}
                  onChange={(e) => updateBunkerField("co2Price", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <span className="unit">$/t</span>
              </div>
            </div>

            {/* Fuel Accounting Mode (Average / FIFO) */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Fuel Pricing
              </label>
              <RadioGroup
                value={bunker.fuelMode}
                onValueChange={(value) => updateBunkerField("fuelMode", value as FuelAccountingMode)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="average" id="average" className="h-3 w-3" />
                  <Label htmlFor="average" className="text-xs cursor-pointer">Average</Label>
                </div>
                <div className="flex items-center space-x-1">
                  <RadioGroupItem value="fifo" id="fifo" className="h-3 w-3" />
                  <Label htmlFor="fifo" className="text-xs cursor-pointer">FIFO</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Ignore BOB Checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="ignoreBOB"
                checked={bunker.ignoreBOB}
                onCheckedChange={(checked) => updateBunkerField("ignoreBOB", checked === true)}
              />
              <Label htmlFor="ignoreBOB" className="text-xs cursor-pointer">
                Ignore BOB
              </Label>
              <InfoTooltip 
                formula="Excludes starting onboard fuel from pricing calculations" 
                description="When enabled, voyage bunker cost ignores BOB fuel inventory"
              />
            </div>

            {/* Reward Factor */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1">
                Reward Factor
                <InfoTooltip 
                  formula="Consumption × Reward Factor" 
                  description="Multiplier for wind-assisted propulsion (1.0 = normal)"
                />
              </label>
              <input
                type="number"
                step="0.01"
                className="form-input w-20 font-mono text-right"
                value={bunker.rewardFactor}
                onChange={(e) => updateBunkerField("rewardFactor", parseFloat(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* BOB (Bunker On Board) Table */}
          <div className="border border-border rounded-md overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 border-b border-border">
              <span className="text-xs font-medium">BOB (Bunker On Board)</span>
            </div>
            <div className="p-3">
              {/* Header Row */}
              <div className="grid grid-cols-4 gap-3 text-xs mb-2 pb-2 border-b border-border">
                <div className="font-medium text-muted-foreground">Fuel Type</div>
                <div className="font-medium text-muted-foreground text-right">Quantity (t)</div>
                <div className="font-medium text-muted-foreground text-center">@</div>
                <div className="font-medium text-muted-foreground text-right">Price (USD/t)</div>
              </div>

              {/* HSFO Row */}
              <div className="grid grid-cols-4 gap-3 text-xs items-center mb-2">
                <div className="font-medium">HSFO</div>
                <input
                  type="number"
                  className="form-input-sm font-mono text-right"
                  value={bunker.hsfo.robStart || ""}
                  onChange={(e) => updateBunker("hsfo", "robStart", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <div className="text-center text-muted-foreground">@</div>
                <input
                  type="number"
                  className="form-input-sm font-mono text-right"
                  value={bunker.hsfo.price || ""}
                  onChange={(e) => updateBunker("hsfo", "price", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>

              {/* VLSFO Row */}
              <div className="grid grid-cols-4 gap-3 text-xs items-center mb-2">
                <div className="font-medium">VLSFO</div>
                <input
                  type="number"
                  className="form-input-sm font-mono text-right"
                  value={bunker.vlsfo.robStart || ""}
                  onChange={(e) => updateBunker("vlsfo", "robStart", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <div className="text-center text-muted-foreground">@</div>
                <input
                  type="number"
                  className="form-input-sm font-mono text-right"
                  value={bunker.vlsfo.price || ""}
                  onChange={(e) => updateBunker("vlsfo", "price", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>

              {/* LSMGO Row */}
              <div className="grid grid-cols-4 gap-3 text-xs items-center">
                <div className="font-medium">LSMGO</div>
                <input
                  type="number"
                  className="form-input-sm font-mono text-right"
                  value={bunker.lsmgo.robStart || ""}
                  onChange={(e) => updateBunker("lsmgo", "robStart", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <div className="text-center text-muted-foreground">@</div>
                <input
                  type="number"
                  className="form-input-sm font-mono text-right"
                  value={bunker.lsmgo.price || ""}
                  onChange={(e) => updateBunker("lsmgo", "price", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Port Fuel Price Table */}
          <div className="border border-border rounded-md overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium">Port Fuel Prices</span>
              {bunkeringPorts.length > 0 && (
                <Select onValueChange={handleAddBunkeringPort}>
                  <SelectTrigger className="w-36 h-7 text-xs">
                    <SelectValue placeholder="Add port..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bunkeringPorts
                      .filter(p => !bunker.portBunkering.find(pb => pb.portUnloc === p.portUnloc))
                      .map(port => (
                        <SelectItem key={port.id} value={port.portUnloc} className="text-xs">
                          {port.port}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            <div className="p-3">
              {bunker.portBunkering.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-3">
                  No port bunkering. Add a bunkering operation in the sequence first.
                </div>
              ) : (
                <div className="space-y-3">
                  {bunker.portBunkering.map((port) => (
                    <div key={port.id} className="border border-border rounded p-2 bg-muted/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold">{port.portName}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePortBunkering(port.id)}
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {/* Fuel Grid: Type | Qty @ Price */}
                      <div className="space-y-1.5">
                        {/* HSFO */}
                        <div className="grid grid-cols-5 gap-2 text-xs items-center">
                          <span className="text-muted-foreground">HSFO</span>
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right"
                            value={port.hsfo.quantity || ""}
                            onChange={(e) => updatePortBunkering(port.id, "hsfo", "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-center text-muted-foreground">@</span>
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right"
                            value={port.hsfo.price || ""}
                            onChange={(e) => updatePortBunkering(port.id, "hsfo", "price", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-muted-foreground text-xs">USD/t</span>
                        </div>
                        
                        {/* VLSFO */}
                        <div className="grid grid-cols-5 gap-2 text-xs items-center">
                          <span className="text-muted-foreground">VLSFO</span>
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right"
                            value={port.vlsfo.quantity || ""}
                            onChange={(e) => updatePortBunkering(port.id, "vlsfo", "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-center text-muted-foreground">@</span>
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right"
                            value={port.vlsfo.price || ""}
                            onChange={(e) => updatePortBunkering(port.id, "vlsfo", "price", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-muted-foreground text-xs">USD/t</span>
                        </div>
                        
                        {/* LSMGO */}
                        <div className="grid grid-cols-5 gap-2 text-xs items-center">
                          <span className="text-muted-foreground">LSMGO</span>
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right"
                            value={port.lsmgo.quantity || ""}
                            onChange={(e) => updatePortBunkering(port.id, "lsmgo", "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-center text-muted-foreground">@</span>
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right"
                            value={port.lsmgo.price || ""}
                            onChange={(e) => updatePortBunkering(port.id, "lsmgo", "price", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <span className="text-muted-foreground text-xs">USD/t</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bunker Summary Panel (Read Only) */}
          <div className="border border-border rounded-md overflow-hidden bg-muted/20">
            <div className="px-3 py-2 bg-muted/30 border-b border-border">
              <span className="text-xs font-medium flex items-center gap-1">
                Bunker Summary
                <InfoTooltip 
                  formula="Consumption = Vessel Daily Rate × Voyage Time" 
                  description="All values auto-calculated from vessel specs and voyage sequence"
                />
              </span>
            </div>
            
            <div className="p-3">
              {/* Summary Grid */}
              <div className="grid grid-cols-5 gap-2 text-xs mb-2 pb-1 border-b border-border">
                <div className="font-medium text-muted-foreground">Fuel</div>
                <div className="font-medium text-muted-foreground text-right">Consumed (t)</div>
                <div className="font-medium text-muted-foreground text-right">Avg Price</div>
                <div className="font-medium text-muted-foreground text-right">Cost ($)</div>
                <div className="font-medium text-muted-foreground text-right">ROB End</div>
              </div>

              {/* HSFO */}
              <div className="grid grid-cols-5 gap-2 text-xs items-center mb-1">
                <div className="font-medium">HSFO</div>
                <div className="font-mono text-right">{results.hsfoConsumption.toFixed(2)}</div>
                <div className="font-mono text-right">{getAveragePrice('hsfo').toFixed(0)}</div>
                <div className="font-mono text-right">{(results.hsfoConsumption * getAveragePrice('hsfo')).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className={`font-mono text-right ${robEndHsfo < 0 ? 'text-destructive font-semibold' : ''}`}>
                  {robEndHsfo.toFixed(1)}
                </div>
              </div>

              {/* VLSFO */}
              <div className="grid grid-cols-5 gap-2 text-xs items-center mb-1">
                <div className="font-medium">VLSFO</div>
                <div className="font-mono text-right">{results.vlsfoConsumption.toFixed(2)}</div>
                <div className="font-mono text-right">{getAveragePrice('vlsfo').toFixed(0)}</div>
                <div className="font-mono text-right">{(results.vlsfoConsumption * getAveragePrice('vlsfo')).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className={`font-mono text-right ${robEndVlsfo < 0 ? 'text-destructive font-semibold' : ''}`}>
                  {robEndVlsfo.toFixed(1)}
                </div>
              </div>

              {/* LSMGO */}
              <div className="grid grid-cols-5 gap-2 text-xs items-center">
                <div className="font-medium">LSMGO</div>
                <div className="font-mono text-right">{results.lsmgoConsumption.toFixed(2)}</div>
                <div className="font-mono text-right">{getAveragePrice('lsmgo').toFixed(0)}</div>
                <div className="font-mono text-right">{(results.lsmgoConsumption * getAveragePrice('lsmgo')).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className={`font-mono text-right ${robEndLsmgo < 0 ? 'text-destructive font-semibold' : ''}`}>
                  {robEndLsmgo.toFixed(1)}
                </div>
              </div>

              {/* Totals Row */}
              <div className="border-t border-border pt-2 mt-2 grid grid-cols-2 gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Total Consumption:</span>
                  <span className="font-mono font-semibold">
                    {(results.hsfoConsumption + results.vlsfoConsumption + results.lsmgoConsumption).toFixed(1)} t
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Total Bunker Cost:</span>
                  <span className="font-mono font-semibold text-primary">
                    ${results.totalBunkerCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* CO2 Row */}
              {bunker.co2Price > 0 && (
                <div className="border-t border-border pt-2 mt-2 flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">CO₂ Emissions:</span>
                    <span className="font-mono">{results.totalCo2.toFixed(2)} t</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">CO₂ Cost:</span>
                    <span className="font-mono">${(results.totalCo2 * bunker.co2Price).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">CII Rating:</span>
                    <span className={`font-mono font-semibold ${
                      results.ciiRating === 'A' ? 'text-green-600' :
                      results.ciiRating === 'B' ? 'text-lime-600' :
                      results.ciiRating === 'C' ? 'text-yellow-600' :
                      results.ciiRating === 'D' ? 'text-orange-600' :
                      'text-red-600'
                    }`}>{results.ciiRating}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
