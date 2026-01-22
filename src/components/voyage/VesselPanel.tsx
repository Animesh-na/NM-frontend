import { ChevronDown, Ship } from "lucide-react";
import { useState } from "react";
import { VesselSelect } from "./VesselSelect";
import { vesselTypes, defaultVessel, type VesselData } from "@/data/vessels";
import { useVoyageContext } from "@/context/VoyageContext";

interface ConsumptionRow {
  key: keyof VesselData["consumption"];
  label: string;
}

const consumptionRows: ConsumptionRow[] = [
  { key: "speed", label: "Spd (kts)" },
  { key: "hsfo", label: "HSFO cons." },
  { key: "vlsfo", label: "VLSFO cons." },
  { key: "lsmgo", label: "LSMGO cons." },
  { key: "ae", label: "AE cons." },
  { key: "aeScrubber", label: "AE + scrubber cons." },
];

export function VesselPanel() {
  const { vessel, setVessel } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);

  const handleVesselSelect = (selectedVessel: VesselData | null) => {
    if (selectedVessel) {
      setVessel(selectedVessel);
    } else {
      setVessel({ ...defaultVessel });
    }
  };

  const handleFieldChange = (field: keyof VesselData, value: string | number) => {
    setVessel({ ...vessel, [field]: value });
  };

  const handleConsumptionChange = (
    row: keyof VesselData["consumption"],
    col: "ecoBallast" | "ecoLaden" | "canal",
    value: string
  ) => {
    const numValue = parseFloat(value) || 0;
    setVessel({
      ...vessel,
      consumption: {
        ...vessel.consumption,
        [row]: {
          ...vessel.consumption[row],
          [col]: numValue,
        },
      },
    });
  };

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Ship className="h-4 w-4" />
          <span>Vessel</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Vessel Selection */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">
                Type
              </label>
              <select 
                className="form-select w-full"
                value={vessel.type}
                onChange={(e) => handleFieldChange("type", e.target.value)}
              >
                <option value="">--- SELECT ---</option>
                {vesselTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">
                Or name
              </label>
              <VesselSelect
                value={vessel.name}
                onChange={handleVesselSelect}
                placeholder="Search or enter vessel..."
              />
            </div>
          </div>

          {/* Vessel Specs - Now Editable */}
          <div className="grid grid-cols-6 gap-2 text-xs">
            <div>
              <label className="text-muted-foreground block mb-1">Dwt</label>
              <div className="flex items-center">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono tabular-nums text-right"
                  value={vessel.dwt || ""}
                  onChange={(e) => handleFieldChange("dwt", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <span className="text-[10px] text-muted-foreground ml-1">mt</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Gt</label>
              <input
                type="number"
                className="form-input-sm w-full font-mono tabular-nums text-right"
                value={vessel.gt || ""}
                onChange={(e) => handleFieldChange("gt", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Cubic</label>
              <div className="flex items-center">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono tabular-nums text-right"
                  value={vessel.cubic || ""}
                  onChange={(e) => handleFieldChange("cubic", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <span className="text-[10px] text-muted-foreground ml-1">cbm</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Draft</label>
              <div className="flex items-center">
                <input
                  type="number"
                  step="0.1"
                  className="form-input-sm w-full font-mono tabular-nums text-right"
                  value={vessel.draft || ""}
                  onChange={(e) => handleFieldChange("draft", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <span className="text-[10px] text-muted-foreground ml-1">m</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">TPC/TPI</label>
              <div className="flex items-center">
                <input
                  type="number"
                  step="0.1"
                  className="form-input-sm w-full font-mono tabular-nums text-right"
                  value={vessel.tpcTpi || ""}
                  onChange={(e) => handleFieldChange("tpcTpi", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <span className="text-[10px] text-muted-foreground ml-1">tpc</span>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">
                HSFO Scrubbers
              </label>
              <select
                className="form-select w-full text-xs"
                value={vessel.hsfoScrubbers}
                onChange={(e) => handleFieldChange("hsfoScrubbers", e.target.value)}
              >
                <option value="N">N</option>
                <option value="Y">Y</option>
              </select>
            </div>
          </div>

          {/* Consumption Table - Now Editable */}
          <div className="mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-32">Eco Speed&Cons</th>
                  <th className="w-20">Eco Ballast</th>
                  <th className="w-20">Eco Laden</th>
                  <th className="w-20">Canal</th>
                </tr>
              </thead>
              <tbody>
                {consumptionRows.map((row) => (
                  <tr key={row.key}>
                    <td className="font-medium">{row.label}</td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        className="w-full bg-transparent font-mono tabular-nums text-right focus:outline-none focus:bg-background focus:ring-1 focus:ring-ring px-1"
                        value={vessel.consumption[row.key].ecoBallast || ""}
                        onChange={(e) => handleConsumptionChange(row.key, "ecoBallast", e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        className="w-full bg-transparent font-mono tabular-nums text-right focus:outline-none focus:bg-background focus:ring-1 focus:ring-ring px-1"
                        value={vessel.consumption[row.key].ecoLaden || ""}
                        onChange={(e) => handleConsumptionChange(row.key, "ecoLaden", e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        className="w-full bg-transparent font-mono tabular-nums text-right focus:outline-none focus:bg-background focus:ring-1 focus:ring-ring px-1"
                        value={vessel.consumption[row.key].canal || ""}
                        onChange={(e) => handleConsumptionChange(row.key, "canal", e.target.value)}
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
