import { ChevronDown, Ship } from "lucide-react";
import { useState } from "react";

interface VesselData {
  name: string;
  type: string;
  dwt: number;
  gt: number;
  cubic: number;
  draft: number;
  tpcTpi: number;
  hsfoScrubbers: string;
}

interface ConsumptionRow {
  label: string;
  ecoBallast: number;
  ecoLaden: number;
  canal: number;
}

const defaultVessel: VesselData = {
  name: "Ap Dubrava",
  type: "Bulk Carrier",
  dwt: 38703,
  gt: 25494,
  cubic: 50905,
  draft: 10.5,
  tpcTpi: 53.9,
  hsfoScrubbers: "N",
};

const consumptionData: ConsumptionRow[] = [
  { label: "Spd (kts)", ecoBallast: 12.5, ecoLaden: 12, canal: 0 },
  { label: "HSFO cons.", ecoBallast: 16, ecoLaden: 16, canal: 2.5 },
  { label: "VLSFO cons.", ecoBallast: 21, ecoLaden: 22, canal: 2.5 },
  { label: "LSMGO cons.", ecoBallast: 16, ecoLaden: 16, canal: 2.5 },
  { label: "AE cons.", ecoBallast: 0.1, ecoLaden: 0.1, canal: 0.2 },
  { label: "AE + scrubber cons.", ecoBallast: 0.2, ecoLaden: 0.2, canal: 0.2 },
];

export function VesselPanel() {
  const [vessel] = useState<VesselData>(defaultVessel);
  const [isExpanded, setIsExpanded] = useState(true);

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
              <select className="form-select w-full">
                <option>--- SELECT ---</option>
                <option selected>Bulk Carrier</option>
                <option>Tanker</option>
                <option>Container</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">
                Or name
              </label>
              <input
                type="text"
                className="form-input w-full"
                value={vessel.name}
                readOnly
              />
            </div>
          </div>

          {/* Vessel Specs */}
          <div className="grid grid-cols-6 gap-2 text-xs">
            <div>
              <label className="text-muted-foreground block mb-1">Dwt</label>
              <div className="font-mono tabular-nums bg-muted px-2 py-1 rounded-sm">
                {vessel.dwt.toLocaleString()} mt
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Gt</label>
              <div className="font-mono tabular-nums bg-muted px-2 py-1 rounded-sm">
                {vessel.gt.toLocaleString()}
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Cubic</label>
              <div className="font-mono tabular-nums bg-muted px-2 py-1 rounded-sm">
                {vessel.cubic.toLocaleString()} cbm
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Draft</label>
              <div className="font-mono tabular-nums bg-muted px-2 py-1 rounded-sm">
                {vessel.draft} m
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">TPC/TPI</label>
              <div className="font-mono tabular-nums bg-muted px-2 py-1 rounded-sm">
                {vessel.tpcTpi} tpc
              </div>
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">
                HSFO Scrubbers
              </label>
              <div className="font-mono tabular-nums bg-muted px-2 py-1 rounded-sm">
                {vessel.hsfoScrubbers}
              </div>
            </div>
          </div>

          {/* Consumption Table */}
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
                {consumptionData.map((row, idx) => (
                  <tr key={idx}>
                    <td className="font-medium">{row.label}</td>
                    <td className="font-mono tabular-nums text-right">
                      {row.ecoBallast}
                    </td>
                    <td className="font-mono tabular-nums text-right">
                      {row.ecoLaden}
                    </td>
                    <td className="font-mono tabular-nums text-right">
                      {row.canal}
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
