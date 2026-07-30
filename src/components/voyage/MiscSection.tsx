import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";

export function MiscSection() {
  const { misc, updateMisc } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);

  const totalMiscCosts = (misc?.miscCost || 0) + (misc?.extraFees || 0) + (misc?.extraInsurance || 0);
  const totalCanalCosts = (misc?.canalCost1 || 0) + (misc?.canalCost2 || 0);

  const costFields = [
    { key: "miscCost", label: "Misc Costs" },
    { key: "extraFees", label: "Extra Fees" },
    { key: "extraInsurance", label: "Insurance" },
    { key: "canalCost1", label: "Canal Charges" },
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
        <div className="flex-1 min-w-0 p-3 space-y-3 overflow-hidden">
          <div className="space-y-1.5">
            {costFields.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2 min-w-0">
                <label className="form-label flex-1 min-w-0 truncate mb-0">{label}</label>
                <div className="flex items-center w-[130px] shrink-0">
                  <span className="unit border-r-0 rounded-r-none rounded-l-md shrink-0">$</span>
                  <input
                    type="number"
                    className="form-input-sm w-full min-w-0 font-mono text-right rounded-l-none"
                    value={misc?.[key] || ""}
                    onChange={(e) => updateMisc(key, parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
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
