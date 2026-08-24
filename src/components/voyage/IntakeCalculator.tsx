import { useState, useMemo, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { type VesselData } from "@/data/vessels";
import {
  STOWAGE_FACTORS,
  loadCustomStowageFactors,
  saveCustomStowageFactor,
  removeCustomStowageFactor,
  type StowageFactorOption,
} from "@/data/stowageFactors";

export type IntakeSeason = "summer" | "winter" | "tropical";
export type IntakeWater = "sw" | "bw" | "fw" | "tfw";

export interface IntakePortInput {
  id: number;
  name: string;
  draft: number;
  operation?: string;
  kind: "open" | "port" | "repos";
}

export interface IntakePortResult {
  id: number;
  draft: number;
}

const waterOptions: { value: IntakeWater; label: string; short: string; density: number }[] = [
  { value: "sw", label: "Salt (SW : 1.0000)", short: "Salt", density: 1.0 },
  { value: "bw", label: "Brackish (BW : 0.9878)", short: "Brackish", density: 0.9878 },
  { value: "fw", label: "Fresh (FW : 0.9756)", short: "Fresh", density: 0.9756 },
  { value: "tfw", label: "Tropical Fresh (TFW : 0.9717)", short: "Trop. Fresh", density: 0.9717 },
];

const seasonOptions: { value: IntakeSeason; label: string }[] = [
  { value: "summer", label: "Summer" },
  { value: "winter", label: "Winter" },
  { value: "tropical", label: "Tropical" },
];

const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

interface IntakeCalculatorProps {
  open: boolean;
  onClose: () => void;
  vessel: VesselData;
  ports: IntakePortInput[];
  stowageFactor: number; // cu.ft/mt
  targetPortId?: number | null;
  onApply: (quantity: number, ports: IntakePortResult[]) => void;
}

const fieldLabel = "text-[10px] uppercase tracking-wide text-muted-foreground font-semibold";
const fieldWrap = "flex flex-col gap-1";
const inputBox =
  "form-input-sm h-8 w-full text-[12px] font-mono tabular-nums pr-10";

function Field({ label, unit, children }: { label: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className={fieldWrap}>
      <span className={fieldLabel}>{label}</span>
      <div className="relative">
        {children}
        {unit && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function IntakeCalculator({
  open,
  onClose,
  vessel,
  ports,
  stowageFactor: initialSF,
  targetPortId,
  onApply,
}: IntakeCalculatorProps) {
  const [summerDwt, setSummerDwt] = useState("");
  const [summerDraft, setSummerDraft] = useState("");
  const [baseDraft, setBaseDraft] = useState("");
  const [tpc, setTpc] = useState("");
  const [constants, setConstants] = useState("");
  const [bob, setBob] = useState("");
  const [freshWater, setFreshWater] = useState("");
  const [grainCuFt, setGrainCuFt] = useState("");
  const [grainCuM, setGrainCuM] = useState("");
  const [sf, setSf] = useState("");
  const [cargoType, setCargoType] = useState("");
  const [customCargos, setCustomCargos] = useState<StowageFactorOption[]>(() => loadCustomStowageFactors());
  const [newCargoName, setNewCargoName] = useState("");
  const [newCargoSf, setNewCargoSf] = useState("");

  const cargoOptions = useMemo(
    () => [...customCargos, ...STOWAGE_FACTORS].sort((a, b) => a.name.localeCompare(b.name)),
    [customCargos],
  );

  const addCustomCargo = useCallback(() => {
    const name = newCargoName.trim();
    const value = parseFloat(newCargoSf);
    if (!name || isNaN(value)) return;
    setCustomCargos(saveCustomStowageFactor({ name, sf: value }));
    setCargoType(name);
    setSf(String(value));
    setNewCargoName("");
    setNewCargoSf("");
  }, [newCargoName, newCargoSf]);

  const [rows, setRows] = useState<
    Record<number, { draft: string; water: IntakeWater; season: IntakeSeason }>
  >({});

  useEffect(() => {
    if (!open) return;
    setSummerDwt(String(vessel.dwt));
    setSummerDraft(String(vessel.draft));
    setBaseDraft(String(vessel.draft));
    setTpc(String(vessel.tpcTpi));
    setConstants("");
    setBob("");
    setFreshWater("");
    const cubicM3 = vessel.cubic || 0;
    setGrainCuM(String(cubicM3));
    setGrainCuFt(String(Math.round(cubicM3 * 35.3147)));
    setSf(initialSF ? String(initialSF) : "53");
    setRows(
      Object.fromEntries(
        ports.map((p) => [p.id, { draft: p.draft ? String(p.draft) : "", water: "sw" as IntakeWater, season: "summer" as IntakeSeason }]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const setRow = (id: number, patch: Partial<{ draft: string; water: IntakeWater; season: IntakeSeason }>) => {
    // Season change => reflect the seasonal draught in the VESSEL draught field
    if (patch.season) {
      const base = num(baseDraft);
      if (base > 0) {
        const seasonal =
          patch.season === "winter" ? base - base / 48 : patch.season === "tropical" ? base + base / 48 : base;
        setSummerDraft(seasonal.toFixed(2));
      }
    }
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { draft: "", water: "sw", season: "summer" }), ...patch } }));
  };

  const calc = useMemo(() => {
    const _summerDwt = num(summerDwt);
    const _summerDraft = num(baseDraft) > 0 ? num(baseDraft) : num(summerDraft);
    const _tpc = num(tpc);
    const _sf = num(sf);
    const totalDeductions = num(constants) + num(bob) + num(freshWater);
    const absoluteCap = _summerDwt - totalDeductions;

    const grainCuFtVal = num(grainCuFt) > 0 ? num(grainCuFt) : num(grainCuM) * 35.3147;
    const cubicIntake = _sf > 0 ? grainCuFtVal / _sf : Infinity;

    // Deadweight capacity (cubic side) uses seasonal DWT, no density/draft restriction
    const perPort = ports.map((p) => {
      const r = rows[p.id] ?? { draft: "", water: "sw" as IntakeWater, season: "summer" as IntakeSeason };
      const density = waterOptions.find((w) => w.value === r.water)?.density ?? 1;

      // 1. Seasonal draft / DWT
      const seasonalDraft =
        r.season === "winter"
          ? (_summerDraft * 47) / 48
          : r.season === "tropical"
            ? (_summerDraft * 49) / 48
            : _summerDraft;
      const seasonalDwt = _summerDwt - (_summerDraft - seasonalDraft) * 100 * _tpc;

      // 2. Port draft restriction
      const portDraft = num(r.draft);
      const draftLimitedDwt =
        portDraft > 0 && portDraft < seasonalDraft
          ? seasonalDwt - (seasonalDraft - portDraft) * 100 * _tpc
          : seasonalDwt;
      const dwtLoss = Math.max(0, seasonalDwt - draftLimitedDwt);
      const roundedDraftLimitedDwt = Math.round(draftLimitedDwt);

      // 3. Water density
      const waterAdjustedDwt = roundedDraftLimitedDwt * density;

      // 4. DWCC Calc
      const dwccCalc = waterAdjustedDwt - totalDeductions;

      // 5. DWCC Cubic
      const deadweightCapacity = seasonalDwt - totalDeductions;
      const dwccCubic = Math.min(cubicIntake, deadweightCapacity);

      // 6. Final DWCC
      const finalDwcc = Math.max(0, Math.round(Math.min(dwccCalc, dwccCubic)));

      return { port: p, seasonalDraft, dwtLoss, restricted: finalDwcc, dwccRaw: Math.max(0, Math.round(dwccCalc)) };
    });


    const relevant = perPort.filter((r) => r.port.kind !== "repos");
    const maxIntake = relevant.length
      ? Math.min(...relevant.map((r) => r.restricted))
      : Math.max(0, Math.min(Math.round(absoluteCap), Math.round(cubicIntake)));

    return {
      perPort,
      maxIntake: Math.max(0, maxIntake),
      cubicIntake: Math.max(0, Math.round(cubicIntake)),
      restrictedDwt: Math.max(0, maxIntake),
      totalDeductions,
    };
  }, [ports, rows, summerDwt, summerDraft, baseDraft, tpc, sf, constants, bob, freshWater, grainCuFt, grainCuM]);

  const sfM3 = num(sf) > 0 ? (num(sf) / 35.3147).toFixed(2) : "0.00";

  const opBadge = (p: IntakePortInput) => {
    if (p.operation === "loading") return { text: "L", cls: "bg-[hsl(var(--teal))] text-[hsl(var(--teal-foreground))]" };
    if (p.operation === "discharging") return { text: "D", cls: "bg-destructive text-destructive-foreground" };
    return { text: "•", cls: "bg-muted text-muted-foreground" };
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-[1200px] w-[95vw] p-0 gap-0 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-xl font-bold tracking-tight">Intake Calculator</DialogTitle>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[78vh] overflow-y-auto bg-muted/30">
          {/* Vessel line */}
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold flex items-center gap-1.5">
              <span className="text-primary">{vessel.name || "—"}</span>
              <span className="text-muted-foreground font-normal">
                {vessel.builtYear ? `(${vessel.builtYear}, ${Math.round((vessel.dwt || 0) / 1000)}k)` : `(${Math.round((vessel.dwt || 0) / 1000)}k)`}
                {vessel.type ? ` • ${vessel.type}` : ""}
              </span>
            </div>
          </div>

          {/* Cards row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-background p-3 grid grid-cols-2 gap-3">
              <Field label="Deadweight" unit="tons">
                <input type="number" className={inputBox} value={summerDwt} onChange={(e) => setSummerDwt(e.target.value)} />
              </Field>
              <Field label="Draught" unit="m">
                <input
                  type="number"
                  step="0.01"
                  className={inputBox}
                  value={summerDraft}
                  onChange={(e) => {
                    setSummerDraft(e.target.value);
                    setBaseDraft(e.target.value);
                  }}
                />
              </Field>
              <Field label="TPC" unit="tons/cm">
                <input type="number" step="0.1" className={inputBox} value={tpc} onChange={(e) => setTpc(e.target.value)} />
              </Field>
              <Field label="Grain Cubic" unit="m³">
                <input type="number" className={inputBox} value={grainCuM} onChange={(e) => handleGrainCuMChange(e.target.value)} />
              </Field>
            </div>

            <div className="rounded-lg border border-border bg-background p-3 grid grid-cols-3 gap-3">
              <Field label="Constants" unit="tons">
                <input type="number" className={inputBox} value={constants} onChange={(e) => setConstants(e.target.value)} />
              </Field>
              <Field label="Bunkers" unit="tons">
                <input type="number" className={inputBox} value={bob} onChange={(e) => setBob(e.target.value)} />
              </Field>
              <Field label="Fresh Water" unit="tons">
                <input type="number" className={inputBox} value={freshWater} onChange={(e) => setFreshWater(e.target.value)} />
              </Field>
              <div className="col-span-3 flex items-end justify-end">
                <span className="text-[10px] text-muted-foreground">
                  Total deductions: <span className="font-mono">{calc.totalDeductions.toLocaleString()} t</span>
                </span>
              </div>
            </div>
          </div>

          {/* Cargo row */}
          <div className="rounded-lg border border-border bg-background p-3 space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Field label="Cargo Type">
                <select
                  className="form-input-sm h-8 w-full text-[12px]"
                  value={cargoOptions.some((o) => o.name === cargoType) ? cargoType : ""}
                  onChange={(e) => {
                    const opt = cargoOptions.find((o) => o.name === e.target.value);
                    setCargoType(e.target.value);
                    if (opt) setSf(String(opt.sf));
                  }}
                >
                  <option value="">— Select cargo —</option>
                  {cargoOptions.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.custom ? `★ ${o.name}` : o.name} ({o.sf.toFixed(2)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Stowage" unit="ft³/ton">
                <input type="number" step="0.1" className={inputBox} value={sf} onChange={(e) => setSf(e.target.value)} />
              </Field>
              <Field label="Stowage" unit="m³/ton">
                <input readOnly className={`${inputBox} bg-muted/60`} value={sfM3} />
              </Field>
              <Field label="Restricted Intake (DWT)" unit="tons">
                <input readOnly className={`${inputBox} bg-muted/60`} value={calc.restrictedDwt.toLocaleString()} />
              </Field>
              <Field label="Restricted Intake (cubics)" unit="tons">
                <input readOnly className={`${inputBox} bg-muted/60`} value={Number.isFinite(calc.cubicIntake) ? calc.cubicIntake.toLocaleString() : "—"} />
              </Field>
            </div>

            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
              <div className="flex flex-col gap-1">
                <span className={fieldLabel}>Custom cargo</span>
                <input
                  className="form-input-sm h-8 w-48 text-[12px]"
                  placeholder="Cargo name"
                  value={newCargoName}
                  onChange={(e) => setNewCargoName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className={fieldLabel}>SF (ft³/ton)</span>
                <input
                  type="number"
                  step="0.1"
                  className="form-input-sm h-8 w-32 text-[12px] font-mono tabular-nums"
                  placeholder="0.00"
                  value={newCargoSf}
                  onChange={(e) => setNewCargoSf(e.target.value)}
                />
              </div>
              <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={addCustomCargo}>
                Add cargo
              </Button>
              {customCargos.some((c) => c.name === cargoType) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-[11px] text-destructive"
                  onClick={() => {
                    setCustomCargos(removeCustomStowageFactor(cargoType));
                    setCargoType("");
                  }}
                >
                  Remove "{cargoType}"
                </Button>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">
                Custom cargoes are saved on this device and marked ★.
              </span>
            </div>
          </div>

          {/* Ports table */}
          <div className="rounded-lg border border-border bg-background overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground uppercase tracking-wide text-[10px]">
                  <th className="text-left font-semibold px-3 py-2">Port</th>
                  <th className="text-left font-semibold px-3 py-2 w-40">Draught Restriction</th>
                  <th className="text-left font-semibold px-3 py-2 w-14">m</th>
                  <th className="text-left font-semibold px-3 py-2 w-44">Water Density</th>
                  <th className="text-left font-semibold px-3 py-2 w-36">Season</th>
                  <th className="text-right font-semibold px-3 py-2 w-28">DWT Loss</th>
                  <th className="text-right font-semibold px-3 py-2 w-36">Restricted Intake</th>
                  <th className="text-right font-semibold px-3 py-2 w-32">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {calc.perPort.map(({ port, dwtLoss, dwccRaw }) => {
                  const r = rows[port.id] ?? { draft: "", water: "sw" as IntakeWater, season: "summer" as IntakeSeason };
                  const badge = opBadge(port);
                  const isTarget = targetPortId === port.id;
                  return (
                    <tr key={port.id} className={`border-t border-border ${isTarget ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${badge.cls}`}>
                            {badge.text}
                          </span>
                          <span className="font-semibold truncate">{port.name || "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          className="form-input-sm h-7 w-full text-[11px] font-mono text-right"
                          value={r.draft}
                          placeholder="—"
                          onChange={(e) => setRow(port.id, { draft: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">m</td>
                      <td className="px-3 py-1.5">
                        <select
                          className="form-select-sm h-7 w-full text-[11px]"
                          value={r.water}
                          onChange={(e) => setRow(port.id, { water: e.target.value as IntakeWater })}
                        >
                          {waterOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.short}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          className="form-select-sm h-7 w-full text-[11px]"
                          value={r.season}
                          onChange={(e) => setRow(port.id, { season: e.target.value as IntakeSeason })}
                        >
                          {seasonOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {dwtLoss > 0 ? `${Math.round(dwtLoss).toLocaleString()} t` : "–"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {dwccRaw.toLocaleString()} tons
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums font-semibold">
                        {port.operation === "loading" || port.operation === "discharging"
                          ? `${calc.maxIntake.toLocaleString()} tons`
                          : "–"}
                      </td>
                    </tr>
                  );
                })}
                {calc.perPort.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      No ports in the voyage sequence yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-border">
          <span className="text-[13px] mr-auto sm:mr-0">
            Maximum Intake : <span className="font-bold font-mono">{calc.maxIntake.toLocaleString()} tons</span>
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() =>
              onApply(
                calc.maxIntake,
                calc.perPort
                  .map(({ port }) => ({ id: port.id, draft: num(rows[port.id]?.draft ?? "") }))
                  .filter((p) => p.draft > 0),
              )
            }
          >
            Update Intake
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
