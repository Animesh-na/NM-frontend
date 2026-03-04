import { ChevronDown, Settings, Clock, DollarSign } from "lucide-react";
import { useState } from "react";
import { useVoyageContext, type ExtraTimeState } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function MiscSection() {
  const { misc, updateMisc, updateExtraTime, results } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCostExpanded, setIsCostExpanded] = useState(true);
  const [isTimeExpanded, setIsTimeExpanded] = useState(true);

  const totalMiscCosts = (misc?.miscCost || 0) + (misc?.extraFees || 0) + (misc?.extraInsurance || 0);
  const totalCanalCosts = (misc?.canalCost1 || 0) + (misc?.canalCost2 || 0);

  const getExtraTimeDays = (entry: { value: number; unit: "days" | "hours" }) => {
    return entry.unit === "days" ? entry.value : entry.value / 24;
  };

  const totalExtraTime = misc?.extraTime ? (
    getExtraTimeDays(misc.extraTime.canal1) + getExtraTimeDays(misc.extraTime.canal2) +
    getExtraTimeDays(misc.extraTime.idlePort) + getExtraTimeDays(misc.extraTime.atSea)
  ) : 0;

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span>Misc & Extra Time</span>
          <span className="text-[10px] font-normal text-muted-foreground ml-2">
            ${(totalMiscCosts + totalCanalCosts).toLocaleString()} | {totalExtraTime.toFixed(1)}d
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Misc Costs */}
          <div className="border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setIsCostExpanded(!isCostExpanded)}
              className="w-full flex items-center justify-between px-4 py-2 subsection-header hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Miscellaneous Costs</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Total: <span className="font-mono font-semibold text-primary">${(totalMiscCosts + totalCanalCosts).toLocaleString()}</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCostExpanded ? "" : "-rotate-90"}`} />
              </div>
            </button>
            
            {isCostExpanded && (
              <div className="p-4 space-y-4">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="form-field w-32">
                    <label className="form-label flex items-center gap-1">
                      Misc Cost
                      <InfoTooltip formula="Added to voyage expense" description="Additional costs" />
                    </label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.miscCost || ""} onChange={(e) => updateMisc("miscCost", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </div>
                  <div className="form-field w-32">
                    <label className="form-label">Extra Fees</label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.extraFees || ""} onChange={(e) => updateMisc("extraFees", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </div>
                  <div className="form-field w-32">
                    <label className="form-label">Extra Insurance</label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.extraInsurance || ""} onChange={(e) => updateMisc("extraInsurance", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </div>
                  <div className="form-field w-32">
                    <label className="form-label">Canal Cost 1</label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.canalCost1 || ""} onChange={(e) => updateMisc("canalCost1", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </div>
                  <div className="form-field w-32">
                    <label className="form-label">Canal Cost 2</label>
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right rounded-l-none"
                        value={misc?.canalCost2 || ""} onChange={(e) => updateMisc("canalCost2", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </div>
                  <div className="form-field w-32">
                    <label className="form-label">Trade Type</label>
                    <Select value={misc?.tradeType || "none"} onValueChange={(value) => updateMisc("tradeType", value === "none" ? "" : value)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="---" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">---</SelectItem>
                        <SelectItem value="voyage" className="text-xs">Voyage</SelectItem>
                        <SelectItem value="time_charter" className="text-xs">Time Charter</SelectItem>
                        <SelectItem value="coa" className="text-xs">COA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Extra Time */}
          <div className="border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setIsTimeExpanded(!isTimeExpanded)}
              className="w-full flex items-center justify-between px-4 py-2 subsection-header hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Extra Time</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Total: <span className="font-mono font-semibold text-primary">{totalExtraTime.toFixed(2)} days</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isTimeExpanded ? "" : "-rotate-90"}`} />
              </div>
            </button>
            
            {isTimeExpanded && (
              <div className="p-4">
                <div className="flex flex-wrap gap-4 items-end">
                  {(["canal1", "canal2", "idlePort", "atSea"] as const).map(key => {
                    const labels: Record<string, string> = { canal1: "Canal 1", canal2: "Canal 2", idlePort: "In Port (idle)", atSea: "At Sea" };
                    return (
                      <div key={key} className="form-field w-44">
                        <label className="form-label flex items-center gap-1">
                          {labels[key]}
                          {key === "idlePort" && <InfoTooltip formula="Idle consumption × time" description="Waiting time in port" />}
                          {key === "atSea" && <InfoTooltip formula="Sea consumption × time" description="Extra sailing time" />}
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            className="form-input-sm flex-1 font-mono text-right"
                            value={misc?.extraTime?.[key]?.value || ""}
                            onChange={(e) => updateExtraTime(key, "value", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                          <Select value={misc?.extraTime?.[key]?.unit || "days"} onValueChange={(value) => updateExtraTime(key, "unit", value)}>
                            <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="days" className="text-xs">days</SelectItem>
                              <SelectItem value="hours" className="text-xs">hrs</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
