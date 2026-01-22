import { ChevronDown, Plus, Trash2, Anchor } from "lucide-react";
import { useState } from "react";
import { PortSelect } from "./PortSelect";
import type { Port } from "@/data/ports";
import { useVoyageContext, type SequenceRowUI } from "@/context/VoyageContext";

const operationOptions = ["load", "disch", "pssg", "Repos"];

export function SequenceTable() {
  const { sequence, setSequence, updateSequenceRow } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);

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
    const newId = Math.max(...sequence.map((s) => s.id), 0) + 1;
    setSequence(prev => [
      ...prev,
      {
        id: newId,
        operation: "load",
        port: "",
        portUnloc: "",
        cgo: "",
        distanceEca: "0",
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
    setSequence(prev => prev.filter((s) => s.id !== id));
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
                  <th className="w-16">Operation</th>
                  <th className="w-32">Port</th>
                  <th className="w-12">Cgo</th>
                  <th className="w-20">Distance (nm)</th>
                  <th className="w-16">Port Days</th>
                  <th className="w-16">Draft</th>
                  <th className="w-24">Quantity</th>
                  <th className="w-20">Terms</th>
                  <th className="w-20">Exp/DA ($)</th>
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
                        onChange={(e) => updateSequenceRow(row.id, "operation", e.target.value)}
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
                        onChange={(e) => updateSequenceRow(row.id, "cgo", e.target.value)}
                        placeholder=""
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs text-right"
                        value={row.distanceEca}
                        onChange={(e) => updateSequenceRow(row.id, "distanceEca", e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs text-right"
                        value={row.wdaysPort}
                        onChange={(e) => updateSequenceRow(row.id, "wdaysPort", e.target.value)}
                        placeholder="0d"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input-sm w-full font-mono text-xs"
                        value={row.draft}
                        onChange={(e) => updateSequenceRow(row.id, "draft", e.target.value)}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          className="form-input-sm w-16 font-mono text-right"
                          value={row.quantity}
                          onChange={(e) => updateSequenceRow(row.id, "quantity", e.target.value)}
                          placeholder="0"
                        />
                        <select
                          className="form-select text-[10px] w-10 p-0.5"
                          value={row.quantityUnit}
                          onChange={(e) => updateSequenceRow(row.id, "quantityUnit", e.target.value)}
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
                        onChange={(e) => updateSequenceRow(row.id, "terms", e.target.value)}
                      >
                        <option value="">-</option>
                        <option value="sshex">sshex</option>
                        <option value="shinc">shinc</option>
                        <option value="fhex">fhex</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-input-sm w-full font-mono text-xs text-right tabular-nums"
                        value={row.expDa || ""}
                        onChange={(e) => updateSequenceRow(row.id, "expDa", parseFloat(e.target.value) || 0)}
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
