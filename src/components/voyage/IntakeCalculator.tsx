import { useState, useMemo, useEffect, useCallback } from "react";
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

const waterOptions: { value: WaterType; label: string; density: number }[] = [
  { value: "sw", label: "Salt Water (1.025)", density: 1.025 },
  { value: "bw", label: "Brackish Water (1.0125)", density: 1.0125 },
  { value: "fw", label: "Fresh Water (1.000)", density: 1.0 },
  { value: "tfw", label: "Tropical Fresh Water (0.9971)", density: 0.9971 },
];

const seasonOptions: { value: SeasonType; label: string }[] = [
  { value: "summer", label: "Summer" },
  { value: "winter", label: "Winter" },
  { value: "tropical", label: "Tropical" },
];

const labelClass = "text-[11px] text-muted-foreground font-medium w-28 shrink-0";
const unitClass = "text-[10px] text-muted-foreground ml-1 w-8";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 py-0.5">
    <span className={labelClass}>{label}</span>
    {children}
  </div>
);

interface IntakeCalculatorProps {
  open: boolean;
  onClose: () => void;
  onApply: (quantity: number, draft?: number) => void;
  vessel: VesselData;
  portName: string;
  portDraft: number;
  currentQuantity: number;
  stowageFactor: number;
}

/** Parse a string to number, returning 0 for empty/invalid */
const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

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
  // All inputs stored as strings for free editing
  const [draft, setDraft] = useState("");
  const [waterType, setWaterType] = useState<WaterType>("sw");
  const [season, setSeason] = useState<SeasonType>("summer");

  const [summerDwt, setSummerDwt] = useState("");
  const [summerDraft, setSummerDraft] = useState("");
  const [tpc, setTpc] = useState("");
  const [constants, setConstants] = useState("");
  const [bob, setBob] = useState("");
  const [freshWater, setFreshWater] = useState("");
  const [grainCuFt, setGrainCuFt] = useState("");
  const [grainCuM, setGrainCuM] = useState("");

  const [sf, setSf] = useState("");

  // Initialize from vessel when dialog opens
  useEffect(() => {
    if (open) {
      setSummerDwt(String(vessel.dwt));
      setSummerDraft(String(vessel.draft));
      setTpc(String(vessel.tpcTpi));
      setDraft(portDraft ? String(portDraft) : "");
      setConstants("");
      setBob("");
      setFreshWater("");
      // Cubic is always stored in m³ — derive cu.ft from it
      const cubicM3 = vessel.cubic || 0;
      setGrainCuM(String(cubicM3));
      setGrainCuFt(String(Math.round(cubicM3 * 35.3147)));
      setSf(initialSF ? String(initialSF) : "53");
    }
  }, [open, vessel, portDraft, initialSF]);

  const waterDensity = waterOptions.find((w) => w.value === waterType)?.density ?? 1.025;
  const densityFactor = waterDensity / 1.025; // Salt water baseline

  const calc = useMemo(() => {
    const _summerDwt = num(summerDwt);
    const _summerDraft = num(summerDraft);
    const _tpc = num(tpc);
    const _draft = num(draft);
    const _constants = num(constants);
    const _bob = num(bob);
    const _freshWater = num(freshWater);
    const _grainCuM = num(grainCuM);
    const _grainCuFt = num(grainCuFt);
    const _sf = num(sf);

    let seasonalDraft = _summerDraft;
    if (season === "winter") seasonalDraft = _summerDraft - _summerDraft / 48;
    else if (season === "tropical") seasonalDraft = _summerDraft + _summerDraft / 48;

    // Step 1: Seasonal DWT = SummerDWT - (SummerDraft - SeasonalDraft) * TPC * 100
    const seasonalDwt = _summerDwt - (_summerDraft - seasonalDraft) * (_tpc * 100);

    // Step 2: Draft Difference (Summer Draft - Port Draft)
    const draftDifference = _summerDraft - _draft;
    const draftDifferenceCm = draftDifference * 100;

    // Step 3: DWT Reduction (only when port draft restricts; never a bonus)
    const dwtReduction = draftDifferenceCm * _tpc;

    // Step 4: DWT after draft & density correction — applied to Seasonal DWT
    const dwtAfterDraftDensity = (seasonalDwt - Math.max(dwtReduction, 0)) * densityFactor;

    // Step 4: Total deductions
    const totalDeductions = _constants + _bob + _freshWater;

    // Step 5: DWCC (Dead Weight Cargo Capacity)
    const dwcc = dwtAfterDraftDensity - totalDeductions;

    // Step 6: Volume-based cargo (cu.ft / SF in cu.ft/mt)
    const grainCuFtVal = _grainCuFt > 0 ? _grainCuFt : _grainCuM * 35.3147;
    const volumeBasedCargo = _sf > 0 ? grainCuFtVal / _sf : Infinity;

    // Step 7: Final allowable cargo = min of DWCC and volume
    const dwccCalc = Math.round(dwcc);
    const dwccCubic = Math.round(volumeBasedCargo);
    const finalIntake = Math.max(0, Math.min(dwccCalc, dwccCubic));

    return {
      seasonalDraft, seasonalDwt, draftDifference, draftDifferenceCm, dwtReduction,
      dwtAfterDraftDensity, totalDeductions, dwccCalc, dwccCubic, finalIntake,
      densityFactor,
    };
  }, [summerDwt, summerDraft, tpc, draft, season, densityFactor, constants, bob, freshWater, grainCuM, grainCuFt, sf]);

  const inputClass = "form-input-sm w-24 text-[11px] font-mono text-right";

  const handleGrainCuFtChange = useCallback((val: string) => {
    setGrainCuFt(val);
    const v = parseFloat(val);
    if (!isNaN(v)) setGrainCuM(String(Math.round(v / 35.3147)));
  }, []);

  const handleGrainCuMChange = useCallback((val: string) => {
    setGrainCuM(val);
    const v = parseFloat(val);
    if (!isNaN(v)) setGrainCuFt(String(Math.round(v * 35.3147)));
  }, []);

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
              <input type="number" step="0.1" className={inputClass} value={draft} onChange={(e) => setDraft(e.target.value)} />
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
                <input type="number" className={inputClass} value={summerDwt} onChange={(e) => setSummerDwt(e.target.value)} />
                <span className={unitClass}>mt</span>
              </Row>
              <Row label="Summer Draft">
                <input type="number" step="0.01" className={inputClass} value={summerDraft} onChange={(e) => setSummerDraft(e.target.value)} />
                <span className={unitClass}>m</span>
              </Row>
              <Row label="TPC/TPI">
                <input type="number" step="0.1" className={inputClass} value={tpc} onChange={(e) => setTpc(e.target.value)} />
                <span className={unitClass}>tpc</span>
              </Row>
              <Row label="Constants">
                <input type="number" className={inputClass} value={constants} onChange={(e) => setConstants(e.target.value)} />
                <span className={unitClass}>mt</span>
              </Row>
              <Row label="BOB">
                <input type="number" className={inputClass} value={bob} onChange={(e) => setBob(e.target.value)} />
                <span className={unitClass}>t</span>
              </Row>
              <Row label="Fresh Water">
                <input type="number" className={inputClass} value={freshWater} onChange={(e) => setFreshWater(e.target.value)} />
                <span className={unitClass}>mt</span>
              </Row>
              <Row label="Grain">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center">
                    <input type="number" className={`${inputClass} w-20`} value={grainCuFt} onChange={(e) => handleGrainCuFtChange(e.target.value)} />
                    <span className="text-[10px] text-muted-foreground ml-1">cu.ft</span>
                  </div>
                  <div className="flex items-center">
                    <input type="number" className={`${inputClass} w-20`} value={grainCuM} onChange={(e) => handleGrainCuMChange(e.target.value)} />
                    <span className="text-[10px] text-muted-foreground ml-1">cu.m</span>
                  </div>
                </div>
              </Row>
            </div>

            {/* Calculation panel — matches spreadsheet layout */}
            <div>
              <div className="text-[11px] font-bold text-primary mb-1.5">Calculation</div>
              <div className="space-y-0.5 mt-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Seasonal Draft</span>
                  <span className="font-mono">{calc.seasonalDraft.toFixed(2)} m</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Seasonal DWT</span>
                  <span className="font-mono">{Math.round(calc.seasonalDwt).toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Draft Diff (m)</span>
                  <span className="font-mono">{calc.draftDifference.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Draft Diff (cm)</span>
                  <span className="font-mono">{calc.draftDifferenceCm.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">DWT Reduction</span>
                  <span className="font-mono">{Math.round(Math.max(calc.dwtReduction, 0)).toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Density Factor</span>
                  <span className="font-mono">{calc.densityFactor.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">DWT After D&D</span>
                  <span className="font-mono">{Math.round(calc.dwtAfterDraftDensity).toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Deductions</span>
                  <span className="font-mono">{Math.round(calc.totalDeductions).toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px] pt-0.5 border-t border-border">
                  <span className="font-medium">DWCC</span>
                  <span className="font-mono font-semibold">{calc.dwccCalc.toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Volume Cargo</span>
                  <span className="font-mono">{calc.dwccCubic.toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1 border-t border-border">
                  <span className="font-bold">Final Cargo</span>
                  <span className="font-mono font-bold text-primary text-sm">{calc.finalIntake.toLocaleString()} mt</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cargo Section */}
          <div>
            <div className="text-[11px] font-bold text-primary mb-1.5">Cargo #1</div>
            <Row label="Stowage Factor">
              <input type="number" step="0.1" className={inputClass} value={sf} onChange={(e) => setSf(e.target.value)} />
              <span className="text-[10px] text-muted-foreground ml-1">cu.ft/mt</span>
            </Row>
          </div>
        </div>

        <DialogFooter className="px-4 py-2 border-t border-border gap-1">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => onApply(calc.finalIntake, num(draft) > 0 ? num(draft) : undefined)}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
