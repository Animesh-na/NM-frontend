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


  const canal = misc?.extraTime?.canal1 ?? { mode: "VL", value: 0, unit: "days" as const };
  const canalFuel = misc?.canalFuel || (vessel?.hasScrubber ? "hsfo" : "vlsfo");

  const canalDays = canal.unit === "days" ? canal.value : canal.value / 24;
  const canalMatrix = vessel?.speedProfile === "full" ? vessel?.fullConsumption : vessel?.ecoConsumption;
  const canalRate = canalMatrix?.[canalFuel]?.canal || 0;
  const aeCanalRate = (vessel?.hasScrubber ? canalMatrix?.aeScrubber : canalMatrix?.ae)?.canal || 0;

  const costFields = [
    { key: "miscCost", label: "Misc Costs ($)" },
    { key: "extraFees", label: "Extra Fees ($)" },
    { key: "extraInsurance", label: "Insurance ($)" },
    { key: "canalCost1", label: "Canal Costs ($)" },
  ] as const;

  return (
    <div className="calc-card-row">
      <button
        data-readonly-allowed="true"
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Misc & Extra Time"
      >
        <span>Miscellaneous</span>
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 p-2 space-y-2 overflow-hidden">
          <div className="space-y-1">
            {costFields.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2 min-w-0">
                <label className="form-label flex-1 min-w-0 truncate mb-0">{label}</label>
                <div className="relative w-[130px] shrink-0">
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

          </div>

        </div>
      )}
    </div>
  );
}
