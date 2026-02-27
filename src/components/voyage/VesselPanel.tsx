import { ChevronDown, Ship, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect, useCallback } from "react";
import { VesselSelect } from "./VesselSelect";
import { ConsumptionMatrix } from "./ConsumptionMatrix";
import { 
  defaultVessel, 
  type VesselData, 
  type SpeedProfile,
  estimateExtendedConsumption,
  estimateTpc,
  syncLegacyConsumption,
} from "@/data/vessels";
import { useVoyageContext } from "@/context/VoyageContext";
import { getVesselTypes, getVesselSectors, type VesselType, type VesselSector } from "@/services/vesselFuelApi";

export function VesselPanel() {
  const { vessel, setVessel } = useVoyageContext();
  const [isExpanded, setIsExpanded] = useState(true);
  const [vesselTypes, setVesselTypes] = useState<VesselType[]>([]);
  const [vesselSectors, setVesselSectors] = useState<VesselSector[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load vessel types on mount
  useEffect(() => {
    const load = async () => {
      setTypesLoading(true);
      try {
        const [types, sectors] = await Promise.all([getVesselTypes(), getVesselSectors()]);
        setVesselTypes(types);
        setVesselSectors(sectors);
      } catch (error) {
        console.error("Failed to load vessel filters:", error);
      } finally {
        setTypesLoading(false);
      }
    };
    load();
  }, []);

  const handleVesselTypeChange = (typeId: number | null, typeName: string) => {
    setSelectedTypeId(typeId);
    // Reset vessel when type changes
    setVessel({
      ...defaultVessel,
      type: typeName,
    });
  };

  const handleVesselSelect = useCallback((selectedVessel: VesselData | null) => {
    if (selectedVessel) {
      // Preserve the selected type
      const vesselWithType = {
        ...selectedVessel,
        type: vessel.type || selectedVessel.type,
      };
      setVessel(vesselWithType);
    } else {
      setVessel({ ...defaultVessel, type: vessel.type });
    }
  }, [vessel.type, setVessel]);

  const handleFieldChange = (field: keyof VesselData, value: string | number | boolean) => {
    setVessel({ ...vessel, [field]: value });
  };

  const handleSpeedProfileChange = (profile: SpeedProfile) => {
    const currentMatrix = profile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
    setVessel({
      ...vessel,
      speedProfile: profile,
      consumption: syncLegacyConsumption(currentMatrix),
    });
  };

  const handleConsumptionChange = (
    row: keyof typeof vessel.ecoConsumption,
    col: keyof typeof vessel.ecoConsumption.speed,
    value: number
  ) => {
    const currentProfile = vessel.speedProfile;
    const matrixKey = currentProfile === "eco" ? "ecoConsumption" : "fullConsumption";
    
    let updatedMatrix = {
      ...vessel[matrixKey],
      [row]: {
        ...vessel[matrixKey][row],
        [col]: value,
      },
    };
    
    // Handle Load = Disch = Idle synchronization
    if (vessel.loadDischIdleSame && (col === "load" || col === "discharge" || col === "idle")) {
      updatedMatrix = {
        ...updatedMatrix,
        [row]: {
          ...updatedMatrix[row],
          load: value,
          discharge: value,
          idle: value,
        },
      };
    }
    
    setVessel({
      ...vessel,
      [matrixKey]: updatedMatrix,
      consumption: syncLegacyConsumption(updatedMatrix),
    });
  };

  const handleLoadDischIdleChange = (checked: boolean) => {
    if (checked) {
      // Copy Load values to Discharge and Idle
      const currentProfile = vessel.speedProfile;
      const matrixKey = currentProfile === "eco" ? "ecoConsumption" : "fullConsumption";
      const currentMatrix = vessel[matrixKey];
      
      const updatedMatrix = {
        ...currentMatrix,
        speed: { ...currentMatrix.speed, discharge: currentMatrix.speed.load, idle: currentMatrix.speed.load },
        hsfo: { ...currentMatrix.hsfo, discharge: currentMatrix.hsfo.load, idle: currentMatrix.hsfo.load },
        vlsfo: { ...currentMatrix.vlsfo, discharge: currentMatrix.vlsfo.load, idle: currentMatrix.vlsfo.load },
        lsmgo: { ...currentMatrix.lsmgo, discharge: currentMatrix.lsmgo.load, idle: currentMatrix.lsmgo.load },
        ae: { ...currentMatrix.ae, discharge: currentMatrix.ae.load, idle: currentMatrix.ae.load },
        aeScrubber: { ...currentMatrix.aeScrubber, discharge: currentMatrix.aeScrubber.load, idle: currentMatrix.aeScrubber.load },
      };
      
      setVessel({
        ...vessel,
        loadDischIdleSame: true,
        [matrixKey]: updatedMatrix,
        consumption: syncLegacyConsumption(updatedMatrix),
      });
    } else {
      setVessel({ ...vessel, loadDischIdleSame: false });
    }
  };

  const handleRefresh = useCallback(async () => {
    if (!vessel.name) return;
    setRefreshing(true);
    // Reset consumption to estimated values based on DWT
    const dwt = vessel.dwt || 50000;
    const ecoMatrix = estimateExtendedConsumption(dwt, false);
    const fullMatrix = estimateExtendedConsumption(dwt, true);
    
    setVessel({
      ...vessel,
      tpcTpi: estimateTpc(dwt),
      ecoConsumption: ecoMatrix,
      fullConsumption: fullMatrix,
      consumption: syncLegacyConsumption(vessel.speedProfile === "eco" ? ecoMatrix : fullMatrix),
    });
    
    setTimeout(() => setRefreshing(false), 500);
  }, [vessel, setVessel]);

  const currentMatrix = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;

  return (
    <div className="calc-card-compact">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-compact w-full justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Ship className="h-3.5 w-3.5" />
          <span>Vessel</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      {isExpanded && (
        <div className="p-1.5 space-y-1">
          {/* Row 1: Vessel Name + Vessel Particulars */}
          <div className="grid grid-cols-12 gap-1.5 items-end text-[10px]">
            <div className="col-span-3">
              <VesselSelect
                value={vessel.name}
                onChange={handleVesselSelect}
                selectedTypeId={selectedTypeId}
                selectedSectorId={selectedSectorId}
                placeholder="Search vessel..."
              />
            </div>
            <div className="col-span-1">
              <label className="compact-label">Dwt</label>
              <input
                type="number"
                className="form-input-sm w-full font-mono tabular-nums text-right"
                value={vessel.dwt || ""}
                onChange={(e) => handleFieldChange("dwt", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="col-span-1">
              <label className="compact-label">Gt</label>
              <input
                type="number"
                className="form-input-sm w-full font-mono tabular-nums text-right"
                value={vessel.gt || ""}
                onChange={(e) => handleFieldChange("gt", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="col-span-2">
              <label className="compact-label">Cubic</label>
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  className="form-input-sm w-full font-mono tabular-nums text-right"
                  value={vessel.cubic || ""}
                  onChange={(e) => handleFieldChange("cubic", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
                <span className="text-[8px] text-muted-foreground self-center">m³</span>
              </div>
            </div>
            <div className="col-span-1">
              <label className="compact-label">Draft</label>
              <input
                type="number"
                step="0.01"
                className="form-input-sm w-full font-mono tabular-nums text-right"
                value={vessel.draft || ""}
                onChange={(e) => handleFieldChange("draft", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="col-span-1">
              <label className="compact-label">TPC</label>
              <input
                type="number"
                step="0.1"
                className="form-input-sm w-full font-mono tabular-nums text-right"
                value={vessel.tpcTpi || ""}
                onChange={(e) => handleFieldChange("tpcTpi", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="col-span-1">
              <label className="compact-label">HSFO</label>
              <select
                className="form-select-sm w-full"
                value={vessel.hsfoCapability ? "Y" : "N"}
                onChange={(e) => handleFieldChange("hsfoCapability", e.target.value === "Y")}
              >
                <option value="N">N</option>
                <option value="Y">Y</option>
              </select>
            </div>
            <div className="col-span-1">
              <label className="compact-label">Scrub</label>
              <select
                className="form-select-sm w-full"
                value={vessel.hasScrubber ? "Y" : "N"}
                onChange={(e) => handleFieldChange("hasScrubber", e.target.value === "Y")}
              >
                <option value="N">N</option>
                <option value="Y">Y</option>
              </select>
            </div>
            <div className="col-span-1 flex items-center justify-center">
              <button
                onClick={handleRefresh}
                disabled={refreshing || !vessel.name}
                className="p-1 text-muted-foreground hover:text-primary disabled:opacity-50 transition-colors"
                title="Refresh vessel data"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Row 2: Type, Sector, Speed Profile */}
          <div className="grid grid-cols-12 gap-1.5 items-end text-[10px] border-t border-border pt-1">
            <div className="col-span-2">
              <label className="compact-label">Type</label>
              <select
                className="form-select w-full text-xs"
                value={selectedTypeId ?? ""}
                onChange={(e) => {
                  const typeId = e.target.value ? Number(e.target.value) : null;
                  const typeName = vesselTypes.find(t => t.id === typeId)?.name || "";
                  handleVesselTypeChange(typeId, typeName);
                }}
                disabled={typesLoading}
              >
                <option value="">--- ALL ---</option>
                {vesselTypes.map(type => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="compact-label">Sector</label>
              <select
                className="form-select w-full text-xs"
                value={selectedSectorId ?? ""}
                onChange={(e) => setSelectedSectorId(e.target.value ? Number(e.target.value) : null)}
                disabled={typesLoading}
              >
                <option value="">--- ALL ---</option>
                {vesselSectors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="compact-label">Speed Profile</label>
              <select
                className="form-select w-full text-xs"
                value={vessel.speedProfile}
                onChange={(e) => handleSpeedProfileChange(e.target.value as SpeedProfile)}
              >
                <option value="eco">Eco Speed&Cons</option>
                <option value="full">Full Speed&Cons</option>
              </select>
            </div>
            <div className="col-span-3 flex items-end gap-2">
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="loadDischIdle"
                  checked={vessel.loadDischIdleSame}
                  onCheckedChange={(checked) => handleLoadDischIdleChange(checked === true)}
                  className="h-3 w-3"
                />
                <label htmlFor="loadDischIdle" className="text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap">
                  Load = Disch = Idle
                </label>
              </div>
            </div>
            <div className="col-span-2 flex items-end gap-1">
              <span className="text-[10px] text-muted-foreground">Misc x</span>
              <input
                type="number"
                className="form-input-sm w-12 font-mono tabular-nums text-center text-xs"
                value={vessel.miscMultiplier || ""}
                onChange={(e) => handleFieldChange("miscMultiplier", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Layer 3: Speed & Consumption Matrix - compact */}
          <div className="border-t border-border pt-1">
            <ConsumptionMatrix
              speedProfile={vessel.speedProfile}
              consumptionMatrix={currentMatrix}
              loadDischIdleSame={vessel.loadDischIdleSame}
              miscMultiplier={vessel.miscMultiplier}
              onSpeedProfileChange={handleSpeedProfileChange}
              onConsumptionChange={handleConsumptionChange}
              onLoadDischIdleChange={handleLoadDischIdleChange}
              onMiscMultiplierChange={(value) => handleFieldChange("miscMultiplier", value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
