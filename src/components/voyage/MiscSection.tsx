import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function MiscSection() {
  const { misc, updateMisc } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);

  const totalMiscCosts = (misc?.miscCost || 0) + (misc?.extraFees || 0) + (misc?.extraInsurance || 0);
  const totalCanalCosts = (misc?.canalCost1 || 0) + (misc?.canalCost2 || 0);

  const costFields = [
    { key: "miscCost", label: "Misc Costs" },
    { key: "extraFees", label: "Extra Fees" },
    { key: "extraInsurance", label: "Insurance" },
    { key: "canalCost1", label: "Canal 1" },
    { key: "canalCost2", label: "Canal 2" },
  ] as const;

  return (
    <div className="calc-card-row">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Misc & Extra Time"
      >
        <span>Misc</span>
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
            {costFields.map(({ key, label }) => (
              <div key={key} className="form-field">
                <label className="form-label">{label}</label>
                <div className="input-with-unit">
                  <span className="unit border-r-0 rounded-r-none rounded-l-md">$</span>
                  <input
                    type="number"
                    className="form-input-sm w-full font-mono text-right rounded-l-none"
                    value={misc?.[key] || ""}
                    onChange={(e) => updateMisc(key, parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
            <div className="form-field">
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

          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[130px] flex items-center justify-between rounded-md border border-border bg-muted/40 px-2 py-1">
              <span className="text-[10px] font-medium text-muted-foreground">Total Misc</span>
              <span className="font-mono text-xs font-semibold">${totalMiscCosts.toLocaleString()}</span>
            </div>
            <div className="flex-1 min-w-[130px] flex items-center justify-between rounded-md border border-border bg-muted/40 px-2 py-1">
              <span className="text-[10px] font-medium text-muted-foreground">Total Canal</span>
              <span className="font-mono text-xs font-semibold">${totalCanalCosts.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
