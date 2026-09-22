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
import { getFieldId } from "@/utils/validation";
import { getApiMode, API_MODE_CHANGED_EVENT, type ApiMode } from "@/services/apiMode";

export function VesselPanel() {
  const { vessel, setVessel, syncSequenceSpeedContexts, getFieldError } = useVoyageContext();
  const errCls = (msg?: string) =>
    msg ? "border-destructive ring-1 ring-destructive focus-visible:ring-destructive" : "";
  const [isExpanded, setIsExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiMode, setApiModeState] = useState<ApiMode>(getApiMode());
  const isTanker = apiMode === "tanker";

  useEffect(() => {
    const onModeChange = () => setApiModeState(getApiMode());
    window.addEventListener(API_MODE_CHANGED_EVENT, onModeChange);
    return () => window.removeEventListener(API_MODE_CHANGED_EVENT, onModeChange);
  }, []);

  const handleVesselSelect = useCallback((selectedVessel: VesselData | null) => {
    if (selectedVessel) {
      setVessel({ ...selectedVessel, type: vessel.type || selectedVessel.type });
    } else {
      setVessel({ ...defaultVessel, type: vessel.type });
    }
  }, [vessel.type, setVessel]);

  const handleFieldChange = (field: keyof VesselData, value: string | number | boolean) => {
    setVessel({ ...vessel, [field]: value });
    if (field === "hasScrubber") {
      syncSequenceSpeedContexts(vessel.speedProfile, Boolean(value));
    }
  };

  const handleSpeedProfileChange = (profile: SpeedProfile) => {
    const currentMatrix = profile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
    setVessel({
      ...vessel,
      speedProfile: profile,
      consumption: syncLegacyConsumption(currentMatrix),
    });
    syncSequenceSpeedContexts(profile, vessel.hasScrubber);
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
      [row]: { ...vessel[matrixKey][row], [col]: value },
    };
    
    if (vessel.loadDischIdleSame && (col === "load" || col === "discharge" || col === "idle")) {
      updatedMatrix = {
        ...updatedMatrix,
        [row]: { ...updatedMatrix[row], load: value, discharge: value, idle: value },
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
    <div className="calc-card-row">
      <button
        data-readonly-allowed="true"
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Vessel"
      >
        <span>Vessel</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 px-2 py-2 space-y-2 overflow-hidden">
          {/* Row 1: Search + Particulars + Type/Sector/Speed */}
          <div className="flex flex-wrap min-[1366px]:flex-nowrap gap-x-2 gap-y-1.5 items-end">
            <div className="form-field min-w-[140px] max-w-[180px] flex-1">
              <VesselSelect value={vessel.name} onChange={handleVesselSelect} placeholder="Search vessel..." />
            </div>
            <div className="form-field w-[78px] shrink-0">
              <label className="form-label">DWT (mt)</label>
              {(() => { const err = getFieldError("vessel","dwt"); return (
              <input id={getFieldId("vessel","dwt")} aria-invalid={!!err} title={err}
                type="number" className={`form-input-sm w-full font-mono tabular-nums text-right ${errCls(err)}`}
                value={vessel.dwt || ""} onChange={(e) => handleFieldChange("dwt", parseFloat(e.target.value) || 0)} placeholder="0" />
              );})()}
            </div>
            <div className="form-field w-[70px] shrink-0">
              <label className="form-label">{isTanker ? "GRT" : "GT"}</label>
              {(() => { const err = getFieldError("vessel","gt"); return (
              <input id={getFieldId("vessel","gt")} aria-invalid={!!err} title={err}
                type="number" className={`form-input-sm w-full font-mono tabular-nums text-right ${errCls(err)}`}
                value={vessel.gt || ""} onChange={(e) => handleFieldChange("gt", parseFloat(e.target.value) || 0)} placeholder="0" />
              );})()}
            </div>
            <div className="form-field w-[88px] shrink-0">
              <label className="form-label">Cubic metre</label>
              {(() => { const err = getFieldError("vessel","cubic"); return (
              <input id={getFieldId("vessel","cubic")} aria-invalid={!!err} title={err}
                type="number" className={`form-input-sm w-full font-mono tabular-nums text-right ${errCls(err)}`}
                value={vessel.cubic || ""} onChange={(e) => handleFieldChange("cubic", parseFloat(e.target.value) || 0)} placeholder="0" />
              );})()}
            </div>
            <div className="form-field w-[58px] shrink-0">
              <label className="form-label">Draft (m)</label>
              {(() => { const err = getFieldError("vessel","draft"); return (
              <input id={getFieldId("vessel","draft")} aria-invalid={!!err} title={err}
                type="number" step="0.01" className={`form-input-sm w-full font-mono tabular-nums text-right ${errCls(err)}`}
                value={vessel.draft || ""} onChange={(e) => handleFieldChange("draft", parseFloat(e.target.value) || 0)} placeholder="0" />
              );})()}
            </div>
            <div className="form-field w-[62px] shrink-0">
              <label className="form-label">TPC (t/cm)</label>
              {(() => { const err = getFieldError("vessel","tpcTpi"); return (
              <input id={getFieldId("vessel","tpcTpi")} aria-invalid={!!err} title={err}
                type="number" step="0.1" className={`form-input-sm w-full font-mono tabular-nums text-right ${errCls(err)}`}
                value={vessel.tpcTpi || ""} onChange={(e) => handleFieldChange("tpcTpi", parseFloat(e.target.value) || 0)} placeholder="0" />
              );})()}
            </div>
            <div className="form-field w-[50px] shrink-0">
              <label className="form-label">Scrubbers</label>
              <select className="form-select-sm w-full" value={vessel.hasScrubber ? "Y" : "N"} onChange={(e) => handleFieldChange("hasScrubber", e.target.value === "Y")}>
                <option value="N">N</option><option value="Y">Y</option>
              </select>
            </div>
            <div className="form-field w-[88px] shrink-0">
              <label className="form-label">Speed Profile</label>
              <select className="form-select-sm w-full" value={vessel.speedProfile} onChange={(e) => handleSpeedProfileChange(e.target.value as SpeedProfile)}>
                <option value="eco">Eco</option>
                <option value="full">Full</option>
              </select>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
              <Checkbox id="loadDischIdle" checked={vessel.loadDischIdleSame} onCheckedChange={(checked) => handleLoadDischIdleChange(checked === true)} className="h-3.5 w-3.5" />
              <label htmlFor="loadDischIdle" className="text-[10px] text-foreground font-bold cursor-pointer whitespace-nowrap">L=D=I</label>
            </div>
            {/* <button onClick={handleRefresh} disabled={refreshing || !vessel.name}
              className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-primary disabled:opacity-50 transition-colors border border-input rounded bg-input-bg" title="Refresh">
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            </button> */}
          </div>

          {/* Consumption Matrix */}
          <ConsumptionMatrix
            speedProfile={vessel.speedProfile}
            consumptionMatrix={currentMatrix}
            hasScrubber={vessel.hasScrubber}
            loadDischIdleSame={vessel.loadDischIdleSame}
            miscMultiplier={vessel.miscMultiplier}
            onSpeedProfileChange={handleSpeedProfileChange}
            onConsumptionChange={handleConsumptionChange}
            onLoadDischIdleChange={handleLoadDischIdleChange}
            onMiscMultiplierChange={(value) => handleFieldChange("miscMultiplier", value)}
          />
        </div>
      )}
    </div>
  );
}