import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { type VesselData } from "@/data/vessels";

type WaterType = "sw" | "bw" | "fw" | "tfw";
type SeasonType = "summer" | "winter" | "tropical";

const waterOptions: { value: WaterType; label: string; factor: number }[] = [
  { value: "sw", label: "Salt Water (SW: 1.0000)", factor: 1.0 },
  { value: "bw", label: "Brackish Water (BW: 0.9878)", factor: 0.9878 },
  { value: "fw", label: "Fresh Water (FW: 0.9756)", factor: 0.9756 },
  { value: "tfw", label: "Tropical Fresh Water (TFW: 0.9717)", factor: 0.9717 },
];

const seasonOptions: { value: SeasonType; label: string }[] = [
  { value: "summer", label: "Summer" },
  { value: "winter", label: "Winter" },
  { value: "tropical", label: "Tropical" },
];

interface IntakeCalculatorProps {
  open: boolean;
  onClose: () => void;
  onApply: (quantity: number) => void;
  vessel: VesselData;
  portName: string;
  portDraft: number;
  currentQuantity: number;
  stowageFactor: number;
}

export function IntakeCalculator({
  open,
  onClose,
  onApply,
  vessel,
  portName,
  portDraft,
  currentQuantity,
  stowageFactor: initialSF,
}: IntakeCalculatorProps) {
  // Port section
  const [draft, setDraft] = useState(portDraft || 0);
  const [waterType, setWaterType] = useState<WaterType>("sw");
  const [season, setSeason] = useState<SeasonType>("summer");

  // Vessel section (editable copies)
  const [summerDwt, setSummerDwt] = useState(vessel.dwt);
  const [summerDraft, setSummerDraft] = useState(vessel.draft);
  const [tpc, setTpc] = useState(vessel.tpcTpi);
  const [constants, setConstants] = useState(0);
  const [bob, setBob] = useState(0);
  const [freshWater, setFreshWater] = useState(0);
  const [grainCuFt, setGrainCuFt] = useState(0);
  const [grainCuM, setGrainCuM] = useState(0);

  // Cargo section
  const [sf, setSf] = useState(initialSF || 53);

  // Initialize from vessel when dialog opens
  useEffect(() => {
    if (open) {
      setSummerDwt(vessel.dwt);
      setSummerDraft(vessel.draft);
      setTpc(vessel.tpcTpi);
      setDraft(portDraft || 0);
      // Convert cubic capacity
      if (vessel.cubicUnit === "cbm") {
        setGrainCuM(vessel.cubic);
        setGrainCuFt(Math.round(vessel.cubic * 35.3147));
      } else {
        setGrainCuFt(vessel.cubic);
        setGrainCuM(Math.round(vessel.cubic / 35.3147));
      }
      setSf(initialSF || 53);
    }
  }, [open, vessel, portDraft, initialSF]);

  const densityFactor = waterOptions.find((w) => w.value === waterType)?.factor ?? 1.0;

  const calc = useMemo(() => {
    // Step 1 – Seasonal Draft
    let seasonalDraft = summerDraft;
    if (season === "winter") seasonalDraft = summerDraft - summerDraft / 48;
    else if (season === "tropical") seasonalDraft = summerDraft + summerDraft / 48;

    // Step 2 – Draft Limitation
    const draftReduction = Math.max(0, seasonalDraft - draft);
    const draftReductionCm = draftReduction * 100;
    const dwtReduction = draftReductionCm * tpc;

    // Step 3 – Density Correction
    const correctedDwt = (summerDwt - dwtReduction) * densityFactor;

    // Step 4 – DWCC
    const dwcc = correctedDwt - constants - bob - freshWater;

    // Step 5 – Volume Limit (use cu.m for calc)
    const capacityM3 = grainCuM > 0 ? grainCuM : grainCuFt / 35.3147;
    const sfM3 = sf > 0 ? sf / 35.3147 : 1; // convert cu.ft/mt to m³/mt
    const volumeLimit = capacityM3 / sfM3;

    // Step 6 – Final
    const dwccCalc = Math.max(0, Math.round(dwcc));
    const dwccCubic = Math.max(0, Math.round(volumeLimit));
    const finalIntake = Math.min(dwccCalc, dwccCubic);

    return { seasonalDraft, draftReduction, dwtReduction, correctedDwt, dwccCalc, dwccCubic, finalIntake };
  }, [summerDwt, summerDraft, tpc, draft, season, densityFactor, constants, bob, freshWater, grainCuM, grainCuFt, sf]);

  const labelClass = "text-[11px] text-muted-foreground font-medium w-28 shrink-0";
  const inputClass = "form-input-sm w-24 text-[11px] font-mono text-right";
  const unitClass = "text-[10px] text-muted-foreground ml-1 w-8";

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-2 py-0.5">
      <span className={labelClass}>{label}</span>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px] p-0 gap-0">
        <DialogHeader className="px-4 py-2 border-b border-border">
          <DialogTitle className="text-sm font-semibold">Intake Calculator</DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Port Section */}
          <div>
            <div className="text-[11px] font-bold text-primary mb-1.5">Port</div>
            <div className="flex items-center gap-2 py-0.5">
              <span className={labelClass}>Port</span>
              <span className="text-[11px] font-semibold">{portName || "—"}</span>
            </div>
            <Row label="Draft">
              <input type="number" step="0.1" className={inputClass} value={draft || ""} onChange={(e) => setDraft(parseFloat(e.target.value) || 0)} />
              <span className={unitClass}>m</span>
            </Row>
            <Row label="Water">
              <select className="form-select-sm text-[11px] w-52" value={waterType} onChange={(e) => setWaterType(e.target.value as WaterType)}>
                {waterOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
            <Row label="Season">
              <select className="form-select-sm text-[11px] w-28" value={season} onChange={(e) => setSeason(e.target.value as SeasonType)}>
                {seasonOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
          </div>

          {/* Vessel Section + Results side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-bold text-primary mb-1.5">Vessel</div>
              <div className="flex items-center gap-2 py-0.5">
                <span className={labelClass}>Vessel</span>
                <span className="text-[11px] font-semibold truncate">{vessel.name || "—"}</span>
              </div>
              <Row label="Summer DWT">
                <input type="number" className={inputClass} value={summerDwt || ""} onChange={(e) => setSummerDwt(parseFloat(e.target.value) || 0)} />
                <span className={unitClass}>mt</span>
              </Row>
              <Row label="Summer Draft">
                <input type="number" step="0.01" className={inputClass} value={summerDraft || ""} onChange={(e) => setSummerDraft(parseFloat(e.target.value) || 0)} />
                <span className={unitClass}>m</span>
              </Row>
              <Row label="TPC/TPI">
                <input type="number" step="0.1" className={inputClass} value={tpc || ""} onChange={(e) => setTpc(parseFloat(e.target.value) || 0)} />
                <span className={unitClass}>tpc</span>
              </Row>
              <Row label="Constants">
                <input type="number" className={inputClass} value={constants || ""} onChange={(e) => setConstants(parseFloat(e.target.value) || 0)} />
                <span className={unitClass}>mt</span>
              </Row>
              <Row label="BOB">
                <input type="number" className={inputClass} value={bob || ""} onChange={(e) => setBob(parseFloat(e.target.value) || 0)} />
                <span className={unitClass}>t</span>
              </Row>
              <Row label="Fresh Water">
                <input type="number" className={inputClass} value={freshWater || ""} onChange={(e) => setFreshWater(parseFloat(e.target.value) || 0)} />
                <span className={unitClass}>mt</span>
              </Row>
              <Row label="Grain">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center">
                    <input type="number" className={`${inputClass} w-20`} value={grainCuFt || ""} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setGrainCuFt(v); setGrainCuM(Math.round(v / 35.3147)); }} />
                    <span className="text-[10px] text-muted-foreground ml-1">cu.ft</span>
                  </div>
                  <div className="flex items-center">
                    <input type="number" className={`${inputClass} w-20`} value={grainCuM || ""} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setGrainCuM(v); setGrainCuFt(Math.round(v * 35.3147)); }} />
                    <span className="text-[10px] text-muted-foreground ml-1">cu.m</span>
                  </div>
                </div>
              </Row>
            </div>

            {/* Results panel */}
            <div>
              <div className="text-[11px] font-bold text-primary mb-1.5">Results</div>
              <div className="space-y-1 mt-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">DWT</span>
                  <span className="font-mono">{summerDwt.toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Draft</span>
                  <span className="font-mono">{summerDraft} m ({calc.seasonalDraft.toFixed(1)} m)</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">TPC/TPI</span>
                  <span className="font-mono">{tpc} mt/cm</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">DWCC calc</span>
                  <span className="font-mono">{calc.dwccCalc.toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">DWCC cubic</span>
                  <span className="font-mono">{calc.dwccCubic.toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1 border-t border-border">
                  <span className="font-semibold">DWCC</span>
                  <span className="font-mono font-bold text-primary text-sm">{calc.finalIntake.toLocaleString()} mt</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cargo Section */}
          <div>
            <div className="text-[11px] font-bold text-primary mb-1.5">Cargo #1</div>
            <Row label="Stowage Factor">
              <input type="number" step="0.1" className={inputClass} value={sf || ""} onChange={(e) => setSf(parseFloat(e.target.value) || 0)} />
              <span className="text-[10px] text-muted-foreground ml-1">cu.ft/mt</span>
            </Row>
          </div>
        </div>

        <DialogFooter className="px-4 py-2 border-t border-border gap-1">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => onApply(calc.finalIntake)}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
