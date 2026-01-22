import { ChevronDown, Plus, Trash2, Anchor } from "lucide-react";
import { useState } from "react";
import { PortSelect } from "./PortSelect";
import type { Port } from "@/data/ports";

interface SequenceRow {
  id: number;
  operation: string;
  port: string;
  portUnloc: string;
  cgo: string;
  distanceEca: string;
  time: string;
  wdaysPort: string;
  draft: string;
  c: string;
  quantity: string;
  quantityUnit: string;
  terms: string;
  tt: string;
  et: string;
  expDa: number;
}

const initialSequence: SequenceRow[] = [
  {
    id: 1,
    operation: "load",
    port: "Paradip",
    portUnloc: "INPAV",
    cgo: "#1",
    distanceEca: "370 & EL",
    time: "0 nm EV",
    wdaysPort: "0d",
    draft: "5 % VL",
    c: "0 m",
    quantity: "30000",
    quantityUnit: "mt",
    terms: "sshex",
    tt: "1.5555",
    et: "18h",
    expDa: 65000,
  },
  {
    id: 2,
    operation: "pssg",
    port: "Singapore",
    portUnloc: "SGSIN",
    cgo: "",
    distanceEca: "1555 & EL",
    time: "0 nm EV",
    wdaysPort: "0d",
    draft: "5 % VL",
    c: "0 m",
    quantity: "",
    quantityUnit: "",
    terms: "",
    tt: "",
    et: "12h",
    expDa: 2000,
  },
  {
    id: 3,
    operation: "disch",
    port: "Ho Chi Minh City",
    portUnloc: "VNSGN",
    cgo: "#1",
    distanceEca: "660 & EL",
    time: "0 nm EV",
    wdaysPort: "0d",
    draft: "10 % VL",
    c: "0 m",
    quantity: "30000",
    quantityUnit: "mt",
    terms: "shinc",
    tt: "1.0000",
    et: "18h",
    expDa: 25000,
  },
  {
    id: 4,
    operation: "Repos",
    port: "",
    portUnloc: "",
    cgo: "",
    distanceEca: "0 & EL",
    time: "0 nm EV",
    wdaysPort: "0d",
    draft: "5 %",
    c: "",
    quantity: "",
    quantityUnit: "",
    terms: "",
    tt: "",
    et: "",
    expDa: 0,
  },
];

const operationOptions = ["load", "disch", "pssg", "Repos"];

export function SequenceTable() {
  const [sequence, setSequence] = useState<SequenceRow[]>(initialSequence);
  const [isExpanded, setIsExpanded] = useState(true);

  const updateRow = (id: number, field: keyof SequenceRow, value: string | number) => {
    setSequence(prev => prev.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const handlePortChange = (id: number, port: Port | null) => {
    setSequence(prev => prev.map(row => 
      row.id === id ? { 
        ...row, 
        port: port?.name || "", 
        portUnloc: port?.unloc || "" 
      } : row
    ));
  };

  const addSequence = () => {
    const newId = Math.max(...sequence.map((s) => s.id)) + 1;
    setSequence([
      ...sequence,
      {
        id: newId,
        operation: "load",
        port: "",
        portUnloc: "",
        cgo: "",
        distanceEca: "0 & EL",
        time: "0 nm EV",
        wdaysPort: "0d",
        draft: "5 % VL",
        c: "0 m",
        quantity: "",
        quantityUnit: "mt",
        terms: "sshex",
        tt: "1.0000",
        et: "0h",
        expDa: 0,
      },
    ]);
  };

  const removeSequence = (id: number) => {
    setSequence(sequence.filter((s) => s.id !== id));
  };

  return (
    <div className="calc-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Anchor className="h-4 w-4" />
          <span>Sequence</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-3">
          <div className="overflow-x-auto">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th className="w-16">Open</th>
                  <th className="w-32">Port</th>
                  <th className="w-12">Cgo</th>
                  <th className="w-24">Distance & ECA</th>
                  <th className="w-20">Time</th>
                  <th className="w-20">Wdays Port</th>
                  <th className="w-16">Draft</th>
                  <th className="w-12">C</th>
                  <th className="w-24">Quantity</th>
                  <th className="w-20">Terms</th>
                  <th className="w-16">Tt</th>
                  <th className="w-12">Et</th>
                  <th className="w-20">Exp/DA</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sequence.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <select
                        className="form-select w-full text-xs"
                        value={row.operation}
                        onChange={(e) => updateRow(row.id, "operation", e.target.value)}
                      >
                        {operationOptions.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-0.5">
                      <PortSelect
                        value={row.port}
                        onChange={(port) => handlePortChange(row.id, port)}
                        placeholder="Select port..."
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full text-center font-mono"
                        value={row.cgo}
                        onChange={(e) => updateRow(row.id, "cgo", e.target.value)}
                        placeholder=""
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs"
                        value={row.distanceEca}
                        onChange={(e) => updateRow(row.id, "distanceEca", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs"
                        value={row.time}
                        onChange={(e) => updateRow(row.id, "time", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs"
                        value={row.wdaysPort}
                        onChange={(e) => updateRow(row.id, "wdaysPort", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs"
                        value={row.draft}
                        onChange={(e) => updateRow(row.id, "draft", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs"
                        value={row.c}
                        onChange={(e) => updateRow(row.id, "c", e.target.value)}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          className="form-input-sm w-16 font-mono text-right"
                          value={row.quantity}
                          onChange={(e) => updateRow(row.id, "quantity", e.target.value)}
                        />
                        <select
                          className="form-select text-[10px] w-10 p-0.5"
                          value={row.quantityUnit}
                          onChange={(e) => updateRow(row.id, "quantityUnit", e.target.value)}
                        >
                          <option value="mt">mt</option>
                          <option value="cbm">cbm</option>
                        </select>
                      </div>
                    </td>
                    <td>
                      <select 
                        className="form-select text-xs w-full" 
                        value={row.terms}
                        onChange={(e) => updateRow(row.id, "terms", e.target.value)}
                      >
                        <option value="">-</option>
                        <option value="sshex">sshex</option>
                        <option value="shinc">shinc</option>
                        <option value="fhex">fhex</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs text-right"
                        value={row.tt}
                        onChange={(e) => updateRow(row.id, "tt", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs text-center"
                        value={row.et}
                        onChange={(e) => updateRow(row.id, "et", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-input-sm w-full font-mono text-xs text-right tabular-nums"
                        value={row.expDa || ""}
                        onChange={(e) => updateRow(row.id, "expDa", parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => removeSequence(row.id)}
                        className="p-1 hover:bg-destructive/10 rounded-sm text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={addSequence} className="btn-secondary flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Add sequence
            </button>
            <button className="btn-secondary">Rem sequence</button>
            <button className="btn-primary">Get distances</button>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="rounded" defaultChecked />
              Auto dist.
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
