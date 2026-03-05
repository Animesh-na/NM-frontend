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
  onApply: (quantity: number) => void;
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
      if (vessel.cubicUnit === "cbm") {
        setGrainCuM(String(vessel.cubic));
        setGrainCuFt(String(Math.round(vessel.cubic * 35.3147)));
      } else {
        setGrainCuFt(String(vessel.cubic));
        setGrainCuM(String(Math.round(vessel.cubic / 35.3147)));
      }
      setSf(initialSF ? String(initialSF) : "53");
    }
  }, [open, vessel, portDraft, initialSF]);

  const densityFactor = waterOptions.find((w) => w.value === waterType)?.factor ?? 1.0;

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

    const draftReduction = Math.max(0, seasonalDraft - _draft);
    const draftReductionCm = draftReduction * 100;
    const dwtReduction = draftReductionCm * _tpc;

    const correctedDwt = (_summerDwt - dwtReduction) * densityFactor;
    const dwcc = correctedDwt - _constants - _bob - _freshWater;

    const capacityM3 = _grainCuM > 0 ? _grainCuM : _grainCuFt / 35.3147;
    const sfM3 = _sf > 0 ? _sf / 35.3147 : 1;
    const volumeLimit = capacityM3 / sfM3;

    const dwccCalc = Math.max(0, Math.round(dwcc));
    const dwccCubic = Math.max(0, Math.round(volumeLimit));
    const finalIntake = Math.min(dwccCalc, dwccCubic);

    return { seasonalDraft, draftReduction, dwtReduction, correctedDwt, dwccCalc, dwccCubic, finalIntake };
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

            {/* Results panel */}
            <div>
              <div className="text-[11px] font-bold text-primary mb-1.5">Results</div>
              <div className="space-y-1 mt-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">DWT</span>
                  <span className="font-mono">{num(summerDwt).toLocaleString()} mt</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Draft</span>
                  <span className="font-mono">{num(summerDraft)} m ({calc.seasonalDraft.toFixed(1)} m)</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">TPC/TPI</span>
                  <span className="font-mono">{num(tpc)} mt/cm</span>
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
              <input type="number" step="0.1" className={inputClass} value={sf} onChange={(e) => setSf(e.target.value)} />
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
