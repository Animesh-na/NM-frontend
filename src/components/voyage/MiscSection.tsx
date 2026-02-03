import { ChevronDown, Settings, Clock, DollarSign } from "lucide-react";
import { useState } from "react";
import { useVoyageContext, type ExtraTimeState } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MiscSection() {
  const { misc, updateMisc, updateExtraTime, results } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCostExpanded, setIsCostExpanded] = useState(true);
  const [isTimeExpanded, setIsTimeExpanded] = useState(true);

  // Calculate total misc costs
  const totalMiscCosts = (misc?.miscCost || 0) + (misc?.extraFees || 0) + (misc?.extraInsurance || 0);
  const totalCanalCosts = (misc?.canalCost1 || 0) + (misc?.canalCost2 || 0);

  // Calculate total extra time in days
  const getExtraTimeDays = (entry: { value: number; unit: "days" | "hours" }) => {
    return entry.unit === "days" ? entry.value : entry.value / 24;
  };

  const totalExtraTime = misc?.extraTime ? (
    getExtraTimeDays(misc.extraTime.canal1) +
    getExtraTimeDays(misc.extraTime.canal2) +
    getExtraTimeDays(misc.extraTime.idlePort) +
    getExtraTimeDays(misc.extraTime.atSea)
  ) : 0;

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span>Miscellaneous & Extra Time</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3 space-y-4">
          {/* Miscellaneous Costs Section */}
          <div className="border border-border rounded-md">
            <button
              onClick={() => setIsCostExpanded(!isCostExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium">Miscellaneous Costs</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Total: <span className="font-mono font-semibold text-primary">
                    ${(totalMiscCosts + totalCanalCosts).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${isCostExpanded ? "" : "-rotate-90"}`} />
              </div>
            </button>
            
            {isCostExpanded && (
              <div className="p-3 space-y-3">
                {/* Row 1: Misc cost, Extra Fees, Canal cost 1 */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-muted-foreground block mb-1 flex items-center gap-1">
                      Misc cost
                      <InfoTooltip 
                        formula="Added directly to voyage expense" 
                        description="Additional voyage-related costs not included in port, bunker, or hire"
                      />
                    </label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                      <input
                        type="number"
                        className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.miscCost || ""}
                        onChange={(e) => updateMisc("miscCost", parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1">
                      Extra Fees
                    </label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                      <input
                        type="number"
                        className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.extraFees || ""}
                        onChange={(e) => updateMisc("extraFees", parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1">
                      Canal cost 1
                    </label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                      <input
                        type="number"
                        className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.canalCost1 || ""}
                        onChange={(e) => updateMisc("canalCost1", parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 2: Extra insurance, Trade type, Canal cost 2 */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-muted-foreground block mb-1">
                      Extra insurance
                    </label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                      <input
                        type="number"
                        className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.extraInsurance || ""}
                        onChange={(e) => updateMisc("extraInsurance", parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1">
                      Trade type
                    </label>
                    <Select 
                      value={misc?.tradeType || ""} 
                      onValueChange={(value) => updateMisc("tradeType", value)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="---" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" className="text-xs">---</SelectItem>
                        <SelectItem value="voyage" className="text-xs">Voyage</SelectItem>
                        <SelectItem value="time_charter" className="text-xs">Time Charter</SelectItem>
                        <SelectItem value="coa" className="text-xs">COA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-muted-foreground block mb-1">
                      Canal cost 2
                    </label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-sm">$</span>
                      <input
                        type="number"
                        className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.canalCost2 || ""}
                        onChange={(e) => updateMisc("canalCost2", parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                {/* Cost Summary */}
                <div className="border-t border-border pt-2 mt-2">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="flex items-center">
                      <span className="text-muted-foreground">Misc + Fees + Ins:</span>
                      <span className="font-mono ml-2">${totalMiscCosts.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">Canal Costs:</span>
                      <span className="font-mono ml-2">${totalCanalCosts.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">In Voyage Cost:</span>
                      <span className="font-mono font-semibold text-primary ml-2">
                        ${results?.miscCosts?.toLocaleString() ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Extra Time Section */}
          <div className="border border-border rounded-md">
            <button
              onClick={() => setIsTimeExpanded(!isTimeExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium">Extra Time</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Total: <span className="font-mono font-semibold text-primary">
                    {totalExtraTime.toFixed(2)} days
                  </span>
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${isTimeExpanded ? "" : "-rotate-90"}`} />
              </div>
            </button>
            
            {isTimeExpanded && (
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  {/* Canal Time Inputs */}
                  <div className="space-y-3">
                    {/* Time at Canal 1 */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1">
                        Time at Canal 1
                        <InfoTooltip 
                          formula="Added to total voyage duration" 
                          description="Extra canal transit time affecting hire cost and fuel consumption"
                        />
                      </label>
                      <div className="flex items-center gap-1">
                        <Select 
                          value={misc?.extraTime?.canal1?.mode || "VL"} 
                          onValueChange={(value) => updateExtraTime("canal1", "mode", value)}
                        >
                          <SelectTrigger className="h-6 w-14 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="VL" className="text-xs">VL</SelectItem>
                          </SelectContent>
                        </Select>
                        <input
                          type="number"
                          className="form-input-sm w-16 font-mono text-right"
                          value={misc?.extraTime?.canal1?.value || ""}
                          onChange={(e) => updateExtraTime("canal1", "value", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                        <Select 
                          value={misc?.extraTime?.canal1?.unit || "days"} 
                          onValueChange={(value) => updateExtraTime("canal1", "unit", value)}
                        >
                          <SelectTrigger className="h-6 w-16 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="days" className="text-xs">days</SelectItem>
                            <SelectItem value="hours" className="text-xs">hrs</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Time at Canal 2 */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Time at Canal 2
                      </label>
                      <div className="flex items-center gap-1">
                        <Select 
                          value={misc?.extraTime?.canal2?.mode || "VL"} 
                          onValueChange={(value) => updateExtraTime("canal2", "mode", value)}
                        >
                          <SelectTrigger className="h-6 w-14 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="VL" className="text-xs">VL</SelectItem>
                          </SelectContent>
                        </Select>
                        <input
                          type="number"
                          className="form-input-sm w-16 font-mono text-right"
                          value={misc?.extraTime?.canal2?.value || ""}
                          onChange={(e) => updateExtraTime("canal2", "value", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                        <Select 
                          value={misc?.extraTime?.canal2?.unit || "days"} 
                          onValueChange={(value) => updateExtraTime("canal2", "unit", value)}
                        >
                          <SelectTrigger className="h-6 w-16 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="days" className="text-xs">days</SelectItem>
                            <SelectItem value="hours" className="text-xs">hrs</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Port/Sea Time Inputs */}
                  <div className="space-y-3">
                    {/* In port (idle) */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1">
                        In port (idle)
                        <InfoTooltip 
                          formula="Idle consumption × time" 
                          description="Extra waiting time inside port, uses idle fuel consumption rates"
                        />
                      </label>
                      <div className="flex items-center gap-1">
                        <Select 
                          value={misc?.extraTime?.idlePort?.mode || "VL"} 
                          onValueChange={(value) => updateExtraTime("idlePort", "mode", value)}
                        >
                          <SelectTrigger className="h-6 w-14 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="VL" className="text-xs">VL</SelectItem>
                          </SelectContent>
                        </Select>
                        <input
                          type="number"
                          className="form-input-sm w-16 font-mono text-right"
                          value={misc?.extraTime?.idlePort?.value || ""}
                          onChange={(e) => updateExtraTime("idlePort", "value", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                        <Select 
                          value={misc?.extraTime?.idlePort?.unit || "hours"} 
                          onValueChange={(value) => updateExtraTime("idlePort", "unit", value)}
                        >
                          <SelectTrigger className="h-6 w-16 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hours" className="text-xs">hrs</SelectItem>
                            <SelectItem value="days" className="text-xs">days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* At sea (sailing) */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1">
                        At sea (sailing)
                        <InfoTooltip 
                          formula="Sea consumption × time (uses selected speed context)" 
                          description="Extra sailing time, uses vessel's sea consumption based on speed context"
                        />
                      </label>
                      <div className="flex items-center gap-1">
                        <Select 
                          value={misc?.extraTime?.atSea?.mode || "EV"} 
                          onValueChange={(value) => updateExtraTime("atSea", "mode", value)}
                        >
                          <SelectTrigger className="h-6 w-14 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EV" className="text-xs">EV</SelectItem>
                            <SelectItem value="FV" className="text-xs">FV</SelectItem>
                          </SelectContent>
                        </Select>
                        <input
                          type="number"
                          className="form-input-sm w-16 font-mono text-right"
                          value={misc?.extraTime?.atSea?.value || ""}
                          onChange={(e) => updateExtraTime("atSea", "value", parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                        <Select 
                          value={misc?.extraTime?.atSea?.unit || "hours"} 
                          onValueChange={(value) => updateExtraTime("atSea", "unit", value)}
                        >
                          <SelectTrigger className="h-6 w-16 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hours" className="text-xs">hrs</SelectItem>
                            <SelectItem value="days" className="text-xs">days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Time Summary */}
                <div className="border-t border-border pt-2 mt-2">
                  <div className="grid grid-cols-4 gap-3 text-xs">
                    <div className="flex items-center">
                      <span className="text-muted-foreground">Canal:</span>
                      <span className="font-mono ml-2">
                        {((results?.extraCanalDays || 0)).toFixed(2)} d
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">Port/Idle:</span>
                      <span className="font-mono ml-2">
                        {((results?.extraPortDays || 0)).toFixed(2)} d
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">Sea:</span>
                      <span className="font-mono ml-2">
                        {((results?.extraSeaDays || 0)).toFixed(2)} d
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-muted-foreground">In Voyage Days:</span>
                      <span className="font-mono font-semibold text-primary ml-2">
                        +{totalExtraTime.toFixed(2)} d
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Impact Summary */}
          <div className="bg-muted/30 rounded-md p-3">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Added to Voyage Cost:</span>
                <span className="font-mono font-semibold ml-2 text-primary">
                  ${((results?.miscCosts || 0) + (results?.canalCosts || 0)).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Added to Voyage Days:</span>
                <span className="font-mono font-semibold ml-2 text-primary">
                  +{totalExtraTime.toFixed(2)} d
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Impact on Hire:</span>
                <span className="font-mono font-semibold ml-2 text-destructive">
                  -${(totalExtraTime * 8542).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
