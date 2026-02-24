import { useState } from "react";
import { ChevronDown, Upload, FileJson, Copy } from "lucide-react";
import { useVoyageContext } from "@/context/VoyageContext";
import { toast } from "sonner";
import type { VesselData } from "@/data/vessels";

export function JsonImportSection() {
  const {
    setVessel,
    setSequence,
    setCargos,
    setBunker,
    setMisc,
    setHireRate,
    setVesselCost,
    vessel,
    sequence,
    cargos,
    bunker,
    misc,
    hireRate,
    vesselCost,
  } = useVoyageContext();

  const [isExpanded, setIsExpanded] = useState(false);
  const [jsonInput, setJsonInput] = useState("");

  const handleImport = () => {
    if (!jsonInput.trim()) {
      toast.error("Please paste JSON data first");
      return;
    }

    try {
      const data = JSON.parse(jsonInput);

      // Populate vessel if present
      if (data.vessel) {
        setVessel(data.vessel as VesselData);
      }

      // Populate sequence if present
      if (data.sequence && Array.isArray(data.sequence)) {
        setSequence(data.sequence);
      }

      // Populate cargos if present
      if (data.cargos && Array.isArray(data.cargos)) {
        setCargos(data.cargos);
      }

      // Populate bunker if present
      if (data.bunker) {
        setBunker((prev: any) => ({ ...prev, ...data.bunker }));
      }

      // Populate misc if present
      if (data.misc) {
        setMisc((prev: any) => ({ ...prev, ...data.misc }));
      }

      // Populate hire rate if present
      if (data.hireRate !== undefined) {
        setHireRate(data.hireRate);
      }

      // Populate vessel cost if present
      if (data.vesselCost !== undefined) {
        setVesselCost(data.vesselCost);
      }

      toast.success("Voyage data imported successfully");
      setJsonInput("");
    } catch (e) {
      toast.error("Invalid JSON format. Please check your input.");
    }
  };

  const handleExport = () => {
    const exportData = {
      vessel,
      sequence,
      cargos,
      bunker,
      misc,
      hireRate,
      vesselCost,
    };
    const json = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(json);
    toast.success("Current voyage data copied to clipboard");
  };

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-1.5">
          <FileJson className="h-3.5 w-3.5" />
          <span>JSON Import / Export</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-2 space-y-2">
          <textarea
            className="w-full h-40 font-mono text-xs bg-muted/30 border border-border rounded-md p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder='Paste full voyage JSON here... e.g. { "vessel": {...}, "sequence": [...], "cargos": [...], "bunker": {...}, "misc": {...}, "hireRate": 8500, "vesselCost": 6500 }'
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <Upload className="h-3 w-3" />
              Import
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
            >
              <Copy className="h-3 w-3" />
              Export Current Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
