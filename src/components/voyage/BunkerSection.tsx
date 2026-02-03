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
  
  const [isExpanded, setIsExpanded] = useState(true);
  const [isBOBExpanded, setIsBOBExpanded] = useState(true);
  const [isPortBunkeringExpanded, setIsPortBunkeringExpanded] = useState(true);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);

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
    const bobQty = bunker[fuelType].robStart;
    const bobPrice = bunker[fuelType].price;
    const bunkeredQty = bunker.portBunkering.reduce((sum, p) => sum + p[fuelType].quantity, 0);
    const bunkeredValue = bunker.portBunkering.reduce((sum, p) => 
      sum + (p[fuelType].quantity * p[fuelType].price), 0);
    
    const totalQty = bobQty + bunkeredQty;
    const totalValue = (bobQty * bobPrice) + bunkeredValue;
    
    return totalQty > 0 ? totalValue / totalQty : bobPrice;
  };

  // Calculate total bunker cost including port bunkering
  const calculateTotalBunkerCost = () => {
    const bobCost = 
      (bunker.hsfo.robStart * bunker.hsfo.price) +
      (bunker.vlsfo.robStart * bunker.vlsfo.price) +
      (bunker.lsmgo.robStart * bunker.lsmgo.price);
    
    const portCost = bunker.portBunkering.reduce((sum, p) => 
      sum + 
      (p.hsfo.quantity * p.hsfo.price) +
      (p.vlsfo.quantity * p.vlsfo.price) +
      (p.lsmgo.quantity * p.lsmgo.price)
    , 0);
    
    const co2Cost = results.totalCo2 * bunker.co2Price;
    
    return bobCost + portCost + co2Cost;
  };

  // Add bunkering port from sequence
  const handleAddBunkeringPort = (portUnloc: string) => {
    const port = bunkeringPorts.find(p => p.portUnloc === portUnloc);
    if (port) {
      addPortBunkering(port.portUnloc, port.port);
    }
  };

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Fuel className="h-4 w-4" />
          <span>Bunker</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3 space-y-4">
          {/* Global Controls Row */}
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

            {/* Fuel Accounting Mode */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Fuel Accounting
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
                formula="If enabled, voyage bunker calculation ignores starting onboard fuel" 
                description="Use when BOB fuel should not be included in cost modeling"
              />
            </div>

            {/* Reward Factor */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1">
                Reward Factor
                <InfoTooltip 
                  formula="Consumption × Reward Factor" 
                  description="Multiplier for wind-assisted propulsion efficiency (1.0 = normal)"
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
          <div className="border border-border rounded-md">
            <button
              onClick={() => setIsBOBExpanded(!isBOBExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs font-medium">BOB (Bunker On Board)</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${isBOBExpanded ? "" : "-rotate-90"}`} />
            </button>
            
            {isBOBExpanded && (
              <div className="p-3">
                <div className="grid grid-cols-5 gap-3 text-xs mb-2">
                  <div className="font-medium text-muted-foreground">Fuel Type</div>
                  <div className="font-medium text-muted-foreground text-center">Qty (t)</div>
                  <div className="font-medium text-muted-foreground text-center">Price ($/t)</div>
                  <div className="font-medium text-muted-foreground text-center">Value ($)</div>
                  <div className="font-medium text-muted-foreground text-center">Currency</div>
                </div>

                {/* HSFO Row */}
                <div className="grid grid-cols-5 gap-3 text-xs items-center mb-2">
                  <div className="font-medium">HSFO</div>
                  <div>
                    <input
                      type="number"
                      className="form-input-sm w-full font-mono text-right"
                      value={bunker.hsfo.robStart || ""}
                      onChange={(e) => updateBunker("hsfo", "robStart", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      className="form-input-sm w-full font-mono text-right"
                      value={bunker.hsfo.price || ""}
                      onChange={(e) => updateBunker("hsfo", "price", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div className="font-mono text-right bg-muted px-2 py-1 rounded">
                    {(bunker.hsfo.robStart * bunker.hsfo.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-center text-muted-foreground">USD/t</div>
                </div>

                {/* VLSFO Row */}
                <div className="grid grid-cols-5 gap-3 text-xs items-center mb-2">
                  <div className="font-medium">VLSFO</div>
                  <div>
                    <input
                      type="number"
                      className="form-input-sm w-full font-mono text-right"
                      value={bunker.vlsfo.robStart || ""}
                      onChange={(e) => updateBunker("vlsfo", "robStart", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      className="form-input-sm w-full font-mono text-right"
                      value={bunker.vlsfo.price || ""}
                      onChange={(e) => updateBunker("vlsfo", "price", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div className="font-mono text-right bg-muted px-2 py-1 rounded">
                    {(bunker.vlsfo.robStart * bunker.vlsfo.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-center text-muted-foreground">USD/t</div>
                </div>

                {/* LSMGO Row */}
                <div className="grid grid-cols-5 gap-3 text-xs items-center">
                  <div className="font-medium">LSMGO</div>
                  <div>
                    <input
                      type="number"
                      className="form-input-sm w-full font-mono text-right"
                      value={bunker.lsmgo.robStart || ""}
                      onChange={(e) => updateBunker("lsmgo", "robStart", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      className="form-input-sm w-full font-mono text-right"
                      value={bunker.lsmgo.price || ""}
                      onChange={(e) => updateBunker("lsmgo", "price", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div className="font-mono text-right bg-muted px-2 py-1 rounded">
                    {(bunker.lsmgo.robStart * bunker.lsmgo.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-center text-muted-foreground">USD/t</div>
                </div>
              </div>
            )}
          </div>

          {/* Port Bunkering Table */}
          <div className="border border-border rounded-md">
            <button
              onClick={() => setIsPortBunkeringExpanded(!isPortBunkeringExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs font-medium">Port Bunkering</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${isPortBunkeringExpanded ? "" : "-rotate-90"}`} />
            </button>
            
            {isPortBunkeringExpanded && (
              <div className="p-3 space-y-3">
                {/* Add bunkering port selector */}
                {bunkeringPorts.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select onValueChange={handleAddBunkeringPort}>
                      <SelectTrigger className="w-48 h-8 text-xs">
                        <SelectValue placeholder="Add bunkering port..." />
                      </SelectTrigger>
                      <SelectContent>
                        {bunkeringPorts.map(port => (
                          <SelectItem key={port.id} value={port.portUnloc} className="text-xs">
                            {port.port}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      or add bunkering operation in sequence
                    </span>
                  </div>
                )}

                {bunker.portBunkering.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    No port bunkering events. Add a bunkering operation in the sequence first.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bunker.portBunkering.map((port) => (
                      <div key={port.id} className="border border-border rounded p-2 bg-muted/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium">{port.portName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removePortBunkering(port.id)}
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-7 gap-2 text-xs">
                          <div></div>
                          <div className="text-center text-muted-foreground col-span-2">HSFO</div>
                          <div className="text-center text-muted-foreground col-span-2">VLSFO</div>
                          <div className="text-center text-muted-foreground col-span-2">LSMGO</div>
                        </div>
                        <div className="grid grid-cols-7 gap-2 text-xs mt-1">
                          <div className="text-muted-foreground">Qty (t)</div>
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right col-span-2"
                            value={port.hsfo.quantity || ""}
                            onChange={(e) => updatePortBunkering(port.id, "hsfo", "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right col-span-2"
                            value={port.vlsfo.quantity || ""}
                            onChange={(e) => updatePortBunkering(port.id, "vlsfo", "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right col-span-2"
                            value={port.lsmgo.quantity || ""}
                            onChange={(e) => updatePortBunkering(port.id, "lsmgo", "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </div>
                        <div className="grid grid-cols-7 gap-2 text-xs mt-1">
                          <div className="text-muted-foreground">$/t</div>
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right col-span-2"
                            value={port.hsfo.price || ""}
                            onChange={(e) => updatePortBunkering(port.id, "hsfo", "price", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right col-span-2"
                            value={port.vlsfo.price || ""}
                            onChange={(e) => updatePortBunkering(port.id, "vlsfo", "price", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <input
                            type="number"
                            className="form-input-sm font-mono text-right col-span-2"
                            value={port.lsmgo.price || ""}
                            onChange={(e) => updatePortBunkering(port.id, "lsmgo", "price", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Consumption Summary Panel */}
          <div className="border border-border rounded-md">
            <button
              onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs font-medium">Consumption & Cost Summary</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${isSummaryExpanded ? "" : "-rotate-90"}`} />
            </button>
            
            {isSummaryExpanded && (
              <div className="p-3 space-y-3">
                {/* Consumption Table */}
                <div className="grid grid-cols-6 gap-2 text-xs">
                  <div className="font-medium text-muted-foreground">Fuel</div>
                  <div className="font-medium text-muted-foreground text-center">BOB (t)</div>
                  <div className="font-medium text-muted-foreground text-center">Bunkered (t)</div>
                  <div className="font-medium text-muted-foreground text-center">
                    <span className="flex items-center justify-center gap-1">
                      Consumed (t)
                      <InfoTooltip 
                        formula="(Sea Days × Sea Rate) + (Port Days × Port Rate)" 
                        description="Fuel burned based on voyage profile and vessel consumption rates"
                      />
                    </span>
                  </div>
                  <div className="font-medium text-muted-foreground text-center">ROB End (t)</div>
                  <div className="font-medium text-muted-foreground text-center">Avg $/t</div>
                </div>

                {/* HSFO */}
                <div className="grid grid-cols-6 gap-2 text-xs items-center">
                  <div className="font-medium">HSFO</div>
                  <div className="font-mono text-center">{bunker.hsfo.robStart.toFixed(1)}</div>
                  <div className="font-mono text-center">{totalBunkeredHsfo.toFixed(1)}</div>
                  <div className="font-mono text-center bg-muted/50 rounded py-1">{results.hsfoConsumption.toFixed(2)}</div>
                  <div className={`font-mono text-center ${robEndHsfo < 0 ? 'text-destructive' : ''}`}>
                    {robEndHsfo.toFixed(1)}
                  </div>
                  <div className="font-mono text-center">{getAveragePrice('hsfo').toFixed(0)}</div>
                </div>

                {/* VLSFO */}
                <div className="grid grid-cols-6 gap-2 text-xs items-center">
                  <div className="font-medium">VLSFO</div>
                  <div className="font-mono text-center">{bunker.vlsfo.robStart.toFixed(1)}</div>
                  <div className="font-mono text-center">{totalBunkeredVlsfo.toFixed(1)}</div>
                  <div className="font-mono text-center bg-muted/50 rounded py-1">{results.vlsfoConsumption.toFixed(2)}</div>
                  <div className={`font-mono text-center ${robEndVlsfo < 0 ? 'text-destructive' : ''}`}>
                    {robEndVlsfo.toFixed(1)}
                  </div>
                  <div className="font-mono text-center">{getAveragePrice('vlsfo').toFixed(0)}</div>
                </div>

                {/* LSMGO */}
                <div className="grid grid-cols-6 gap-2 text-xs items-center">
                  <div className="font-medium">LSMGO</div>
                  <div className="font-mono text-center">{bunker.lsmgo.robStart.toFixed(1)}</div>
                  <div className="font-mono text-center">{totalBunkeredLsmgo.toFixed(1)}</div>
                  <div className="font-mono text-center bg-muted/50 rounded py-1">{results.lsmgoConsumption.toFixed(2)}</div>
                  <div className={`font-mono text-center ${robEndLsmgo < 0 ? 'text-destructive' : ''}`}>
                    {robEndLsmgo.toFixed(1)}
                  </div>
                  <div className="font-mono text-center">{getAveragePrice('lsmgo').toFixed(0)}</div>
                </div>

                {/* Totals */}
                <div className="border-t border-border pt-2 mt-2">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Total Consumption:</span>
                      <span className="font-mono font-semibold ml-2">
                        {(results.hsfoConsumption + results.vlsfoConsumption + results.lsmgoConsumption).toFixed(1)} t
                      </span>
                    </div>
                    <div className="text-xs flex items-center">
                      <span className="text-muted-foreground">Total Bunker Cost:</span>
                      <InfoTooltip 
                        formula="(HSFO t × $/t) + (VLSFO t × $/t) + (LSMGO t × $/t) + (CO₂ t × $/t)" 
                        description="Sum of all fuel costs plus carbon emissions cost"
                      />
                      <span className="font-mono font-semibold text-primary ml-2">
                        ${calculateTotalBunkerCost().toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">CO₂ Cost:</span>
                      <span className="font-mono font-semibold ml-2">
                        ${(results.totalCo2 * bunker.co2Price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* CO2 / EU ETS Summary */}
                <div className="border-t border-border pt-2 mt-2">
                  <div className="text-xs font-medium mb-2 flex items-center gap-1">
                    CO₂ / EU ETS Tracking
                    <InfoTooltip 
                      formula="IMO emission factors: HSFO=3.114, VLSFO=3.151, LSMGO=3.206" 
                      description="Carbon emissions calculated per fuel type using IMO standards"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-xs">
                    <div className="flex items-center">
                      <span className="text-muted-foreground">Total CO₂:</span>
                      <span className="font-mono ml-2">{results.totalCo2.toFixed(2)} t</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">Laden:</span>
                      <span className="font-mono ml-2">{results.co2Laden.toFixed(2)} t</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">Ballast:</span>
                      <span className="font-mono ml-2">{results.co2Ballast.toFixed(2)} t</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">CII Rating:</span>
                      <span className={`font-mono ml-2 font-semibold ${
                        results.ciiRating === 'A' ? 'text-green-600' :
                        results.ciiRating === 'B' ? 'text-lime-600' :
                        results.ciiRating === 'C' ? 'text-yellow-600' :
                        results.ciiRating === 'D' ? 'text-orange-600' :
                        'text-red-600'
                      }`}>{results.ciiRating}</span>
                    </div>
                  </div>

                  {/* EU ETS Fuel Allocation (derived from ECA zones) */}
                  <div className="grid grid-cols-3 gap-3 text-xs mt-2">
                    <div className="flex items-center">
                      <span className="text-muted-foreground">HSFO EU ETS:</span>
                      <span className="font-mono ml-2">{bunker.euEtsHsfo.toFixed(2)} t</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">VLSFO EU ETS:</span>
                      <span className="font-mono ml-2">{bunker.euEtsVlsfo.toFixed(2)} t</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">LSMGO EU ETS:</span>
                      <span className="font-mono ml-2">{bunker.euEtsLsmgo.toFixed(2)} t</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
