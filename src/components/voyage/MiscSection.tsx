import { useState } from "react";
import { useVoyageContext } from "@/context/VoyageContext";

const CANAL_FUELS = [
  { value: "vlsfo", label: "VLSFO" },
  { value: "lsmgo", label: "LSMGO" },
  { value: "hsfo", label: "HSFO + Scrubber" },
] as const;

export function MiscSection() {
  const { misc, updateMisc, updateExtraTime, vessel } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);

  const totalMiscCosts = (misc?.miscCost || 0) + (misc?.extraFees || 0) + (misc?.extraInsurance || 0);
  const totalCanalCosts = (misc?.canalCost1 || 0) + (misc?.canalCost2 || 0);

  const canal = misc?.extraTime?.canal1 ?? { mode: "VL", value: 0, unit: "days" as const };
  const canalFuel = misc?.canalFuel || (vessel?.hasScrubber ? "hsfo" : "vlsfo");

  const canalDays = canal.unit === "days" ? canal.value : canal.value / 24;
  const canalMatrix = vessel?.speedProfile === "full" ? vessel?.fullConsumption : vessel?.ecoConsumption;
  const canalRate = canalMatrix?.[canalFuel]?.canal || 0;
  const aeCanalRate = (vessel?.hasScrubber ? canalMatrix?.aeScrubber : canalMatrix?.ae)?.canal || 0;
  const canalFuelMt = canalDays * canalRate;
  const canalAeMt = canalDays * aeCanalRate;

  const costFields = [
    { key: "miscCost", label: "Misc Costs" },
    { key: "extraFees", label: "Extra Fees" },
    { key: "extraInsurance", label: "Insurance" },
    { key: "canalCost1", label: "Canal Charges" },
  ] as const;

  return (
    <div className="calc-card-row">
      <button
        data-readonly-allowed="true"
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
                <div className="relative w-[130px] shrink-0">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">$</span>
                  <input
                    type="number"
                    className="form-input-sm w-full min-w-0 font-mono text-right pl-6"
                    value={misc?.[key] || ""}
                    onChange={(e) => updateMisc(key, parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>
            ))}

            {/* Canal transit time */}
            <div className="flex items-center gap-2 min-w-0">
              <label className="form-label flex-1 min-w-0 truncate mb-0">Canal Time</label>
              <div className="flex w-[130px] shrink-0 gap-1">
                <input
                  type="number"
                  className="form-input-sm w-full min-w-0 font-mono text-right"
                  value={canal.value || ""}
                  onChange={(e) => updateExtraTime("canal1", "value", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <select
                  className="form-input-sm w-[58px] shrink-0 px-1"
                  value={canal.unit}
                  onChange={(e) => updateExtraTime("canal1", "unit", e.target.value)}
                >
                  <option value="days">d</option>
                  <option value="hours">h</option>
                </select>
              </div>
            </div>

            {/* Canal fuel */}
            <div className="flex items-center gap-2 min-w-0">
              <label className="form-label flex-1 min-w-0 truncate mb-0">Canal Fuel</label>
              <select
                className="form-input-sm w-[130px] shrink-0"
                value={canalFuel}
                onChange={(e) => updateMisc("canalFuel", e.target.value)}
              >
                {CANAL_FUELS.map((f) => (
                  <option key={f.value} value={f.value} disabled={f.value === "hsfo" && !vessel?.hasScrubber}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <label className="form-label flex-1 min-w-0 truncate mb-0">
                Canal Cons. ({canalRate.toLocaleString(undefined, { maximumFractionDigits: 2 })} + AE {aeCanalRate.toLocaleString(undefined, { maximumFractionDigits: 2 })} mt/d)
              </label>
              <span className="w-[130px] shrink-0 text-right font-mono text-xs font-semibold">
                {(canalFuelMt + canalAeMt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mt
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[130px] flex items-center justify-between rounded-md border border-border bg-muted/40 px-2 py-1">
              <span className="text-[10px] font-medium text-muted-foreground">Total Misc</span>
              <span className="font-mono text-xs font-semibold">${totalMiscCosts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex-1 min-w-[130px] flex items-center justify-between rounded-md border border-border bg-muted/40 px-2 py-1">
              <span className="text-[10px] font-medium text-muted-foreground">Total Canal</span>
              <span className="font-mono text-xs font-semibold">${totalCanalCosts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
