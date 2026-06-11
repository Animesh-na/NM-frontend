import { ChevronDown, Settings } from "lucide-react";
import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";
import { InfoTooltip } from "./InfoTooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function MiscSection() {
  const { misc, updateMisc, updateExtraTime, results } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);

  const totalMiscCosts = (misc?.miscCost || 0) + (misc?.extraFees || 0) + (misc?.extraInsurance || 0);
  const totalCanalCosts = (misc?.canalCost1 || 0) + (misc?.canalCost2 || 0);

  const getExtraTimeDays = (entry: { value: number; unit: "days" | "hours" }) => {
    return entry.unit === "days" ? entry.value : entry.value / 24;
  };

  const totalExtraTime = misc?.extraTime ? (
    getExtraTimeDays(misc.extraTime.canal1) + getExtraTimeDays(misc.extraTime.canal2) +
    getExtraTimeDays(misc.extraTime.idlePort) + getExtraTimeDays(misc.extraTime.atSea)
  ) : 0;

  const extraTimeKeys = ["canal1", "canal2", "idlePort", "atSea"] as const;
  const extraTimeLabels: Record<string, string> = { canal1: "Canal 1", canal2: "Canal 2", idlePort: "Port (idle)", atSea: "At Sea" };

  return (
    <div className="calc-card-row">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Misc & Extra Time"
      >
        <Settings className="h-4 w-4" />
        <span>Misc</span>
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 p-3 space-y-3 overflow-x-auto">
          {/* Misc Costs - tabular */}
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-xs table-fixed min-w-[560px]">
              <thead>
                <tr className="subsection-header">
                  <th className="text-left px-2 py-1 text-[10px] font-medium">Misc Costs</th>
                  <th className="text-left px-2 py-1 text-[10px] font-medium">Extra Fees</th>
                  <th className="text-left px-2 py-1 text-[10px] font-medium">Insurance</th>
                  <th className="text-left px-2 py-1 text-[10px] font-medium">Canal 1</th>
                  <th className="text-left px-2 py-1 text-[10px] font-medium">Canal 2</th>
                  <th className="text-left px-2 py-1 text-[10px] font-medium">Trade Type</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-1 py-0.5">
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md text-[10px]">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right text-xs rounded-l-none"
                        value={misc?.miscCost || ""} onChange={(e) => updateMisc("miscCost", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </td>
                  <td className="px-1 py-0.5">
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md text-[10px]">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right text-xs rounded-l-none"
                        value={misc?.extraFees || ""} onChange={(e) => updateMisc("extraFees", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </td>
                  <td className="px-1 py-0.5">
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md text-[10px]">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right text-xs rounded-l-none"
                        value={misc?.extraInsurance || ""} onChange={(e) => updateMisc("extraInsurance", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </td>
                  <td className="px-1 py-0.5">
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md text-[10px]">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right text-xs rounded-l-none"
                        value={misc?.canalCost1 || ""} onChange={(e) => updateMisc("canalCost1", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </td>
                  <td className="px-1 py-0.5">
                    <div className="input-with-unit">
                      <span className="unit border-r-0 rounded-r-none rounded-l-md text-[10px]">$</span>
                      <input type="number" className="form-input-sm w-full font-mono text-right text-xs rounded-l-none"
                        value={misc?.canalCost2 || ""} onChange={(e) => updateMisc("canalCost2", parseFloat(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </td>
                  <td className="px-1 py-0.5">
                    <Select value={misc?.tradeType || "none"} onValueChange={(value) => updateMisc("tradeType", value === "none" ? "" : value)}>
                      <SelectTrigger className="h-6 text-[10px]"><SelectValue placeholder="---" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">---</SelectItem>
                        <SelectItem value="voyage" className="text-xs">Voyage</SelectItem>
                        <SelectItem value="time_charter" className="text-xs">Time Charter</SelectItem>
                        <SelectItem value="coa" className="text-xs">COA</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Extra Time - tabular */}
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-xs table-fixed min-w-[480px]">
              <thead>
                <tr className="subsection-header">
                  {extraTimeKeys.map(key => (
                    <th key={key} className="text-left px-2 py-1 text-[10px] font-medium">{extraTimeLabels[key]}</th>
                  ))}
                  <th className="text-right px-2 py-1 text-[10px] font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  {extraTimeKeys.map(key => (
                    <td key={key} className="px-1 py-0.5">
                      <div className="flex items-center gap-0.5 min-w-0">
                        <input type="number" className="form-input-sm flex-1 min-w-0 font-mono text-right text-xs"
                          value={misc?.extraTime?.[key]?.value || ""} onChange={(e) => updateExtraTime(key, "value", parseFloat(e.target.value) || 0)} placeholder="0" />
                        <Select value={misc?.extraTime?.[key]?.unit || "days"} onValueChange={(value) => updateExtraTime(key, "unit", value)}>
                          <SelectTrigger className="h-6 w-12 shrink-0 text-[10px] px-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="days" className="text-xs">days</SelectItem>
                            <SelectItem value="hours" className="text-xs">hrs</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-1 font-mono text-right text-[10px] font-semibold text-primary">{totalExtraTime.toFixed(2)}d</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
