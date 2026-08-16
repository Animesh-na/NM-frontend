import * as XLSX from "xlsx-js-style";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import type { VesselData } from "@/data/vessels";
import type { SequenceRowUI, CargoEntry, MiscState } from "@/context/VoyageContext";
import { calculatePortDays } from "@/context/VoyageContext";
import { CO2_EMISSION_FACTORS } from "@/utils/emissionCalculations";
import { calculateCargoDemurrageDespatch, calculateDemurrageDespatchTotals } from "@/utils/demurrageDespatch";
import { buildFuelPricing, effectivePrice, type FuelKey } from "@/utils/bunkerPricing";
import { computeFifoCoverage, orderBunkerLots, termsFactorOf, splitPortStay } from "@/utils/fuelBreakdown";
import { getApiMode } from "@/services/apiMode";
import { FUEL_EU_PENALTY_RATE_EUR_PER_MJ, FUEL_EU_PROPERTIES } from "@/utils/fuelEuMaritime";
import { getUkEtsPortCoverage, getUkEtsSeaCoverage } from "@/utils/ukEtsCalculations";

export interface ExportBunkerLot { quantity: number; price: number }
export interface ExportPortBunkering {
  portUnloc?: string;
  port?: string;
  hsfo: ExportBunkerLot;
  vlsfo: ExportBunkerLot;
  lsmgo: ExportBunkerLot;
}

interface ExportData {
  vessel: VesselData;
  sequence: SequenceRowUI[];
  cargos: CargoEntry[];
  bunker: {
    hsfo: { price: number; robStart: number };
    vlsfo: { price: number; robStart: number };
    lsmgo: { price: number; robStart: number };
    co2Price: number;
    rewardFactor: number;
    euEtsPrice?: number;
    ukEtsPrice?: number;
    fuelMode?: "average" | "fifo";
    ignoreBOB?: boolean;
    portBunkering?: ExportPortBunkering[];
  };
  misc: MiscState;
  hireRate: number;
  netBB: number;
  results: VoyageResults;
  applyEuaImpact?: boolean;
  applyFuelEuImpact?: boolean;
  applyUkEtsImpact?: boolean;
}

// ═══════════════════════════════════════════════════════
// STYLE DEFINITIONS — Industrial Maritime Theme
// ═══════════════════════════════════════════════════════

const COLORS = {
  // Headers & Sections
  headerBg: "1B2A4A",       // Dark navy
  headerFont: "FFFFFF",     // White text
  sectionBg: "2C3E6B",     // Medium navy
  sectionFont: "FFFFFF",   
  subSectionBg: "E8EAF0",  // Light grey-blue
  subSectionFont: "1B2A4A",
  
  // Data types
  inputBg: "F0F0F0",       // Light grey for inputs
  inputFont: "333333",     
  formulaBg: "E8F5E9",     // Light green for Excel formulas
  formulaFont: "1B5E20",   // Dark green text
  softwareBg: "E3F2FD",    // Light blue for software values
  softwareFont: "0D47A1",  // Dark blue text
  
  // Sequence table
  seqHeaderBg: "37474F",   // Dark grey
  seqHeaderFont: "FFFFFF",
  seqAltBg: "F5F5F5",      // Zebra stripe
  seqFormulaColBg: "F1F8E9",// Pale green for formula cols
  
  // Accents
  totalBg: "FFF3E0",       // Light orange for totals
  totalFont: "E65100",     // Dark orange
  profitBg: "E8F5E9",
  profitFont: "1B5E20",
  envBg: "E0F7FA",         // Light cyan for environmental
  envFont: "006064",
  
  borderColor: "BDBDBD",   // Grey borders
};

const FONT = {
  name: "Calibri",
  sz: 10,
};

// Style factories
function makeStyle(opts: {
  bg?: string; fg?: string; bold?: boolean; sz?: number;
  border?: boolean; numFmt?: string; align?: string;
}): any {
  const s: any = {
    font: {
      name: FONT.name,
      sz: opts.sz || FONT.sz,
      color: { rgb: opts.fg || "000000" },
      bold: opts.bold || false,
    },
  };
  if (opts.bg) {
    s.fill = { fgColor: { rgb: opts.bg }, patternType: "solid" };
  }
  if (opts.border) {
    const side = { style: "thin", color: { rgb: COLORS.borderColor } };
    s.border = { top: side, bottom: side, left: side, right: side };
  }
  if (opts.numFmt) s.numFmt = opts.numFmt;
  s.alignment = { vertical: "center", horizontal: opts.align || "left" };
  return s;
}

const S = {
  title: makeStyle({ bg: COLORS.headerBg, fg: COLORS.headerFont, bold: true, sz: 14 }),
  subtitle: makeStyle({ bg: COLORS.headerBg, fg: COLORS.headerFont, sz: 9 }),
  section: makeStyle({ bg: COLORS.sectionBg, fg: COLORS.sectionFont, bold: true, sz: 11 }),
  subSection: makeStyle({ bg: COLORS.subSectionBg, fg: COLORS.subSectionFont, bold: true, sz: 10, border: true }),
  
  inputLabel: makeStyle({ bold: true, border: true }),
  inputValue: makeStyle({ bg: COLORS.inputBg, fg: COLORS.inputFont, border: true, align: "right" }),
  inputText: makeStyle({ bg: COLORS.inputBg, fg: COLORS.inputFont, border: true }),
  
  calcLabel: makeStyle({ bold: true, border: true }),
  formula: makeStyle({ bg: COLORS.formulaBg, fg: COLORS.formulaFont, border: true, align: "right", numFmt: "#,##0.00" }),
  software: makeStyle({ bg: COLORS.softwareBg, fg: COLORS.softwareFont, border: true, align: "right", numFmt: "#,##0.00" }),
  
  totalLabel: makeStyle({ bg: COLORS.totalBg, fg: COLORS.totalFont, bold: true, border: true, sz: 11 }),
  totalFormula: makeStyle({ bg: COLORS.totalBg, fg: COLORS.totalFont, bold: true, border: true, align: "right", numFmt: "#,##0.00", sz: 11 }),
  totalSoftware: makeStyle({ bg: COLORS.totalBg, fg: COLORS.totalFont, bold: true, border: true, align: "right", numFmt: "#,##0.00", sz: 11 }),
  
  profitLabel: makeStyle({ bg: COLORS.profitBg, fg: COLORS.profitFont, bold: true, border: true, sz: 11 }),
  profitFormula: makeStyle({ bg: COLORS.profitBg, fg: COLORS.profitFont, bold: true, border: true, align: "right", numFmt: "#,##0.00", sz: 11 }),
  profitSoftware: makeStyle({ bg: COLORS.profitBg, fg: COLORS.profitFont, bold: true, border: true, align: "right", numFmt: "#,##0.00", sz: 11 }),
  
  envLabel: makeStyle({ bg: COLORS.envBg, fg: COLORS.envFont, bold: false, border: true }),
  envFormula: makeStyle({ bg: COLORS.envBg, fg: COLORS.envFont, border: true, align: "right", numFmt: "#,##0.00" }),
  envSoftware: makeStyle({ bg: COLORS.envBg, fg: COLORS.envFont, border: true, align: "right", numFmt: "#,##0.00" }),
  
  seqHeader: makeStyle({ bg: COLORS.seqHeaderBg, fg: COLORS.seqHeaderFont, bold: true, sz: 9, border: true, align: "center" }),
  seqData: makeStyle({ border: true, align: "right", sz: 9 }),
  seqDataAlt: makeStyle({ bg: COLORS.seqAltBg, border: true, align: "right", sz: 9 }),
  seqText: makeStyle({ border: true, sz: 9 }),
  seqTextAlt: makeStyle({ bg: COLORS.seqAltBg, border: true, sz: 9 }),
  seqFormula: makeStyle({ bg: COLORS.seqFormulaColBg, fg: COLORS.formulaFont, border: true, align: "right", sz: 9, numFmt: "#,##0.00" }),
  seqFormulaAlt: makeStyle({ bg: "E8F0DC", fg: COLORS.formulaFont, border: true, align: "right", sz: 9, numFmt: "#,##0.00" }),
  
  colHeaderFormula: makeStyle({ bg: COLORS.formulaBg, fg: COLORS.formulaFont, bold: true, border: true, align: "center", sz: 10 }),
  colHeaderSoftware: makeStyle({ bg: COLORS.softwareBg, fg: COLORS.softwareFont, bold: true, border: true, align: "center", sz: 10 }),
};

// Convert 0-indexed column number to Excel column letter (0→A, 25→Z, 26→AA)
function colLetter(c: number): string {
  let s = "";
  let n = c + 1;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function cellRef(c: number, r: number): string {
  return `${colLetter(c)}${r}`;
}

export function exportVoyageToExcel(data: ExportData) {
  const {
    vessel, sequence, cargos, bunker, misc, hireRate, netBB, results,
    applyEuaImpact, applyFuelEuImpact, applyUkEtsImpact,
  } = data;
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  const cargo = cargos[0] || {
    rate: 0, rateType: "mt", quantity: 0, voyageCommission: 0, tcCommission: 0,
    demurrageRate: 0, despatchRate: 0, demurrageAmount: 0, despatchAmount: 0, stowageFactor: 0,
  };

  // Derive quantity from sequence (sum of loading operations) — matches calculation engine
  const sequenceCargoQuantity = Math.max(
    sequence.filter(r => r.operation === "loading").reduce((sum, r) => sum + (r.quantity || 0), 0),
    sequence.filter(r => r.operation === "discharging").reduce((sum, r) => sum + (r.quantity || 0), 0),
  );
  const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
  const hasScrubber = vessel.hasScrubber === true;
  const isTanker = getApiMode() === "tanker";
  // Effective $/mt per cargo — tanker sheets apply the Worldscale percentage
  // to the flat rate (WS may exceed 100). Lumpsum and dry bulk are unchanged.
  const effRate = (c: { rate: number; rateType: string; worldscale?: number }) => {
    const rate = c.rate || 0;
    if (c.rateType === "lumpsum" || !isTanker) return rate;
    return rate * ((c.worldscale ?? 100) / 100);
  };

  const isLoadOp = (op?: string) => {
    const o = (op || "").toLowerCase();
    return o === "load" || o === "loading";
  };
  const isDischargeOp = (op?: string) => {
    const o = (op || "").toLowerCase();
    return o === "disch" || o === "discharging";
  };
  const isEuRegulatoryPortCall = (leg: SequenceRowUI): boolean => {
    const op = (leg.operation || "").toLowerCase();
    return !!(leg.portUnloc || leg.port || "").trim() && op !== "pssg" && op !== "bunkering";
  };

  // ---- Styled Cell writing helpers ----
  function setText(c: number, r: number, v: string, style?: any) {
    ws[cellRef(c, r)] = { t: "s", v, s: style || S.inputLabel };
  }
  function setNum(c: number, r: number, v: number, style?: any) {
    ws[cellRef(c, r)] = { t: "n", v, s: style || S.inputValue };
  }
  function setFormula(c: number, r: number, f: string, v: number, style?: any) {
    ws[cellRef(c, r)] = { t: "n", f, v, s: style || S.seqFormula };
  }
  
  // setCalcFormula: formula in col B (green) + software value in col C (blue) for comparison
  function setCalcFormula(r: number, f: string, v: number, isTotal = false, isProfit = false, isEnv = false) {
    const fStyle = isTotal ? S.totalFormula : isProfit ? S.profitFormula : isEnv ? S.envFormula : S.formula;
    const sStyle = isTotal ? S.totalSoftware : isProfit ? S.profitSoftware : isEnv ? S.envSoftware : S.software;
    ws[cellRef(1, r)] = { t: "n", f, v, s: fStyle };
    ws[cellRef(2, r)] = { t: "n", v, s: sStyle };
  }
  
  // Section header spanning 3 cols
  function setSectionHeader(r: number, title: string) {
    for (let c = 0; c < 3; c++) {
      ws[cellRef(c, r)] = { t: "s", v: c === 0 ? title : "", s: S.section };
    }
  }
  
  // Sub-section header
  function setSubSectionHeader(r: number, title: string) {
    for (let c = 0; c < 3; c++) {
      ws[cellRef(c, r)] = { t: "s", v: c === 0 ? title : "", s: S.subSection };
    }
  }
  
  // Calc row label (with optional style)
  function setCalcLabel(r: number, label: string, isTotal = false, isProfit = false, isEnv = false) {
    const style = isTotal ? S.totalLabel : isProfit ? S.profitLabel : isEnv ? S.envLabel : S.calcLabel;
    ws[cellRef(0, r)] = { t: "s", v: label, s: style };
  }

  let r = 1; // current row (1-indexed for Excel)

  // ═══════════════════════════════════════════════════════
  // SECTION 1: ALL MANUAL INPUTS
  // ═══════════════════════════════════════════════════════

  // Title row
  for (let c = 0; c < 3; c++) ws[cellRef(c, r)] = { t: "s", v: c === 0 ? "VOYAGE ESTIMATION — FORMULA WORKBOOK" : "", s: S.title };
  r++;
  for (let c = 0; c < 3; c++) ws[cellRef(c, r)] = { t: "s", v: c === 0 ? "Generated" : c === 1 ? new Date().toLocaleString() : "", s: S.subtitle };
  r++; r++;

  // --- VESSEL ---
  setSectionHeader(r, "VESSEL PARTICULARS"); r++;
  setText(0, r, "Vessel Name", S.inputLabel); setText(1, r, vessel.name, S.inputText); r++;
  setText(0, r, "DWT", S.inputLabel); setNum(1, r, vessel.dwt); const R_DWT = r; r++;
  setText(0, r, "GT", S.inputLabel); setNum(1, r, vessel.gt); r++;
  setText(0, r, "Scrubber (1=Yes, 0=No)", S.inputLabel); setNum(1, r, hasScrubber ? 1 : 0); const R_SCR = r; r++;
  setText(0, r, "Speed Ballast (kn)", S.inputLabel); setNum(1, r, profile.speed.ballast); r++;
  setText(0, r, "Speed Laden (kn)", S.inputLabel); setNum(1, r, profile.speed.laden); r++;
  r++;

  // --- CONSUMPTION MATRIX ---
  setSectionHeader(r, "CONSUMPTION RATES (TPD)"); r++;
  const rateColNames = ["Ballast", "Laden", "Load", "Disch", "Idle", "Canal"];
  setText(0, r, "", S.seqHeader);
  rateColNames.forEach((h, i) => setText(i + 1, r, h, S.seqHeader)); r++;

  const R_HSFO = r;
  setText(0, r, "HSFO", S.inputLabel);
  [profile.hsfo.ballast, profile.hsfo.laden, profile.hsfo.load, profile.hsfo.discharge, profile.hsfo.idle, profile.hsfo.canal]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;

  const R_VLSFO = r;
  setText(0, r, "VLSFO", S.inputLabel);
  [profile.vlsfo.ballast, profile.vlsfo.laden, profile.vlsfo.load, profile.vlsfo.discharge, profile.vlsfo.idle, profile.vlsfo.canal]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;

  const R_LSMGO = r;
  setText(0, r, "LSMGO", S.inputLabel);
  [profile.lsmgo.ballast, profile.lsmgo.laden, profile.lsmgo.load, profile.lsmgo.discharge, profile.lsmgo.idle, profile.lsmgo.canal]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;

  const R_AE = r;
  setText(0, r, "AE", S.inputLabel);
  [profile.ae.ballast, profile.ae.laden, profile.ae.load, profile.ae.discharge, profile.ae.idle]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;

  const R_AESCR = r;
  setText(0, r, "AE+Scrubber", S.inputLabel);
  [profile.aeScrubber?.ballast || 0, profile.aeScrubber?.laden || 0, profile.aeScrubber?.load || 0, profile.aeScrubber?.discharge || 0, profile.aeScrubber?.idle || 0]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;
  r++;

  // --- CARGO (multi-cargo aware, Worldscale for tanker sheets) ---
  // Every cargo is listed with its own rate / WS / loaded qty / commissions
  // and its own Gross Freight formula. The aggregate block below sums those
  // cells exactly the way the engine aggregates cargo entries.
  type CargoInputRows = {
    rate: { col: number; row: number };
    ws: { col: number; row: number };
    effRate: { col: number; row: number };
    rateType: { col: number; row: number };
    qty: { col: number; row: number };
    voyComm: { col: number; row: number };
    tcComm: { col: number; row: number };
    dem: { col: number; row: number };
    desp: { col: number; row: number };
    gf: { col: number; row: number };
  };
  const cargoInputRows: CargoInputRows[] = [];

  setSectionHeader(r, `CARGO (${cargos.length} entr${cargos.length === 1 ? "y" : "ies"}${isTanker ? " — Tanker / Worldscale" : ""})`); r++;
  const mcHeaders = [
    "Cargo", "Flat Rate", "WS %", "Eff. Rate ($/mt)", "Type", "Loaded Qty (MT)",
    "Voy Comm %", "TC Comm %", "Demurrage $", "Despatch $", "Gross Freight $",
  ];
  mcHeaders.forEach((h, i) => setText(i, r, h, S.seqHeader)); r++;
  cargos.forEach((c, i) => {
    const isAlt = i % 2 === 1;
    const dStyle = isAlt ? S.seqDataAlt : S.seqData;
    const tStyle = isAlt ? S.seqTextAlt : S.seqText;
    const fStyle = isAlt ? S.seqFormulaAlt : S.seqFormula;
    const pc = results.perCargoBreakdown?.find(p => p.cargoId === c.id);
    const loadedQty = pc?.loadedQty ?? (cargos.length === 1 ? sequenceCargoQuantity : 0);
    const ws = isTanker ? (c.worldscale ?? 100) : 100;
    const er = effRate(c);
    const cargoDemDesp = calculateCargoDemurrageDespatch(c, cargos, sequence);

    setText(0, r, `#${i + 1}`, tStyle);
    setNum(1, r, c.rate, dStyle);
    setNum(2, r, ws, dStyle);
    setFormula(3, r, `IF(${cellRef(4, r)}="lumpsum",${cellRef(1, r)},${cellRef(1, r)}*${cellRef(2, r)}/100)`, er, fStyle);
    setText(4, r, c.rateType, tStyle);
    setNum(5, r, loadedQty, dStyle);
    setNum(6, r, c.voyageCommission, dStyle);
    setNum(7, r, c.tcCommission, dStyle);
    setNum(8, r, cargoDemDesp.demurrageAmount, dStyle);
    setNum(9, r, cargoDemDesp.despatchAmount, dStyle);
    setFormula(
      10, r,
      `IF(${cellRef(4, r)}="lumpsum",${cellRef(1, r)},${cellRef(3, r)}*${cellRef(5, r)})`,
      c.rateType === "lumpsum" ? (c.rate || 0) : er * loadedQty,
      fStyle,
    );
    cargoInputRows.push({
      rate: { col: 1, row: r },
      ws: { col: 2, row: r },
      effRate: { col: 3, row: r },
      rateType: { col: 4, row: r },
      qty: { col: 5, row: r },
      voyComm: { col: 6, row: r },
      tcComm: { col: 7, row: r },
      dem: { col: 8, row: r },
      desp: { col: 9, row: r },
      gf: { col: 10, row: r },
    });
    r++;
  });
  r++;

  const demurrageDespatchTotals = calculateDemurrageDespatchTotals(cargos, sequence);
  const totalDemurrage = demurrageDespatchTotals.demurrageAmount;
  const totalDespatch = demurrageDespatchTotals.despatchAmount;
  const gfRefs = cargoInputRows.map(ir => cellRef(ir.gf.col, ir.gf.row));
  const demRefs = cargoInputRows.map(ir => cellRef(ir.dem.col, ir.dem.row));
  const despRefs = cargoInputRows.map(ir => cellRef(ir.desp.col, ir.desp.row));
  const vcRefsAll = cargoInputRows.map(ir => cellRef(ir.voyComm.col, ir.voyComm.row));
  const tcRefsAll = cargoInputRows.map(ir => cellRef(ir.tcComm.col, ir.tcComm.row));

  const svBaseGrossFreight = cargos.reduce((s, c) => {
    const pc = results.perCargoBreakdown?.find(p => p.cargoId === c.id);
    const q = pc?.loadedQty ?? (cargos.length === 1 ? sequenceCargoQuantity : 0);
    return s + (c.rateType === "lumpsum" ? (c.rate || 0) : effRate(c) * q);
  }, 0);
  const svAvgVoyComm = cargos.length
    ? cargos.reduce((s, c) => s + (c.voyageCommission || 0), 0) / cargos.length : 0;
  const svAvgTcComm = cargos.length
    ? cargos.reduce((s, c) => s + (c.tcCommission || 0), 0) / cargos.length : 0;
  const svBlendedRate = sequenceCargoQuantity > 0 ? svBaseGrossFreight / sequenceCargoQuantity : 0;

  setSubSectionHeader(r, "AGGREGATED CARGO (engine inputs)"); r++;
  setText(0, r, "Base Gross Freight ($) = Σ cargo freight", S.inputLabel);
  setFormula(1, r, gfRefs.length ? gfRefs.join("+") : "0", svBaseGrossFreight, S.formula);
  const R_BASEGF = r; r++;
  setText(0, r, "Quantity (MT) — from sequence", S.inputLabel); setNum(1, r, sequenceCargoQuantity); const R_QTY = r; r++;
  setText(0, r, "Blended Rate ($/mt)", S.inputLabel);
  setFormula(1, r, `IF(${cellRef(1, R_QTY)}>0,${cellRef(1, R_BASEGF)}/${cellRef(1, R_QTY)},0)`, svBlendedRate, S.formula);
  const R_RATE = r; r++;
  setText(0, r, "Rate Type", S.inputLabel); setText(1, r, "mt", S.inputText); const R_RTYPE = r; r++;
  setText(0, r, "Voyage Comm (%) — avg", S.inputLabel);
  setFormula(1, r, vcRefsAll.length ? `AVERAGE(${vcRefsAll.join(",")})` : "0", svAvgVoyComm, S.formula);
  const R_VCOMM = r; r++;
  setText(0, r, "TC Comm (%) — avg", S.inputLabel);
  setFormula(1, r, tcRefsAll.length ? `AVERAGE(${tcRefsAll.join(",")})` : "0", svAvgTcComm, S.formula);
  const R_TCOMM = r; r++;
  setText(0, r, "Demurrage ($)", S.inputLabel);
  setFormula(1, r, demRefs.length ? demRefs.join("+") : "0", totalDemurrage, S.formula);
  const R_DEM = r; r++;
  setText(0, r, "Despatch ($)", S.inputLabel);
  setFormula(1, r, despRefs.length ? despRefs.join("+") : "0", totalDespatch, S.formula);
  const R_DESP = r; r++;
  r++;

  // --- BUNKER PRICES (BOB + every bunkering port lot) ---
  // Align stems to the order their bunkering calls occur in the voyage so
  // multi-stem FIFO coverage maps to the right price lot.
  const portLots = orderBunkerLots(sequence, bunker.portBunkering || []);
  const fuelMode: "average" | "fifo" = bunker.fuelMode === "fifo" ? "fifo" : "average";
  const ignoreBOB = bunker.ignoreBOB === true;

  setSectionHeader(r, "BUNKER PRICES & FUEL ACCOUNTING"); r++;
  setText(0, r, "Fuel Mode", S.inputLabel); setText(1, r, fuelMode, S.inputText); r++;
  setText(0, r, "Ignore BOB (1=Yes, 0=No)", S.inputLabel); setNum(1, r, ignoreBOB ? 1 : 0); r++;

  // BOB lot
  setSubSectionHeader(r, "Bunker On Board (BOB)"); r++;
  setText(0, r, "Fuel", S.seqHeader); setText(1, r, "Price ($/mt)", S.seqHeader); setText(2, r, "ROB (mt)", S.seqHeader); r++;
  setText(0, r, "HSFO", S.inputLabel); setNum(1, r, bunker.hsfo.price); setNum(2, r, bunker.hsfo.robStart || 0); const R_HP = r; r++;
  setText(0, r, "VLSFO", S.inputLabel); setNum(1, r, bunker.vlsfo.price); setNum(2, r, bunker.vlsfo.robStart || 0); const R_VP = r; r++;
  setText(0, r, "LSMGO", S.inputLabel); setNum(1, r, bunker.lsmgo.price); setNum(2, r, bunker.lsmgo.robStart || 0); const R_LP = r; r++;
  r++;

  // Bunkering port lots — one row per stem, prices and (optional) quantities
  const lotPriceRefs: Record<FuelKey, string[]> = { hsfo: [], vlsfo: [], lsmgo: [] };
  const lotQtyRefs: Record<FuelKey, string[]> = { hsfo: [], vlsfo: [], lsmgo: [] };
  if (portLots.length > 0) {
    setSubSectionHeader(r, `BUNKERING PORTS (${portLots.length} stem${portLots.length === 1 ? "" : "s"})`); r++;
    ["Port", "HSFO $/mt", "HSFO mt", "VLSFO $/mt", "VLSFO mt", "LSMGO $/mt", "LSMGO mt"]
      .forEach((h, i) => setText(i, r, h, S.seqHeader));
    r++;
    portLots.forEach((p, i) => {
      const isAlt = i % 2 === 1;
      const dStyle = isAlt ? S.seqDataAlt : S.seqData;
      const tStyle = isAlt ? S.seqTextAlt : S.seqText;
      setText(0, r, p.port || p.portUnloc || `Stem ${i + 1}`, tStyle);
      (["hsfo", "vlsfo", "lsmgo"] as FuelKey[]).forEach((f, fi) => {
        const pc = 1 + fi * 2;
        setNum(pc, r, p[f]?.price || 0, dStyle);
        setNum(pc + 1, r, p[f]?.quantity || 0, dStyle);
        lotPriceRefs[f].push(cellRef(pc, r));
        lotQtyRefs[f].push(cellRef(pc + 1, r));
      });
      r++;
    });
    r++;
  }

  // Effective $/mt per fuel — mirrors utils/bunkerPricing (average / FIFO with
  // consumption coverage) so multiple bunker stems price exactly as the engine.
  // Coverage must be computed on the SAME effective rows the engine uses
  // (operational overrides applied), otherwise multi-stem FIFO weights drift
  // and the workbook falls back to a hardcoded price.
  const coverageRows = sequence.map((leg) => ({
    ...leg,
    portDays: leg.type === "open" || leg.type === "repos" ? 0 : effectiveLeg(leg).portDays,
  }));
  const fifoCoverage = computeFifoCoverage(
    coverageRows,
    vessel,
    portLots,
    bunker.rewardFactor,
  );
  const bobPriceRef: Record<FuelKey, string> = {
    hsfo: cellRef(1, R_HP), vlsfo: cellRef(1, R_VP), lsmgo: cellRef(1, R_LP),
  };
  const bobQtyRef: Record<FuelKey, string> = {
    hsfo: cellRef(2, R_HP), vlsfo: cellRef(2, R_VP), lsmgo: cellRef(2, R_LP),
  };
  const consumptionFor: Record<FuelKey, number> = {
    hsfo: results.hsfoConsumption,
    vlsfo: results.vlsfoConsumption,
    lsmgo: results.lsmgoConsumption,
  };

  // --- FIFO CONSUMPTION COVERAGE AUDIT (one row per price lot) ---
  // Each lot covers the fuel burnt from the moment it is stemmed until the next
  // bunkering call. With several stems this is what makes FIFO a true
  // consumption-weighted blend instead of a single price.
  const covRefs: Record<FuelKey, string[]> = { hsfo: [], vlsfo: [], lsmgo: [] };
  if (fuelMode === "fifo") {
    setSubSectionHeader(r, "FIFO CONSUMPTION COVERAGE (mt burnt under each price lot)"); r++;
    ["Price Lot", "HSFO covered (mt)", "VLSFO covered (mt)", "LSMGO covered (mt)"]
      .forEach((h, i) => setText(i, r, h, S.seqHeader));
    r++;
    const lotNames = ["BOB (voyage start → 1st bunkering)",
      ...portLots.map((p, i) => `Stem ${i + 1} — ${p.port || p.portUnloc || "Bunkering port"}`)];
    lotNames.forEach((name, i) => {
      const isAlt = i % 2 === 1;
      setText(0, r, name, isAlt ? S.seqTextAlt : S.seqText);
      (["hsfo", "vlsfo", "lsmgo"] as FuelKey[]).forEach((f, fi) => {
        setNum(fi + 1, r, fifoCoverage[f]?.[i] || 0, isAlt ? S.seqDataAlt : S.seqData);
        covRefs[f].push(cellRef(fi + 1, r));
      });
      r++;
    });
    r++;
  }

  /** Build the Excel formula that reproduces the effective price for one fuel. */
  function priceFormula(fuel: FuelKey): string {
    const prices = [bunker[fuel].price || 0, ...portLots.map((p) => p[fuel]?.price || 0)];
    const qtys = [bunker[fuel].robStart || 0, ...portLots.map((p) => p[fuel]?.quantity || 0)];
    const priceRefs = [bobPriceRef[fuel], ...lotPriceRefs[fuel]];
    const qtyRefs = [bobQtyRef[fuel], ...lotQtyRefs[fuel]];
    const skip = (i: number) => (i === 0 && ignoreBOB) || prices[i] <= 0;

    if (fuelMode === "fifo") {
      const cov = fifoCoverage[fuel] || [];
      // Coverage of skipped lots (BOB ignored / no price) carries forward to the
      // next priced lot, exactly like utils/bunkerPricing.coverageWeightedPrice.
      const weights: { priceRef: string; covRefs: string[]; w: number }[] = [];
      let carried: string[] = [];
      let carriedW = 0;
      for (let i = 0; i < prices.length; i++) {
        const c = Math.max(0, cov[i] || 0);
        const ref = covRefs[fuel][i];
        if (skip(i)) { if (ref) carried.push(ref); carriedW += c; continue; }
        weights.push({
          priceRef: priceRefs[i],
          covRefs: [...(ref ? [ref] : []), ...carried],
          w: c + carriedW,
        });
        carried = [];
        carriedW = 0;
      }
      const totalW = weights.reduce((s, x) => s + x.w, 0);
      if (weights.length > 0 && totalW > 0) {
        if (carriedW > 0) {
          weights[weights.length - 1].w += carriedW;
          weights[weights.length - 1].covRefs.push(...carried);
        }
        const usable = weights.every((x) => x.covRefs.length > 0);
        if (usable) {
          // Live formula: Σ(price × covered mt) / Σ(covered mt) across every lot.
          const num = weights.map((x) => `${x.priceRef}*(${x.covRefs.join("+")})`).join("+");
          const den = weights.map((x) => `(${x.covRefs.join("+")})`).join("+");
          return `(${num})/(${den})`;
        }
        const num = weights.map((x) => `${x.priceRef}*${x.w}`).join("+");
        const den = weights.reduce((s, x) => s + x.w, 0);
        return `(${num})/${den}`;
      }
    }

    // Average mode (also the FIFO fallback when no coverage exists)
    const active = prices.map((_, i) => i).filter((i) => !skip(i));
    if (active.length === 0) return ignoreBOB ? "0" : bobPriceRef[fuel];
    const totalQty = active.reduce((s, i) => s + Math.max(0, qtys[i]), 0);
    if (totalQty > 0) {
      const num = active.map((i) => `${priceRefs[i]}*${qtyRefs[i]}`).join("+");
      const den = active.map((i) => qtyRefs[i]).join("+");
      return `(${num})/(${den})`;
    }
    return `AVERAGE(${active.map((i) => priceRefs[i]).join(",")})`;
  }

  // Prefer the exact prices the engine used (results.effectiveFuelPrices) so the
  // exported bunker cost ties out to the software to the cent. Fall back to a
  // local recompute only for older result payloads.
  const enginePrices = (results as { effectiveFuelPrices?: { hsfo: number; vlsfo: number; lsmgo: number } })
    .effectiveFuelPrices;
  const localPrice = (f: FuelKey) =>
    effectivePrice(
      buildFuelPricing({ ...bunker, fuelMode, ignoreBOB, portBunkering: portLots }, f, fifoCoverage[f]),
      consumptionFor[f],
    );
  const effPriceValue: Record<FuelKey, number> = {
    hsfo: enginePrices?.hsfo ?? localPrice("hsfo"),
    vlsfo: enginePrices?.vlsfo ?? localPrice("vlsfo"),
    lsmgo: enginePrices?.lsmgo ?? localPrice("lsmgo"),
  };

  setSubSectionHeader(r, `EFFECTIVE FUEL PRICE ($/mt) — mode: ${fuelMode}${ignoreBOB ? " (BOB ignored)" : ""}`); r++;
  // If the workbook formula would drift from the engine price (e.g. missing stem
  // quantities), fall back to the engine value so Excel and software agree.
  const priceCellFormula = (f: FuelKey) =>
    Math.abs(localPrice(f) - effPriceValue[f]) > 0.01 ? `${effPriceValue[f]}` : priceFormula(f);
  setText(0, r, "HSFO Effective Price", S.inputLabel);
  setFormula(1, r, priceCellFormula("hsfo"), effPriceValue.hsfo, S.formula);
  setNum(2, r, effPriceValue.hsfo, S.software);
  const R_HPE = r; r++;
  setText(0, r, "VLSFO Effective Price", S.inputLabel);
  setFormula(1, r, priceCellFormula("vlsfo"), effPriceValue.vlsfo, S.formula);
  setNum(2, r, effPriceValue.vlsfo, S.software);
  const R_VPE = r; r++;
  setText(0, r, "LSMGO Effective Price", S.inputLabel);
  setFormula(1, r, priceCellFormula("lsmgo"), effPriceValue.lsmgo, S.formula);
  setNum(2, r, effPriceValue.lsmgo, S.software);
  const R_LPE = r; r++;
  r++;

  setText(0, r, "CO₂ Price ($/mt)", S.inputLabel); setNum(1, r, bunker.co2Price); const R_CO2P = r; r++;
  setText(0, r, "EU ETS Price ($/mt)", S.inputLabel); setNum(1, r, bunker.euEtsPrice || bunker.co2Price || 0); const R_EUP = r; r++;
  setText(0, r, "UK ETS Price ($/mt)", S.inputLabel); setNum(1, r, bunker.ukEtsPrice || bunker.co2Price || 0); const R_UKP = r; r++;
  setText(0, r, "Reward Factor", S.inputLabel); setNum(1, r, bunker.rewardFactor); const R_RF = r; r++;
  r++;

  // --- HIRE ---
  setSectionHeader(r, "HIRE"); r++;
  setText(0, r, "Daily Hire Rate ($/day)", S.inputLabel); setNum(1, r, hireRate); const R_HIRE = r; r++;
  setText(0, r, "Net BB ($)", S.inputLabel); setNum(1, r, netBB); const R_BB = r; r++;
  r++;

  // --- MISC ---
  setSectionHeader(r, "MISC COSTS"); r++;
  setText(0, r, "Misc Cost ($)", S.inputLabel); setNum(1, r, misc.miscCost); const R_MISC = r; r++;
  setText(0, r, "Extra Fees ($)", S.inputLabel); setNum(1, r, misc.extraFees); const R_XFEE = r; r++;
  setText(0, r, "Extra Insurance ($)", S.inputLabel); setNum(1, r, misc.extraInsurance); const R_XINS = r; r++;
  setText(0, r, "Canal Cost 1 ($)", S.inputLabel); setNum(1, r, misc.canalCost1); const R_CC1 = r; r++;
  setText(0, r, "Canal Cost 2 ($)", S.inputLabel); setNum(1, r, misc.canalCost2); const R_CC2 = r; r++;
  r++;

  // --- EXTRA TIME ---
  setSectionHeader(r, "EXTRA TIME"); r++;
  setText(0, r, "Extra Sea Days", S.inputLabel); setNum(1, r, results.extraSeaDays); const R_XSEA = r; r++;
  setText(0, r, "Extra Port Days", S.inputLabel); setNum(1, r, results.extraPortDays); const R_XPORT = r; r++;
  setText(0, r, "Extra Canal Days", S.inputLabel); setNum(1, r, results.extraCanalDays); const R_XCANAL = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 2: SEQUENCE TABLE (with formula helper columns)
  // ═══════════════════════════════════════════════════════

  setSectionHeader(r, "VOYAGE SEQUENCE — PORT CALLS, SEA LEGS & REGULATORY COVERAGE"); r++;

  // Column indices
  const SC = {
    ID: 0, OP: 1, PORT: 2, DIST: 3, ECAD: 4, SEAT: 5, ECAT: 6,
    PORTD: 7, TURNH: 8, DA: 9, LADEN: 10, PFUEL: 11, EUFLG: 12,
    // Formula columns
    NECAT: 13, WDAYS: 14, IDAYS: 15,
    BSEA: 16, LSEA: 17, ECAB: 18, ECAL: 19, NECAB: 20, NECAL: 21,
    ISLD: 22, ISDC: 23,
    HLD: 24, VLD: 25, LLD: 26,
    HDD: 27, VDD: 28, LDD: 29,
    HID: 30, VID: 31, LID: 32,
    // EU factor columns
    EUSEA: 33,  // EU sea factor for this segment (0, 0.5, or 1.0)
    EUPORT: 34, // EU port factor (0 or 1)
    TURND: 35,  // Turn time in days
    EXTRAD: 36, // Extra time in days
    WXDLY: 37,  // Weather delay (days)
    DEPUTC: 38, // Leg departure (UTC)
    ARRUTC: 39, // Leg arrival (UTC)
    LAYT: 40,   // Laytime (h) — tanker sheets drive port time from laytime
    EUWIN: 41,  // EU commercial voyage window (0/1)
    UKFLG: 42,  // UK ETS port flag
    UKZONE: 43, // gb / ni / blank
    UKSEA: 44,  // UK ETS sea factor
    UKPORT: 45, // UK ETS port factor
  };

  // Headers — styled
  const seqHeaders = [
    "Row ID",
    "Port Operation",
    "Port Name",
    "Distance Outside ECA (nautical miles)",
    "Distance Inside ECA (nautical miles)",
    "Total Sea Time (days)",
    "Sea Time Inside ECA (days)",
    "Port Stay (days)",
    "Turn Time + Extra Time (hours)",
    "Estimated Disbursement Account (USD)",
    "Laden Leg? (1 = Laden, 0 = Ballast)",
    "Fuel Burned in Port",
    "Port in EU / EEA? (1 = Yes, 0 = No)",
    "Sea Time Outside ECA (days)",
    "Cargo Working Time in Port (days)",
    "Idle / Waiting Time in Port (days)",
    "Ballast Sea Time (days)",
    "Laden Sea Time (days)",
    "Ballast Sea Time Inside ECA (days)",
    "Laden Sea Time Inside ECA (days)",
    "Ballast Sea Time Outside ECA (days)",
    "Laden Sea Time Outside ECA (days)",
    "Is Loading Port? (1 = Yes)",
    "Is Discharging Port? (1 = Yes)",
    "Loading Port Days Burning HSFO",
    "Loading Port Days Burning VLSFO",
    "Loading Port Days Burning LSMGO",
    "Discharging Port Days Burning HSFO",
    "Discharging Port Days Burning VLSFO",
    "Discharging Port Days Burning LSMGO",
    "Idle Port Days Burning HSFO",
    "Idle Port Days Burning VLSFO",
    "Idle Port Days Burning LSMGO",
    "EU ETS Sea Coverage Factor (0 / 0.5 / 1.0)",
    "EU ETS Port Coverage Factor (0 / 0.5 / 1.0)",
    "Turn Time (days)",
    "Extra Time (days)",
    "Weather Delay (days)",
    "Leg Departure (UTC)",
    "Leg Arrival (UTC)",
    "Laytime Allowed (hours)",
    "Inside EU ETS Commercial Window? (1 = Yes)",
    "Port in UK ETS? (1 = Yes, 0 = No)",
    "UK ETS Zone (GB / NI / blank)",
    "UK ETS Sea Coverage Factor (0 / 0.5 / 1.0)",
    "UK ETS Port Coverage Factor (0 / 1.0)",
  ];
  seqHeaders.forEach((h, i) => setText(i, r, h, S.seqHeader));
  r++;

  // Pre-compute laden flags and regulatory coverage exactly as useVoyageCalculation.ts.
  // Ship is laden as long as cargo remains on board; ballast only when cargo reaches zero
  const ladenFlags: boolean[] = [];
  const bracketOriginIsEu: (boolean | null)[] = sequence.map(() => null);
  const bracketDestIsEu: (boolean | null)[] = sequence.map(() => null);
  let cargoOnBoardExcel = 0;
  sequence.forEach((leg) => {
    // Laden state is determined BEFORE the current port operation (same as calculation engine)
    ladenFlags.push(cargoOnBoardExcel > 0);
    const op = String(leg.operation || "");
    const legQty = Math.max(0, leg.quantity || 0);
    if (op === "load" || op === "loading") {
      cargoOnBoardExcel += legQty;
    } else if (op === "disch" || op === "discharging") {
      cargoOnBoardExcel = Math.max(0, cargoOnBoardExcel - legQty);
    }
  });
  const nextRegulatoryPortIdx: number[] = sequence.map(() => -1);
  let nextRegulatoryIdx = -1;
  for (let i = sequence.length - 1; i >= 0; i--) {
    nextRegulatoryPortIdx[i] = nextRegulatoryIdx;
    if (isEuRegulatoryPortCall(sequence[i])) nextRegulatoryIdx = i;
  }
  let previousRegulatoryIdx = -1;
  sequence.forEach((leg, i) => {
    if (!(leg.portUnloc || leg.port || "").trim()) return;
    const currentIsRegulatory = isEuRegulatoryPortCall(leg);
    const destinationIdx = currentIsRegulatory ? i : nextRegulatoryPortIdx[i];
    if (previousRegulatoryIdx >= 0 && destinationIdx >= 0) {
      bracketOriginIsEu[i] = sequence[previousRegulatoryIdx].isEuEea === true;
      bracketDestIsEu[i] = sequence[destinationIdx].isEuEea === true;
    }
    if (currentIsRegulatory) previousRegulatoryIdx = i;
  });

  let firstLoadIdx = -1;
  let lastDischargeIdx = -1;
  sequence.forEach((leg, i) => {
    if (firstLoadIdx === -1 && isLoadOp(leg.operation)) firstLoadIdx = i;
    if (isDischargeOp(leg.operation)) lastDischargeIdx = i;
  });
  const euWindowValid = firstLoadIdx >= 0 && lastDischargeIdx >= firstLoadIdx;
  const ballastStartsInEu = sequence[0]?.isEuEea === true;
  const euStartIdx = euWindowValid && ballastStartsInEu && firstLoadIdx > 0 ? 0 : firstLoadIdx;
  const inEuSeaWindow = (i: number) => euWindowValid && i > euStartIdx && i <= lastDischargeIdx;
  const inEuPortWindow = (i: number) => euWindowValid && i >= euStartIdx && i <= lastDischargeIdx;
  const computeSeaEuFactor = (legIdx: number): number => {
    const originEu = bracketOriginIsEu[legIdx];
    const destEu = bracketDestIsEu[legIdx];
    if (originEu === null || destEu === null) return 0;
    if (originEu && destEu) return 1.0;
    if (originEu || destEu) return 0.5;
    return 0;
  };

  // ── Effective port inputs ────────────────────────────────────────────────
  // The calculation engine applies the Cargo-section operational overrides
  // (quantity / productivity / terms / turn / extra) whenever demurrage or
  // despatch is active. The raw sequence rows stay at the CP baseline, so the
  // export MUST resolve the same effective values or port days — and therefore
  // port fuel — will not match the software.
  function effectiveLeg(leg: SequenceRowUI) {
    let opOv: NonNullable<CargoEntry["opOverrides"]>[number] | undefined;
    for (const c of cargos) {
      const ddActive = (c.demurrageRate || 0) > 0 || (c.despatchRate || 0) > 0;
      if (!ddActive) continue;
      const o = c.opOverrides?.[leg.id];
      if (o && Object.keys(o).length > 0) { opOv = o; break; }
    }
    const turnTime = opOv?.turnTime ?? leg.turnTime ?? 0;
    const extraTime = opOv?.extraTime ?? leg.extraTime ?? 0;
    const portDays = opOv
      ? calculatePortDays({
          ...leg,
          quantity: opOv.quantity ?? leg.quantity,
          productivity: opOv.productivity ?? leg.productivity,
          turnTime,
          extraTime,
          terms: (opOv.terms as SequenceRowUI["terms"]) ?? leg.terms,
          coefficientFactor: opOv.coefficientFactor ?? leg.coefficientFactor,
        })
      : (leg.calculatedPortDays || 0);
    const termsFactor = termsFactorOf({
      coefficientFactor: opOv?.coefficientFactor ?? leg.coefficientFactor,
      terms: (opOv?.terms as string) ?? leg.terms,
    });
    const split = splitPortStay(portDays, turnTime / 24, extraTime / 24, termsFactor);
    return {
      portDays,
      turnExtraH: turnTime + extraTime,
      turnTime,
      extraTime,
      termsFactor,
      workingDays: split.workingDays,
      idleDays: split.idleDays,
    };
  }

  const seqStartRow = r;
  sequence.forEach((leg, idx) => {
    const rr = r + idx;
    const isAlt = idx % 2 === 1;
    const dStyle = isAlt ? S.seqDataAlt : S.seqData;
    const tStyle = isAlt ? S.seqTextAlt : S.seqText;
    const fStyle = isAlt ? S.seqFormulaAlt : S.seqFormula;
    
    const op = String(leg.operation || "");
    const portFuel = (leg as any).portFuelType || (hasScrubber ? "hsfo" : "vlsfo");
    const seaTime = leg.totalLegTime || 0;
    const ecaTime = leg.ecaTime || 0;
    const eff = effectiveLeg(leg);
    const portDays = eff.portDays;
    const turnExtraH = eff.turnExtraH;
    const isLadenLeg = ladenFlags[idx];

    // --- Data columns (inputs) ---
    setNum(SC.ID, rr, leg.id, dStyle);
    setText(SC.OP, rr, op, tStyle);
    setText(SC.PORT, rr, leg.port, tStyle);
    setNum(SC.DIST, rr, leg.distance, dStyle);
    setNum(SC.ECAD, rr, leg.ecaDistance, dStyle);
    setNum(SC.SEAT, rr, seaTime, dStyle);
    setNum(SC.ECAT, rr, ecaTime, dStyle);
    setNum(SC.PORTD, rr, portDays, dStyle);
    setNum(SC.TURNH, rr, turnExtraH, dStyle);
    setNum(SC.DA, rr, leg.expDa, dStyle);
    setNum(SC.LADEN, rr, isLadenLeg ? 1 : 0, dStyle);
    setText(SC.PFUEL, rr, portFuel, tStyle);
    setNum(SC.EUFLG, rr, leg.isEuEea ? 1 : 0, dStyle);
    const c = (cn: number) => cellRef(cn, rr);

    setFormula(SC.NECAT, rr, `${c(SC.SEAT)}-${c(SC.ECAT)}`, seaTime - ecaTime, fStyle);

    // Engine rule: at a LOAD/DISCH call the WHOLE port stay (cargo working time
    // plus turn + extra time) burns at the load/discharge rate — turn time is
    // NOT split off to the idle rate. Any other call (waiting, bunkering,
    // passage with port time) burns entirely at the idle rate.
    const isLoadDisch = op === "load" || op === "loading" || op === "disch" || op === "discharging";
    const wd = isLoadDisch ? portDays : 0;
    setFormula(SC.WDAYS, rr,
      `IF(OR(${c(SC.OP)}="load",${c(SC.OP)}="loading",${c(SC.OP)}="disch",${c(SC.OP)}="discharging"),${c(SC.PORTD)},0)`,
      wd, fStyle);

    const idleVal = isLoadDisch ? 0 : portDays;
    setFormula(SC.IDAYS, rr, `${c(SC.PORTD)}-${c(SC.WDAYS)}`, idleVal, fStyle);

    setFormula(SC.BSEA, rr, `IF(${c(SC.LADEN)}=0,${c(SC.SEAT)},0)`, isLadenLeg ? 0 : seaTime, fStyle);
    setFormula(SC.LSEA, rr, `IF(${c(SC.LADEN)}=1,${c(SC.SEAT)},0)`, isLadenLeg ? seaTime : 0, fStyle);
    setFormula(SC.ECAB, rr, `IF(${c(SC.LADEN)}=0,${c(SC.ECAT)},0)`, isLadenLeg ? 0 : ecaTime, fStyle);
    setFormula(SC.ECAL, rr, `IF(${c(SC.LADEN)}=1,${c(SC.ECAT)},0)`, isLadenLeg ? ecaTime : 0, fStyle);
    setFormula(SC.NECAB, rr, `IF(${c(SC.LADEN)}=0,${c(SC.NECAT)},0)`, isLadenLeg ? 0 : (seaTime - ecaTime), fStyle);
    setFormula(SC.NECAL, rr, `IF(${c(SC.LADEN)}=1,${c(SC.NECAT)},0)`, isLadenLeg ? (seaTime - ecaTime) : 0, fStyle);

    const isLoad = op === "load" || op === "loading";
    const isDisch = op === "disch" || op === "discharging";
    setFormula(SC.ISLD, rr, `IF(OR(${c(SC.OP)}="load",${c(SC.OP)}="loading"),1,0)`, isLoad ? 1 : 0, fStyle);
    setFormula(SC.ISDC, rr, `IF(OR(${c(SC.OP)}="disch",${c(SC.OP)}="discharging"),1,0)`, isDisch ? 1 : 0, fStyle);

    setFormula(SC.HLD, rr, `IF(AND(${c(SC.ISLD)}=1,${c(SC.PFUEL)}="hsfo"),${c(SC.WDAYS)},0)`,
      (isLoad && portFuel === "hsfo") ? wd : 0, fStyle);
    setFormula(SC.VLD, rr, `IF(AND(${c(SC.ISLD)}=1,${c(SC.PFUEL)}="vlsfo"),${c(SC.WDAYS)},0)`,
      (isLoad && portFuel === "vlsfo") ? wd : 0, fStyle);
    setFormula(SC.LLD, rr, `IF(AND(${c(SC.ISLD)}=1,${c(SC.PFUEL)}="lsmgo"),${c(SC.WDAYS)},0)`,
      (isLoad && portFuel === "lsmgo") ? wd : 0, fStyle);

    setFormula(SC.HDD, rr, `IF(AND(${c(SC.ISDC)}=1,${c(SC.PFUEL)}="hsfo"),${c(SC.WDAYS)},0)`,
      (isDisch && portFuel === "hsfo") ? wd : 0, fStyle);
    setFormula(SC.VDD, rr, `IF(AND(${c(SC.ISDC)}=1,${c(SC.PFUEL)}="vlsfo"),${c(SC.WDAYS)},0)`,
      (isDisch && portFuel === "vlsfo") ? wd : 0, fStyle);
    setFormula(SC.LDD, rr, `IF(AND(${c(SC.ISDC)}=1,${c(SC.PFUEL)}="lsmgo"),${c(SC.WDAYS)},0)`,
      (isDisch && portFuel === "lsmgo") ? wd : 0, fStyle);

    setFormula(SC.HID, rr, `IF(${c(SC.PFUEL)}="hsfo",${c(SC.IDAYS)},0)`,
      portFuel === "hsfo" ? idleVal : 0, fStyle);
    setFormula(SC.VID, rr, `IF(${c(SC.PFUEL)}="vlsfo",${c(SC.IDAYS)},0)`,
      portFuel === "vlsfo" ? idleVal : 0, fStyle);
    setFormula(SC.LID, rr, `IF(${c(SC.PFUEL)}="lsmgo",${c(SC.IDAYS)},0)`,
      portFuel === "lsmgo" ? idleVal : 0, fStyle);

    // --- EU Factor columns ---
    // EU Sea Factor uses bracketing cargo-operation ports (LOAD↔DISCHARGE), not adjacent passing/bunkering rows.
    const curEuCell = c(SC.EUFLG);
    const curIsEu = leg.isEuEea === true;
    const curPortKey = (leg.portUnloc || leg.port || "").trim();
    const euSeaFactorVal = curPortKey && inEuSeaWindow(idx) ? computeSeaEuFactor(idx) : 0;
    const euSeaFactorFormula = `${euSeaFactorVal}`;
    setFormula(SC.EUSEA, rr, euSeaFactorFormula, euSeaFactorVal, fStyle);

    // EU port stays are 100% only when eu_zone=true and the row is inside the
    // commercial window. PSSG/bunkering do not reset sea-leg endpoints, but an
    // EU bunkering port stay is still covered as a port stay.
    const euPortFactorVal = curPortKey && inEuPortWindow(idx) && curIsEu ? 1 : 0;
    setFormula(SC.EUPORT, rr, `IF(AND(${curEuCell}=1,${inEuPortWindow(idx) ? 1 : 0}=1),1,0)`, euPortFactorVal, fStyle);

    // Turn time in days
    const turnTimeH = eff.turnTime;
    const extraTimeH = eff.extraTime;
    setFormula(SC.TURND, rr, `${cellRef(SC.TURNH, rr)}/24`, turnExtraH / 24, fStyle);
    // Note: TURND is total turn+extra in days. Separate turn/extra:
    const turnDays = turnTimeH / 24;
    const extraDays = extraTimeH / 24;
    setNum(SC.EXTRAD, rr, extraDays, fStyle);

    // Weather delay (days) and cascading leg timestamps
    const wxHours = Math.abs(leg.weatherDelayHours ?? 0);
    setNum(SC.WXDLY, rr, wxHours / 24, dStyle);
    setText(SC.DEPUTC, rr, leg.legDepartureUtc ? leg.legDepartureUtc.replace("T", " ") : "", tStyle);
    setText(SC.ARRUTC, rr, leg.legArrivalUtc ? leg.legArrivalUtc.replace("T", " ") : "", tStyle);
    setNum(SC.LAYT, rr, (leg as any).layTime || 0, dStyle);
    setNum(SC.EUWIN, rr, inEuSeaWindow(idx) || inEuPortWindow(idx) ? 1 : 0, fStyle);
    const ukPortFlag = leg.ukEts === true ? 1 : 0;
    const ukZone = leg.ukZone || "";
    const previousUkZone = idx > 0 ? sequence[idx - 1]?.ukZone : null;
    const ukSeaFactor = getUkEtsSeaCoverage(previousUkZone, leg.ukZone);
    const ukPortFactor = getUkEtsPortCoverage(leg.ukEts);
    setNum(SC.UKFLG, rr, ukPortFlag, dStyle);
    setText(SC.UKZONE, rr, ukZone ? String(ukZone).toUpperCase() : "", tStyle);
    setFormula(SC.UKSEA, rr, `${ukSeaFactor}`, ukSeaFactor, fStyle);
    setFormula(SC.UKPORT, rr, `IF(${c(SC.UKFLG)}=1,1,0)`, ukPortFactor, fStyle);
  });

  const seqEndRow = seqStartRow + sequence.length - 1;
  r = seqEndRow + 2;

  // Range helper for SUM over a sequence column
  const seqRange = (c: number) => `${cellRef(c, seqStartRow)}:${cellRef(c, seqEndRow)}`;

  // Cell references for input cells (shorthand)
  const B = (row: number) => cellRef(1, row);
  const scrCell = B(R_SCR);
  const rfCell = B(R_RF);
  const xSeaCell = B(R_XSEA);
  const xPortCell = B(R_XPORT);
  const xCanalCell = B(R_XCANAL);

  // Rate cell references (consumption matrix)
  // HSFO rates: B=Ballast(col1), C=Laden(col2), D=Load(col3), E=Disch(col4), F=Idle(col5), G=Canal(col6)
  const hBal = cellRef(1, R_HSFO), hLad = cellRef(2, R_HSFO), hLoad = cellRef(3, R_HSFO);
  const hDisch = cellRef(4, R_HSFO), hIdle = cellRef(5, R_HSFO), hCanal = cellRef(6, R_HSFO);
  const vBal = cellRef(1, R_VLSFO), vLad = cellRef(2, R_VLSFO), vLoad = cellRef(3, R_VLSFO);
  const vDisch = cellRef(4, R_VLSFO), vIdle = cellRef(5, R_VLSFO), vCanal = cellRef(6, R_VLSFO);
  const lBal = cellRef(1, R_LSMGO), lLad = cellRef(2, R_LSMGO), lLoad = cellRef(3, R_LSMGO);
  const lDisch = cellRef(4, R_LSMGO), lIdle = cellRef(5, R_LSMGO);

  // AE rate references (dynamic: scrubber → AE+Scrubber row, else → AE row)
  const aeR = (colIdx: number) => `IF(${scrCell}=1,${cellRef(colIdx, R_AESCR)},${cellRef(colIdx, R_AE)})`;
  const aeBal = aeR(1), aeLad = aeR(2), aeLoad = aeR(3), aeDisch = aeR(4), aeIdle = aeR(5);

  // ═══════════════════════════════════════════════════════
  // SECTION 3: CALCULATIONS (ALL EXCEL FORMULAS)
  // ═══════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════
  // COMPUTE INTERMEDIATES (mirrors useVoyageCalculation.ts)
  // ═══════════════════════════════════════════════════════
  let c_ecaBalD = 0, c_ecaLadD = 0, c_necaBalD = 0, c_necaLadD = 0;
  let c_hld = 0, c_vld = 0, c_lld = 0;
  let c_hdd = 0, c_vdd = 0, c_ldd = 0;
  let c_hid = 0, c_vid = 0, c_lid = 0;
  let c_tload = 0, c_tdisch = 0, c_tidle = 0;
  const rewardFactor = bunker.rewardFactor;

  sequence.forEach((leg, idx) => {
    const il = ladenFlags[idx];
    const st = (leg as any).totalLegTime || 0; // Total sea time (ECA + NonECA)
    const et = (leg as any).ecaTime || 0;
    const net = st - et;
    const pd = effectiveLeg(leg).portDays;
    const op = String(leg.operation || "");
    const pf = (leg as any).portFuelType || (hasScrubber ? "hsfo" : "vlsfo");
    const isLd = op === "load" || op === "loading";
    const isDc = op === "disch" || op === "discharging";

    if (il) { c_ecaLadD += et; c_necaLadD += net; }
    else { c_ecaBalD += et; c_necaBalD += net; }

    // Whole port stay at the load/disch rate (engine parity); everything else idle.
    if (isLd) {
      c_tload += pd;
      if (pf === "hsfo") c_hld += pd;
      else if (pf === "vlsfo") c_vld += pd;
      else c_lld += pd;
    } else if (isDc) {
      c_tdisch += pd;
      if (pf === "hsfo") c_hdd += pd;
      else if (pf === "vlsfo") c_vdd += pd;
      else c_ldd += pd;
    } else if (pd > 0) {
      if (pf === "hsfo") c_hid += pd;
      else if (pf === "vlsfo") c_vid += pd;
      else c_lid += pd;
      c_tidle += pd;
    }
  });

  const extraSeaDays = results.extraSeaDays;
  const extraPortDays = results.extraPortDays;
  const extraCanalDays = results.extraCanalDays;
  const extraPortFuel = hasScrubber ? "hsfo" : "vlsfo";

  // Sea consumption
  const sv_hsfoSea = hasScrubber ? (c_necaBalD * (profile.hsfo.ballast || 0) + c_necaLadD * (profile.hsfo.laden || 0) + extraSeaDays * (profile.hsfo.laden || 0)) * rewardFactor : 0;
  const sv_vlsfoSea = !hasScrubber ? (c_necaBalD * (profile.vlsfo.ballast || 0) + c_necaLadD * (profile.vlsfo.laden || 0) + extraSeaDays * (profile.vlsfo.laden || 0)) * rewardFactor : 0;
  const sv_lsmgoSea = (c_ecaBalD * (profile.lsmgo.ballast || 0) + c_ecaLadD * (profile.lsmgo.laden || 0)) * rewardFactor;

  // Port consumption
  const sv_hLoad = c_hld * (profile.hsfo.load || 0);
  const sv_hDisch = c_hdd * (profile.hsfo.discharge || 0);
  const sv_hIdle = (c_hid + (hasScrubber ? extraPortDays : 0)) * (profile.hsfo.idle || 0);
  const sv_hCanal = hasScrubber ? extraCanalDays * (profile.hsfo.canal || 0) : 0;
  const sv_vLoad = c_vld * (profile.vlsfo.load || 0);
  const sv_vDisch = c_vdd * (profile.vlsfo.discharge || 0);
  const sv_vIdle = (c_vid + (!hasScrubber ? extraPortDays : 0)) * (profile.vlsfo.idle || 0);
  const sv_vCanal = !hasScrubber ? extraCanalDays * (profile.vlsfo.canal || 0) : 0;
  const sv_lLoad = c_lld * (profile.lsmgo.load || 0);
  const sv_lDisch = c_ldd * (profile.lsmgo.discharge || 0);
  const sv_lIdle = c_lid * (profile.lsmgo.idle || 0);

  // AE consumption
  const aeProf = hasScrubber ? profile.aeScrubber : profile.ae;
  const sv_aeSea = ((results.seaDaysBallast) * ((aeProf?.ballast) || 0) + (results.seaDaysLaden) * ((aeProf?.laden) || 0) + extraSeaDays * ((aeProf?.laden) || 0)) * rewardFactor;
  const sv_aePort = c_tload * ((aeProf?.load) || 0) + c_tdisch * ((aeProf?.discharge) || 0) + (c_tidle + extraPortDays) * ((aeProf?.idle) || 0);
  const sv_aeTotal = sv_aeSea + sv_aePort;

  // ═══════════════════════════════════════════════════════
  // SECTION 3: CALCULATIONS (ALL EXCEL FORMULAS)
  // ═══════════════════════════════════════════════════════

  setSectionHeader(r, "CALCULATIONS"); r++;
  setText(0, r, "Description", S.calcLabel);
  ws[cellRef(1, r)] = { t: "s", v: "Excel Formula", s: S.colHeaderFormula };
  ws[cellRef(2, r)] = { t: "s", v: "Software Value", s: S.colHeaderSoftware };
  r++;
  r++;

  // --- TIME & DISTANCE ---
  setSubSectionHeader(r, "TIME & DISTANCE"); r++;

  setCalcLabel(r, "Total Distance (nm)");
  setCalcFormula(r, `SUM(${seqRange(SC.DIST)})`, results.totalDistance);
  const R_TOTDIST = r; r++;

  setCalcLabel(r, "Total ECA Distance (nm)");
  setCalcFormula(r, `SUM(${seqRange(SC.ECAD)})`, results.totalEcaDistance);
  const R_ECADIST = r; r++;

  setCalcLabel(r, "Non-ECA Distance (nm)");
  setCalcFormula(r, `${B(R_TOTDIST)}-${B(R_ECADIST)}`, results.nonEcaDistance);
  r++;

  setCalcLabel(r, "Laden Distance (nm)");
  setCalcFormula(r, `SUMPRODUCT(${seqRange(SC.LADEN)},${seqRange(SC.DIST)})`, results.ladenDistance);
  const R_LADIST = r; r++;

  setCalcLabel(r, "Sea Days Ballast");
  setCalcFormula(r, `SUM(${seqRange(SC.BSEA)})`, results.seaDaysBallast);
  const R_SBAL = r; r++;

  setCalcLabel(r, "Sea Days Laden");
  setCalcFormula(r, `SUM(${seqRange(SC.LSEA)})`, results.seaDaysLaden);
  const R_SLAD = r; r++;

  setCalcLabel(r, "Total Port Days");
  setCalcFormula(r, `SUM(${seqRange(SC.PORTD)})`, results.totalPortDays);
  const R_TPORT = r; r++;

  setCalcLabel(r, "Port Costs ($)");
  setCalcFormula(r, `SUM(${seqRange(SC.DA)})`, results.portCosts);
  const R_PCOST = r; r++;

  setCalcLabel(r, "Total Sea Days");
  setCalcFormula(r, `${B(R_SBAL)}+${B(R_SLAD)}+${xSeaCell}`, results.totalSeaDays);
  const R_TSEA = r; r++;

  setCalcLabel(r, "TOTAL VOYAGE DAYS", true);
  setCalcFormula(r, `${B(R_TSEA)}+${B(R_TPORT)}+${xPortCell}+${xCanalCell}`, results.totalVoyageDays, true);
  const R_TVOY = r; r++;
  r++;

  // ECA/NonECA sea time breakdown
  setCalcLabel(r, "ECA Sea Bal Days");
  setCalcFormula(r, `SUM(${seqRange(SC.ECAB)})`, c_ecaBalD);
  const R_ECAB_D = r; r++;

  setCalcLabel(r, "ECA Sea Lad Days");
  setCalcFormula(r, `SUM(${seqRange(SC.ECAL)})`, c_ecaLadD);
  const R_ECAL_D = r; r++;

  setCalcLabel(r, "NonECA Sea Bal Days");
  setCalcFormula(r, `SUM(${seqRange(SC.NECAB)})`, c_necaBalD);
  const R_NECAB_D = r; r++;

  setCalcLabel(r, "NonECA Sea Lad Days");
  setCalcFormula(r, `SUM(${seqRange(SC.NECAL)})`, c_necaLadD);
  const R_NECAL_D = r; r++;
  r++;

  // --- PORT TIME AGGREGATES ---
  setSubSectionHeader(r, "PORT DAYS SPLIT BY PORT FUEL (load / disch stays include turn + extra time)"); r++;

  setCalcLabel(r, "Load Port Days on HSFO (d)"); setCalcFormula(r, `SUM(${seqRange(SC.HLD)})`, c_hld); const R_HLD = r; r++;
  setCalcLabel(r, "Load Port Days on VLSFO (d)"); setCalcFormula(r, `SUM(${seqRange(SC.VLD)})`, c_vld); const R_VLD = r; r++;
  setCalcLabel(r, "Load Port Days on LSMGO (d)"); setCalcFormula(r, `SUM(${seqRange(SC.LLD)})`, c_lld); const R_LLD = r; r++;
  setCalcLabel(r, "Disch Port Days on HSFO (d)"); setCalcFormula(r, `SUM(${seqRange(SC.HDD)})`, c_hdd); const R_HDD = r; r++;
  setCalcLabel(r, "Disch Port Days on VLSFO (d)"); setCalcFormula(r, `SUM(${seqRange(SC.VDD)})`, c_vdd); const R_VDD = r; r++;
  setCalcLabel(r, "Disch Port Days on LSMGO (d)"); setCalcFormula(r, `SUM(${seqRange(SC.LDD)})`, c_ldd); const R_LDD = r; r++;
  setCalcLabel(r, "Idle / Waiting / Bunkering Days on HSFO (d)"); setCalcFormula(r, `SUM(${seqRange(SC.HID)})`, c_hid); const R_HID = r; r++;
  setCalcLabel(r, "Idle / Waiting / Bunkering Days on VLSFO (d)"); setCalcFormula(r, `SUM(${seqRange(SC.VID)})`, c_vid); const R_VID = r; r++;
  setCalcLabel(r, "Idle / Waiting / Bunkering Days on LSMGO (d)"); setCalcFormula(r, `SUM(${seqRange(SC.LID)})`, c_lid); const R_LID = r; r++;

  setCalcLabel(r, "Total Load Port Days (d)"); setCalcFormula(r, `${B(R_HLD)}+${B(R_VLD)}+${B(R_LLD)}`, c_tload); const R_TLOAD = r; r++;
  setCalcLabel(r, "Total Disch Port Days (d)"); setCalcFormula(r, `${B(R_HDD)}+${B(R_VDD)}+${B(R_LDD)}`, c_tdisch); const R_TDISCH = r; r++;
  setCalcLabel(r, "Total Idle / Bunkering Days (d)"); setCalcFormula(r, `${B(R_HID)}+${B(R_VID)}+${B(R_LID)}`, c_tidle); const R_TIDLE = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 4: BUNKER CONSUMPTION (FORMULAS)
  // ═══════════════════════════════════════════════════════

  setSectionHeader(r, "BUNKER CONSUMPTION (mt) — SAME MODEL AS THE SOFTWARE ENGINE"); r++;

  // --- Sea Consumption ---
  setSubSectionHeader(r, "1. Sea Consumption — Main Engine (outside ECA: HSFO if scrubber else VLSFO; inside ECA: LSMGO)"); r++;

  setCalcLabel(r, "HSFO Sea outside ECA (mt)");
  setCalcFormula(r,
    `IF(${scrCell}=1,(${B(R_NECAB_D)}*${hBal}+${B(R_NECAL_D)}*${hLad}+${xSeaCell}*${hLad})*${rfCell},0)`,
    sv_hsfoSea);
  const R_HSFO_SEA = r; r++;

  setCalcLabel(r, "VLSFO Sea outside ECA (mt)");
  setCalcFormula(r,
    `IF(${scrCell}=0,(${B(R_NECAB_D)}*${vBal}+${B(R_NECAL_D)}*${vLad}+${xSeaCell}*${vLad})*${rfCell},0)`,
    sv_vlsfoSea);
  const R_VLSFO_SEA = r; r++;

  setCalcLabel(r, "LSMGO Sea inside ECA (mt)");
  setCalcFormula(r,
    `(${B(R_ECAB_D)}*${lBal}+${B(R_ECAL_D)}*${lLad})*${rfCell}`,
    sv_lsmgoSea);
  const R_LSMGO_SEA = r; r++;
  r++;

  // --- Port Consumption ---
  setSubSectionHeader(r, "2. Port Consumption — Main Engine (port days x matrix rate for the selected port fuel)"); r++;

  setCalcLabel(r, "HSFO at Load Ports (mt)"); setCalcFormula(r, `${B(R_HLD)}*${hLoad}`, sv_hLoad); const R_HL = r; r++;
  setCalcLabel(r, "HSFO at Disch Ports (mt)"); setCalcFormula(r, `${B(R_HDD)}*${hDisch}`, sv_hDisch); const R_HD = r; r++;
  setCalcLabel(r, "HSFO Idle / Bunkering + Extra Port Days (mt)");
  setCalcFormula(r, `(${B(R_HID)}+IF(${scrCell}=1,${xPortCell},0))*${hIdle}`, sv_hIdle);
  const R_HI = r; r++;
  setCalcLabel(r, "HSFO Canal Transit (mt)");
  setCalcFormula(r, `IF(${scrCell}=1,${xCanalCell}*${hCanal},0)`, sv_hCanal);
  const R_HC = r; r++;

  setCalcLabel(r, "VLSFO at Load Ports (mt)"); setCalcFormula(r, `${B(R_VLD)}*${vLoad}`, sv_vLoad); const R_VL = r; r++;
  setCalcLabel(r, "VLSFO at Disch Ports (mt)"); setCalcFormula(r, `${B(R_VDD)}*${vDisch}`, sv_vDisch); const R_VD = r; r++;
  setCalcLabel(r, "VLSFO Idle / Bunkering + Extra Port Days (mt)");
  setCalcFormula(r, `(${B(R_VID)}+IF(${scrCell}=0,${xPortCell},0))*${vIdle}`, sv_vIdle);
  const R_VI = r; r++;
  setCalcLabel(r, "VLSFO Canal Transit (mt)");
  setCalcFormula(r, `IF(${scrCell}=0,${xCanalCell}*${vCanal},0)`, sv_vCanal);
  const R_VC = r; r++;

  setCalcLabel(r, "LSMGO at Load Ports (mt)"); setCalcFormula(r, `${B(R_LLD)}*${lLoad}`, sv_lLoad); const R_LL = r; r++;
  setCalcLabel(r, "LSMGO at Disch Ports (mt)"); setCalcFormula(r, `${B(R_LDD)}*${lDisch}`, sv_lDisch); const R_LD = r; r++;
  setCalcLabel(r, "LSMGO Idle / Bunkering Days (mt)"); setCalcFormula(r, `${B(R_LID)}*${lIdle}`, sv_lIdle); const R_LI = r; r++;
  setCalcLabel(r, "LSMGO Canal Transit (mt) — ME does not burn LSMGO in canal"); setCalcFormula(r, `0`, 0); const R_LC = r; r++;
  r++;

  // --- AE Consumption (always LSMGO) ---
  setSubSectionHeader(r, "3. Auxiliary Engine Consumption — always LSMGO (scrubber vessels use the AE+Scrubber row)"); r++;

  setCalcLabel(r, "AE at Sea (mt)");
  setCalcFormula(r,
    `(${B(R_SBAL)}*(${aeBal})+${B(R_SLAD)}*(${aeLad})+${xSeaCell}*(${aeLad}))*${rfCell}`, sv_aeSea);
  const R_AES = r; r++;

  setCalcLabel(r, "AE in Port — load + disch + idle/bunkering (mt)");
  setCalcFormula(r,
    `${B(R_TLOAD)}*(${aeLoad})+${B(R_TDISCH)}*(${aeDisch})+(${B(R_TIDLE)}+${xPortCell})*(${aeIdle})`, sv_aePort);
  const R_AEP = r; r++;

  setCalcLabel(r, "AE Total → added to LSMGO (mt)");
  setCalcFormula(r, `${B(R_AES)}+${B(R_AEP)}`, sv_aeTotal);
  const R_AET = r; r++;
  r++;

  // --- TOTAL FUEL CONSUMPTION ---
  setSubSectionHeader(r, "4. Total Fuel Consumption — must tie out to the Bunker section in the software"); r++;

  setCalcLabel(r, "HSFO Total Consumption (mt)", true);
  setCalcFormula(r, `${B(R_HSFO_SEA)}+${B(R_HL)}+${B(R_HD)}+${B(R_HI)}+${B(R_HC)}`, results.hsfoConsumption, true);
  const R_HSFOT = r; r++;

  setCalcLabel(r, "VLSFO Total Consumption (mt)", true);
  setCalcFormula(r, `${B(R_VLSFO_SEA)}+${B(R_VL)}+${B(R_VD)}+${B(R_VI)}+${B(R_VC)}`, results.vlsfoConsumption, true);
  const R_VLSFOT = r; r++;

  setCalcLabel(r, "LSMGO Total Consumption (mt) — incl. AE", true);
  setCalcFormula(r, `${B(R_LSMGO_SEA)}+${B(R_LL)}+${B(R_LD)}+${B(R_LI)}+${B(R_LC)}+${B(R_AET)}`, results.lsmgoConsumption, true);
  const R_LSMGOT = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 5: BUNKER COST
  // ═══════════════════════════════════════════════════════

  setSectionHeader(r, "BUNKER COST ($) — CONSUMPTION x EFFECTIVE PRICE"); r++;

  setCalcLabel(r, "HSFO Cost ($)");
  setCalcFormula(r, `${B(R_HSFOT)}*${B(R_HPE)}`, results.hsfoConsumption * effPriceValue.hsfo);
  const R_HCOST = r; r++;

  setCalcLabel(r, "VLSFO Cost ($)");
  setCalcFormula(r, `${B(R_VLSFOT)}*${B(R_VPE)}`, results.vlsfoConsumption * effPriceValue.vlsfo);
  const R_VCOST = r; r++;

  setCalcLabel(r, "LSMGO Cost ($)");
  setCalcFormula(r, `${B(R_LSMGOT)}*${B(R_LPE)}`, results.lsmgoConsumption * effPriceValue.lsmgo);
  const R_LCOST = r; r++;

  setCalcLabel(r, "Total Bunker Cost ($)", true);
  setCalcFormula(r, `${B(R_HCOST)}+${B(R_VCOST)}+${B(R_LCOST)}`, results.totalBunkerCost, true);
  const R_BUNKC = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 6: FINANCIALS
  // ═══════════════════════════════════════════════════════

  setSectionHeader(r, "FINANCIALS"); r++;
  setText(0, r, "", S.calcLabel);
  ws[cellRef(1, r)] = { t: "s", v: "Excel Formula", s: S.colHeaderFormula };
  ws[cellRef(2, r)] = { t: "s", v: "Software Value", s: S.colHeaderSoftware };
  r++;

  setCalcLabel(r, "Gross Freight ($)");
  // Engine: Gross Freight = Σ per-cargo freight (WS-adjusted for tanker)
  //                         + Demurrage − Despatch
  setCalcFormula(r, `${B(R_BASEGF)}+${B(R_DEM)}-${B(R_DESP)}`, results.grossFreight);
  const R_GF = r; r++;

  setCalcLabel(r, "Voyage Commission ($)");
  setCalcFormula(r, `${B(R_GF)}*${B(R_VCOMM)}/100`, results.voyageCommission);
  const R_VCAMT = r; r++;

  setCalcLabel(r, "Net Freight ($)");
  setCalcFormula(r, `${B(R_GF)}-${B(R_VCAMT)}`, results.netFreight);
  const R_NF = r; r++;

  setCalcLabel(r, "Misc Costs ($)");
  setCalcFormula(r, `${B(R_MISC)}+${B(R_XFEE)}+${B(R_XINS)}`, results.miscCosts);
  const R_MISCT = r; r++;

  setCalcLabel(r, "Canal Costs ($)");
  setCalcFormula(r, `${B(R_CC1)}+${B(R_CC2)}`, results.canalCosts);
  const R_CANALT = r; r++;

  // --- Regulatory costs (only added when the corresponding toggle is on) ---
  const applyEua = applyEuaImpact === true;
  const applyFuelEu = applyFuelEuImpact === true;
  const applyUk = applyUkEtsImpact === true;
  const svEuaCost = results.euaCo2Cost || 0;
  const svFuelEuCost = results.fuelEuTotalPenalty || 0;
  const svUkCost = results.ukEtsCost || 0;

  setCalcLabel(r, "Apply EU ETS (1/0)"); setNum(1, r, applyEua ? 1 : 0); setNum(2, r, applyEua ? 1 : 0, S.software);
  const R_APP_EUA = r; r++;
  setCalcLabel(r, "Apply FuelEU (1/0)"); setNum(1, r, applyFuelEu ? 1 : 0); setNum(2, r, applyFuelEu ? 1 : 0, S.software);
  const R_APP_FEU = r; r++;
  setCalcLabel(r, "Apply UK ETS (1/0)"); setNum(1, r, applyUk ? 1 : 0); setNum(2, r, applyUk ? 1 : 0, S.software);
  const R_APP_UK = r; r++;

  setCalcLabel(r, "EUA CO₂ Cost ($)"); setCalcFormula(r, `${svEuaCost}`, svEuaCost);
  const R_REG_EUA = r; r++;
  setCalcLabel(r, "FuelEU Penalty ($)"); setCalcFormula(r, `${svFuelEuCost}`, svFuelEuCost);
  const R_REG_FEU = r; r++;
  setCalcLabel(r, "UK ETS Cost ($)"); setCalcFormula(r, `${svUkCost}`, svUkCost);
  const R_REG_UK = r; r++;

  const svRegulatory =
    (applyEua ? svEuaCost : 0) + (applyFuelEu ? svFuelEuCost : 0) + (applyUk ? svUkCost : 0);
  setCalcLabel(r, "Regulatory Costs ($)", true);
  setCalcFormula(
    r,
    `${B(R_APP_EUA)}*${B(R_REG_EUA)}+${B(R_APP_FEU)}*${B(R_REG_FEU)}+${B(R_APP_UK)}*${B(R_REG_UK)}`,
    svRegulatory, true,
  );
  const R_REGT = r; r++;

  setCalcLabel(r, "Voyage Costs excl Hire ($)", true);
  setCalcFormula(r, `${B(R_BUNKC)}+${B(R_PCOST)}+${B(R_MISCT)}+${B(R_CANALT)}+${B(R_REGT)}`, results.voyageCostExclHire, true);
  const R_VCEXH = r; r++;

  setCalcLabel(r, "Hire Cost ($)");
  setCalcFormula(r, `${B(R_HIRE)}*${B(R_TVOY)}+${B(R_BB)}`, results.hireCost);
  const R_HIRECOST = r; r++;

  setCalcLabel(r, "Voyage Cost incl Hire ($)", true);
  setCalcFormula(r, `${B(R_VCEXH)}+${B(R_HIRECOST)}`, results.voyageCostInclHire, true);
  const R_VCINH = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 7: PROFITABILITY
  // ═══════════════════════════════════════════════════════

  setSectionHeader(r, "PROFITABILITY"); r++;
  setText(0, r, "", S.calcLabel);
  ws[cellRef(1, r)] = { t: "s", v: "Excel Formula", s: S.colHeaderFormula };
  ws[cellRef(2, r)] = { t: "s", v: "Software Value", s: S.colHeaderSoftware };
  r++;

  setCalcLabel(r, "Gross Profit ($)", false, true);
  // Demurrage / Despatch are already baked into Gross Freight by the engine.
  setCalcFormula(r, `${B(R_NF)}-${B(R_VCEXH)}`, results.grossProfit, false, true);
  const R_GP = r; r++;

  setCalcLabel(r, "P&L ($)", false, true);
  setCalcFormula(r, `${B(R_GP)}-${B(R_HIRECOST)}`, results.pAndL, false, true);
  r++;

  setCalcLabel(r, "NTCE ($/day)", false, true);
  setCalcFormula(r, `IF(${B(R_TVOY)}>0,(${B(R_NF)}-${B(R_VCEXH)})/${B(R_TVOY)},0)`, results.ntce, false, true);
  const R_NTCE = r; r++;

  setCalcLabel(r, "GTCE ($/day)", false, true);
  setCalcFormula(r, `IF(${B(R_TCOMM)}<100,${B(R_NTCE)}/(1-${B(R_TCOMM)}/100),0)`, results.gtce, false, true);
  const R_GTCE = r; r++;

  setCalcLabel(r, "TCE ($/day)", false, true);
  setCalcFormula(r, `${B(R_GTCE)}`, results.tce, false, true);
  r++;

  setCalcLabel(r, "Gross Rate ($/mt)");
  setCalcFormula(r,
    `IF(AND(${B(R_QTY)}>0,${B(R_VCOMM)}<100),(${B(R_VCINH)}/${B(R_QTY)})/(1-${B(R_VCOMM)}/100),0)`,
    results.grossRate);
  r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 7b: PER-CARGO BREAKDOWN (multi-cargo allocation)
  // ═══════════════════════════════════════════════════════
  if (cargos.length > 1 && results.perCargoBreakdown && results.perCargoBreakdown.length > 0) {
    setSectionHeader(r, "PER-CARGO BREAKDOWN"); r++;

    // Layout: vertical block per cargo with three columns
    //   A = Field label, B = Excel Formula (live), C = Software Value (engine result)
    // Formulas reference the per-cargo input rows captured in ADDITIONAL CARGOES
    // so editing those inputs recalculates the breakdown live.

    // Helper: A1 ref for an arbitrary col/row pair.
    const cref = (col: number, row: number) => cellRef(col, row);

    // Total loaded qty (sum across the loaded-qty column in ADDITIONAL CARGOES).
    // Used for the share% formula.
    const totalLoadedQty = results.perCargoBreakdown.reduce(
      (s, pc) => s + (pc.loadedQty || 0), 0,
    );
    const qtyRefs = cargoInputRows.map(ir => cref(ir.qty.col, ir.qty.row));
    const totalQtyFormula = qtyRefs.length > 0 ? qtyRefs.join("+") : "1";

    // Column header row
    setText(0, r, "Cargo / Field", S.seqHeader);
    setText(1, r, "Excel Formula", S.colHeaderFormula);
    setText(2, r, "Software Value", S.colHeaderSoftware);
    r++;

    results.perCargoBreakdown.forEach((pc, idx) => {
      const src = cargos.find(c => c.id === pc.cargoId);
      const inp = cargoInputRows[idx];
      if (!inp) return;
      const rateRef = cref(inp.rate.col, inp.rate.row);
      const typeRef = cref(inp.rateType.col, inp.rateType.row);
      const qtyRef = cref(inp.qty.col, inp.qty.row);
      const vcRef = cref(inp.voyComm.col, inp.voyComm.row);
      const demRef = cref(inp.dem.col, inp.dem.row);
      const despRef = cref(inp.desp.col, inp.desp.row);
      const effRateRef = cref(inp.effRate.col, inp.effRate.row);

      // Sub-header for the cargo block
      setSubSectionHeader(r, `Cargo ${pc.cargoLabel} — ${src?.rateType || "mt"} @ ${src?.rate ?? 0}`); r++;

      // Loaded Qty (software derived from sequence; mirror to the input row)
      setCalcLabel(r, "Loaded Qty (MT)");
      setCalcFormula(r, `${qtyRef}`, pc.loadedQty);
      const rRowQty = r; r++;

      // Gross Freight = IF(type=lumpsum, rate, WS-adjusted rate × qty)
      setCalcLabel(r, "Gross Freight ($)");
      setCalcFormula(
        r,
        `IF(${typeRef}="lumpsum",${rateRef},${effRateRef}*${B(rRowQty)})`,
        pc.grossFreight,
      );
      const rRowGF = r; r++;

      // Voyage Commission deduction = GF * VoyComm%
      setCalcLabel(r, "Voyage Commission ($)");
      const vcAmtSv = pc.grossFreight * (src?.voyageCommission || 0) / 100;
      setCalcFormula(r, `${B(rRowGF)}*${vcRef}/100`, vcAmtSv);
      const rRowVC = r; r++;

      // Net Freight
      setCalcLabel(r, "Net Freight ($)");
      setCalcFormula(r, `${B(rRowGF)}-${B(rRowVC)}`, pc.grossFreight - vcAmtSv);
      const rRowNF = r; r++;

      // Loaded-Qty Share (cost weighting basis)
      setCalcLabel(r, "Loaded-Qty Share (%)");
      setCalcFormula(
        r,
        `IF((${totalQtyFormula})>0,${qtyRef}/(${totalQtyFormula})*100,0)`,
        totalLoadedQty > 0 ? (pc.loadedQty / totalLoadedQty) * 100 : 0,
      );
      const rRowShare = r; r++;

      // Allocated Bunker / Port / Hire — the engine uses ROUTE-BOUNDED
      // allocation (load→final discharge window with overlap split by loaded
      // qty), which cannot be expressed as a single closed-form formula over
      // only the cargo inputs. To keep Excel and software values identical we
      // express each allocation as: Engine_Total × (cargo's route-allocated
      // share). The ratio is derived directly from the engine result, so the
      // formula recomputes correctly if the engine total changes and always
      // ties out to the Software Value column.
      const bunkRatio = results.totalBunkerCost > 0
        ? pc.allocatedBunker / results.totalBunkerCost : 0;
      const portRatio = results.portCosts > 0
        ? pc.allocatedPortCosts / results.portCosts : 0;
      const hireRatio = results.hireCost > 0
        ? pc.allocatedHire / results.hireCost : 0;

      setCalcLabel(r, "Allocated Bunker ($)");
      setCalcFormula(r, `${B(R_BUNKC)}*${bunkRatio}`, pc.allocatedBunker);
      const rRowAB = r; r++;

      setCalcLabel(r, "Allocated Port Costs ($)");
      setCalcFormula(r, `${B(R_PCOST)}*${portRatio}`, pc.allocatedPortCosts);
      const rRowAP = r; r++;

      // Allocated Voyage Costs = bunker + port (true formula)
      setCalcLabel(r, "Allocated Voy Costs ($)", true);
      setCalcFormula(r, `${B(rRowAB)}+${B(rRowAP)}`, pc.allocatedVoyageCosts, true);
      const rRowAV = r; r++;

      setCalcLabel(r, "Allocated Hire ($)");
      setCalcFormula(r, `${B(R_HIRECOST)}*${hireRatio}`, pc.allocatedHire);
      const rRowAH = r; r++;

      // Allocated Misc / Canal (ton-mile share) and the full allocated cost
      // base used by the per-cargo gross rate.
      const miscRatio = results.miscCosts > 0 ? (pc.allocatedMiscCost || 0) / results.miscCosts : 0;
      const canalRatio = results.canalCosts > 0 ? (pc.allocatedCanalCost || 0) / results.canalCosts : 0;

      setCalcLabel(r, "Allocated Misc ($)");
      setCalcFormula(r, `${B(R_MISCT)}*${miscRatio}`, pc.allocatedMiscCost || 0);
      const rRowAM = r; r++;

      setCalcLabel(r, "Allocated Canal ($)");
      setCalcFormula(r, `${B(R_CANALT)}*${canalRatio}`, pc.allocatedCanalCost || 0);
      const rRowAC = r; r++;

      setCalcLabel(r, "Allocated Total Cost ($)", true);
      setCalcFormula(
        r,
        `${B(rRowAV)}+${B(rRowAH)}+${B(rRowAM)}+${B(rRowAC)}`,
        pc.allocatedTotalCost,
        true,
      );
      const rRowATC = r; r++;

      const cargoDemDesp = src ? calculateCargoDemurrageDespatch(src, cargos, sequence) : undefined;

      // Demurrage / Despatch from overall CP − Op days for this cargo
      setCalcLabel(r, "Demurrage ($)");
      setCalcFormula(r, `${demRef}`, cargoDemDesp?.demurrageAmount || 0);
      const rRowDem = r; r++;

      setCalcLabel(r, "Despatch ($)");
      setCalcFormula(r, `${despRef}`, cargoDemDesp?.despatchAmount || 0);
      const rRowDesp = r; r++;

      // Voyage Result (per-cargo) = (Net Freight + Dem − Desp) − Allocated Voy Costs
      // Demurrage is extra revenue and despatch is a give-back, matching the
      // engine where both are folded into gross freight.
      setCalcLabel(r, "Voyage Result ($)", false, true);
      const vrSv = (pc.grossFreight - vcAmtSv) - pc.allocatedVoyageCosts
        + (cargoDemDesp?.demurrageAmount || 0) - (cargoDemDesp?.despatchAmount || 0);
      setCalcFormula(
        r,
        `${B(rRowNF)}-${B(rRowAV)}+${B(rRowDem)}-${B(rRowDesp)}`,
        vrSv,
        false, true,
      );
      const rRowVR = r; r++;

      // P&L (per-cargo) = Voyage Result - Allocated Hire
      setCalcLabel(r, "P&L ($)", false, true);
      setCalcFormula(r, `${B(rRowVR)}-${B(rRowAH)}`, vrSv - pc.allocatedHire, false, true);
      r++;

      // Gross Rate ($/mt) — engine: allocated total cost per mt grossed up by
      // the cargo's own voyage commission.
      setCalcLabel(r, "Gross Rate ($/mt)", true);
      setCalcFormula(
        r,
        `IF(AND(${B(rRowQty)}>0,${vcRef}<100),(${B(rRowATC)}/${B(rRowQty)})/(1-${vcRef}/100),0)`,
        pc.grossRate,
        true,
      );
      r++;
      r++;
    });

    // Repositioning (unallocated)
    if (results.repositioningCost > 0) {
      setCalcLabel(r, "Repositioning Cost (unallocated)", true);
      setCalcFormula(r, `${results.repositioningCost}`, results.repositioningCost, true);
      r++;
    }

    // Cross-check totals — sum of allocated costs vs engine totals
    setSubSectionHeader(r, "RECONCILIATION (Sum of cargos vs Engine)"); r++;
    setText(0, r, "Field", S.seqHeader);
    setText(1, r, "Sum of Allocations", S.colHeaderFormula);
    setText(2, r, "Engine Total", S.colHeaderSoftware);
    r++;

    const sumAllocBunker = results.perCargoBreakdown.reduce((s, p) => s + p.allocatedBunker, 0);
    const sumAllocPort = results.perCargoBreakdown.reduce((s, p) => s + p.allocatedPortCosts, 0);
    const sumAllocHire = results.perCargoBreakdown.reduce((s, p) => s + p.allocatedHire, 0);
    const sumGrossFreight = results.perCargoBreakdown.reduce((s, p) => s + p.grossFreight, 0);

    setText(0, r, "Gross Freight ($)", S.calcLabel);
    ws[cellRef(1, r)] = { t: "n", v: sumGrossFreight, s: S.formula };
    ws[cellRef(2, r)] = { t: "n", v: results.grossFreight, s: S.software };
    r++;
    setText(0, r, "Allocated Bunker ($) + Repos", S.calcLabel);
    ws[cellRef(1, r)] = { t: "n", v: sumAllocBunker + (results.repositioningCost || 0), s: S.formula };
    ws[cellRef(2, r)] = { t: "n", v: results.totalBunkerCost, s: S.software };
    r++;
    setText(0, r, "Allocated Port Costs ($)", S.calcLabel);
    ws[cellRef(1, r)] = { t: "n", v: sumAllocPort, s: S.formula };
    ws[cellRef(2, r)] = { t: "n", v: results.portCosts, s: S.software };
    r++;
    setText(0, r, "Allocated Hire ($)", S.calcLabel);
    ws[cellRef(1, r)] = { t: "n", v: sumAllocHire, s: S.formula };
    ws[cellRef(2, r)] = { t: "n", v: results.hireCost, s: S.software };
    r++;

    // Methodology note
    setText(0, r, "Note", S.inputLabel);
    setText(1, r, "Bunker, Port and Hire are allocated per cargo by ROUTE WINDOW (load→final discharge) with overlap split by loaded-qty share; repositioning legs are excluded. Each Excel formula multiplies the engine total by that cargo's route-allocated ratio so the Excel Formula column always ties out to the Software Value column.", S.inputText);
    r++;
    r++;
  }

  // ═══════════════════════════════════════════════════════
  // SECTION 8: ENVIRONMENTAL
  // ═══════════════════════════════════════════════════════

  setSectionHeader(r, "ENVIRONMENTAL & EMISSIONS"); r++;
  setText(0, r, "", S.envLabel);
  ws[cellRef(1, r)] = { t: "s", v: "Excel Formula", s: S.colHeaderFormula };
  ws[cellRef(2, r)] = { t: "s", v: "Software Value", s: S.colHeaderSoftware };
  r++;

  // CO₂ emission factors
  setCalcLabel(r, "CO₂ Factor HSFO (t/t)", false, false, true); setNum(1, r, CO2_EMISSION_FACTORS.hsfo, S.envFormula); const R_CFH = r; r++;
  setCalcLabel(r, "CO₂ Factor VLSFO (t/t)", false, false, true); setNum(1, r, CO2_EMISSION_FACTORS.vlsfo, S.envFormula); const R_CFV = r; r++;
  setCalcLabel(r, "CO₂ Factor LSMGO (t/t)", false, false, true); setNum(1, r, CO2_EMISSION_FACTORS.lsmgo, S.envFormula); const R_CFL = r; r++;
  r++;

  setCalcLabel(r, "CO₂ from HSFO (mt)", false, false, true);
  setCalcFormula(r, `${B(R_HSFOT)}*${B(R_CFH)}`, results.co2ByFuel.hsfo, false, false, true);
  const R_CO2H = r; r++;

  setCalcLabel(r, "CO₂ from VLSFO (mt)", false, false, true);
  setCalcFormula(r, `${B(R_VLSFOT)}*${B(R_CFV)}`, results.co2ByFuel.vlsfo, false, false, true);
  const R_CO2V = r; r++;

  setCalcLabel(r, "CO₂ from LSMGO (mt)", false, false, true);
  setCalcFormula(r, `${B(R_LSMGOT)}*${B(R_CFL)}`, results.co2ByFuel.lsmgo, false, false, true);
  const R_CO2L = r; r++;

  setCalcLabel(r, "Total CO₂ (mt)", true);
  setCalcFormula(r, `${B(R_CO2H)}+${B(R_CO2V)}+${B(R_CO2L)}`, results.totalCo2, true);
  const R_TCO2 = r; r++;
  r++;

  setCalcLabel(r, "CO₂ Ballast (mt)", false, false, true);
  setCalcFormula(r, `IF(${B(R_TSEA)}>0,${B(R_TCO2)}*${B(R_SBAL)}/${B(R_TSEA)},0)`, results.co2Ballast, false, false, true);
  r++;

  setCalcLabel(r, "CO₂ Laden (mt)", false, false, true);
  setCalcFormula(r, `IF(${B(R_TSEA)}>0,${B(R_TCO2)}*${B(R_SLAD)}/${B(R_TSEA)},0)`, results.co2Laden, false, false, true);
  r++;
  r++;

  // EFOI
  setCalcLabel(r, "EFOI (gCO₂/tnm)", false, false, true);
  setCalcFormula(r,
    `IF(AND(${B(R_QTY)}>0,${B(R_LADIST)}>0),${B(R_TCO2)}*1000000/(${B(R_QTY)}*${B(R_LADIST)}),0)`,
    results.efoi, false, false, true);
  r++;

  // CII
  setCalcLabel(r, "CII Actual (gCO₂/dwt-nm)", false, false, true);
  setCalcFormula(r,
    `IF(AND(${B(R_DWT)}>0,${B(R_TOTDIST)}>0),${B(R_TCO2)}*1000000/(${B(R_DWT)}*${B(R_TOTDIST)}),0)`,
    results.afrCii, false, false, true);
  r++;

  setCalcLabel(r, "CII Rating", false, false, true);
  ws[cellRef(1, r)] = { t: "s", v: results.ciiRating, s: S.envFormula };
  ws[cellRef(2, r)] = { t: "s", v: results.ciiRating, s: S.envSoftware };
  r++;
  setCalcLabel(r, "Required CII", false, false, true); setNum(1, r, results.ciiResult.requiredCii, S.envFormula); setNum(2, r, results.ciiResult.requiredCii, S.envSoftware); r++;
  setCalcLabel(r, "CII Ratio", false, false, true); setNum(1, r, results.ciiResult.ciiRatio, S.envFormula); setNum(2, r, results.ciiResult.ciiRatio, S.envSoftware); r++;
  r++;

  // Total CO₂ Cost
  setCalcLabel(r, "Total CO₂ Cost ($)", false, false, true);
  setCalcFormula(r, `${B(R_TCO2)}*${B(R_CO2P)}`, results.totalCo2Cost, false, false, true);
  r++;

  // ═══════════════════════════════════════════════════════
  // EU-COVERED FUEL (Segment-wise calculation)
  // ═══════════════════════════════════════════════════════
  setSubSectionHeader(r, "EU ETS & FuelEU COVERED FUEL — EXACT ENGINE COVERAGE"); r++;
  setText(0, r, "Sea rule", S.inputLabel);
  setText(1, r, "EU→EU 100%; EU↔Non-EU 50%; Non-EU→Non-EU 0%. PSSG and bunkering rows do not reset the surrounding regulatory sea leg.", S.inputText); r++;
  setText(0, r, "Port-stay rule", S.inputLabel);
  setText(1, r, "EU port (eu_zone=true) 100%; non-EU port 0%. Covers load, discharge, bunkering and passage/waiting port time inside the commercial window.", S.inputText); r++;
  setText(0, r, "Commercial window", S.inputLabel);
  setText(1, r, "First load through last discharge. If the opening port is EU, the opening ballast leg is included. Repositioning after final discharge is excluded.", S.inputText); r++;
  r++;

  setSubSectionHeader(r, "EU ETS COVERAGE AUDIT — PORT TYPE, SEA FACTOR & PORT-STAY FACTOR"); r++;
  ["Origin", "Destination / Port", "Operation", "EU Origin?", "EU Destination?", "Sea Coverage %", "Port Coverage %", "Sea HSFO", "Sea VLSFO", "Sea LSMGO", "Port HSFO", "Port VLSFO", "Port LSMGO", "Covered CO₂"].forEach((h, i) => setText(i, r, h, S.seqHeader)); r++;
  results.etsLegDetails.forEach((detail, index) => {
    const seqLeg = sequence.find((leg) => (leg.portUnloc || leg.port || "").trim() === detail.destUnloc) || sequence[detail.legIndex];
    const style = index % 2 ? S.seqDataAlt : S.seqData;
    const textStyle = index % 2 ? S.seqTextAlt : S.seqText;
    setText(0, r, detail.isPortOnly ? "Commercial start" : detail.originPort, textStyle);
    setText(1, r, detail.destPort, textStyle);
    setText(2, r, seqLeg?.operation || "", textStyle);
    setNum(3, r, detail.originIsEu ? 1 : 0, style); setNum(4, r, detail.destIsEu ? 1 : 0, style);
    setNum(5, r, detail.coveragePct, style); setNum(6, r, detail.portCoveragePct, style);
    setNum(7, r, detail.seaHsfo, style); setNum(8, r, detail.seaVlsfo, style); setNum(9, r, detail.seaLsmgo, style);
    setNum(10, r, detail.portHsfo, style); setNum(11, r, detail.portVlsfo, style); setNum(12, r, detail.portLsmgo, style);
    setNum(13, r, detail.chargeableCo2, style); r++;
  });
  r++;

  // Pre-compute EU-covered fuel using same logic as useVoyageCalculation.ts
  let sv_euHsfo = 0, sv_euVlsfo = 0, sv_euLsmgo = 0;
  let sv_euHsfoSea = 0, sv_euVlsfoSea = 0, sv_euLsmgoSeaMe = 0, sv_euLsmgoSeaAe = 0;
  let sv_euHsfoPort = 0, sv_euVlsfoPort = 0, sv_euLsmgoPort = 0, sv_euLsmgoPortAe = 0;
  let sv_euHsfoExtra = 0, sv_euVlsfoExtra = 0, sv_euLsmgoExtra = 0;
  let totalSeaTimeSegs = 0, weightedEuSeaF = 0;
  {
    let segCob = 0;
    
    sequence.forEach((leg, idx) => {
      const legOp = (leg.operation || '').toLowerCase();
      const legQty = Math.max(0, leg.quantity || 0);
      const legIsLaden = segCob > 0;
      const curIsEu = leg.isEuEea === true;
      const curPortKey = (leg.portUnloc || leg.port || "").trim();
      
      // Sea fuel - EU factor uses bracketing cargo-operation ports (same as software engine)
      if (curPortKey) {
        const euF = inEuSeaWindow(idx) ? computeSeaEuFactor(idx) : 0;
        const legST = leg.totalLegTime || 0;
        if (inEuSeaWindow(idx)) {
          totalSeaTimeSegs += legST;
          weightedEuSeaF += legST * euF;
        }
        
        if (euF > 0) {
          const legNET = (leg.totalLegTime || 0) - (leg.ecaTime || 0);
          const legET = leg.ecaTime || 0;
          
          if (hasScrubber) {
            const rate = legIsLaden ? (profile.hsfo.laden || 0) : (profile.hsfo.ballast || 0);
            const amt = legNET * rate * rewardFactor * euF;
            sv_euHsfo += amt;
            sv_euHsfoSea += amt;
          } else {
            const rate = legIsLaden ? (profile.vlsfo.laden || 0) : (profile.vlsfo.ballast || 0);
            const amt = legNET * rate * rewardFactor * euF;
            sv_euVlsfo += amt;
            sv_euVlsfoSea += amt;
          }
          const ecaRate = legIsLaden ? (profile.lsmgo.laden || 0) : (profile.lsmgo.ballast || 0);
          const lsmgoMeAmt = legET * ecaRate * rewardFactor * euF;
          sv_euLsmgo += lsmgoMeAmt;
          sv_euLsmgoSeaMe += lsmgoMeAmt;
          
          const aeRs = hasScrubber ? profile.aeScrubber : profile.ae;
          const aeR2 = legIsLaden ? (aeRs.laden || 0) : (aeRs.ballast || 0);
          const lsmgoAeAmt = legST * aeR2 * rewardFactor * euF;
          sv_euLsmgo += lsmgoAeAmt;
          sv_euLsmgoSeaAe += lsmgoAeAmt;
        }
      }
      
      // Port fuel uses the port's own eu_zone flag: EU 100%, non-EU 0%,
      // constrained to the commercial voyage window.
      const portEuF = curPortKey && inEuPortWindow(idx) && curIsEu ? 1 : 0;
      const effectivePortDays = effectiveLeg(leg).portDays;
      if (curPortKey && portEuF > 0 && effectivePortDays > 0) {
        const pf = (leg as any).portFuelType || (hasScrubber ? 'hsfo' : 'vlsfo');
        const aeRs = hasScrubber ? profile.aeScrubber : profile.ae;
        const pd = effectivePortDays;
        
        let pH = 0, pV = 0, pL = 0, pAeL = 0;
        const addF = (ft: string, amt: number) => { if (ft === 'hsfo') pH += amt; else if (ft === 'vlsfo') pV += amt; else pL += amt; };
        
        // Engine rule: the FULL port stay at a load/discharge call burns the
        // load/discharge rate (turn + extra time is NOT split onto idle).
        if (legOp === 'load' || legOp === 'loading') {
          addF(pf, pd * (profile[pf]?.load || 0));
          pAeL += pd * (aeRs.load || 0);
        } else if (legOp === 'disch' || legOp === 'discharging') {
          addF(pf, pd * (profile[pf]?.discharge || 0));
          pAeL += pd * (aeRs.discharge || 0);
        } else {
          addF(pf, pd * (profile[pf]?.idle || 0));
          pAeL += pd * (aeRs.idle || 0);
        }
        sv_euHsfo += pH * portEuF;
        sv_euVlsfo += pV * portEuF;
        sv_euLsmgo += (pL + pAeL) * portEuF;
        sv_euHsfoPort += pH * portEuF;
        sv_euVlsfoPort += pV * portEuF;
        sv_euLsmgoPort += pL * portEuF;
        sv_euLsmgoPortAe += pAeL * portEuF;
      }
      
      if (legOp === 'load' || legOp === 'loading') segCob += legQty;
      else if (legOp === 'disch' || legOp === 'discharging') segCob = Math.max(0, segCob - legQty);
    });
    
    // Extra sea/port/canal days
    if (extraSeaDays > 0 && totalSeaTimeSegs > 0) {
      const avgF = weightedEuSeaF / totalSeaTimeSegs;
      if (avgF > 0) {
        if (hasScrubber) {
          sv_euHsfoExtra += extraSeaDays * (profile.hsfo.laden || 0) * rewardFactor * avgF;
          sv_euHsfo += sv_euHsfoExtra;
        } else {
          sv_euVlsfoExtra += extraSeaDays * (profile.vlsfo.laden || 0) * rewardFactor * avgF;
          sv_euVlsfo += sv_euVlsfoExtra;
        }
        const aeRs = hasScrubber ? profile.aeScrubber : profile.ae;
        sv_euLsmgoExtra += extraSeaDays * (aeRs.laden || 0) * rewardFactor * avgF;
        sv_euLsmgo += sv_euLsmgoExtra;
      }
    }
    if (extraPortDays > 0 && totalSeaTimeSegs > 0) {
      // Extra port days inherit the weighted sea-leg coverage (leg-uniform rule).
      const avgPF = weightedEuSeaF / totalSeaTimeSegs;
      if (avgPF > 0) {
        const epft = hasScrubber ? 'hsfo' : 'vlsfo';
        const epir = profile[epft]?.idle || 0;
        if (epft === 'hsfo') {
          sv_euHsfoExtra += extraPortDays * epir * avgPF;
          sv_euHsfo += extraPortDays * epir * avgPF;
        } else {
          sv_euVlsfoExtra += extraPortDays * epir * avgPF;
          sv_euVlsfo += extraPortDays * epir * avgPF;
        }
        const aeRs = hasScrubber ? profile.aeScrubber : profile.ae;
        sv_euLsmgoExtra += extraPortDays * (aeRs.idle || 0) * avgPF;
        sv_euLsmgo += extraPortDays * (aeRs.idle || 0) * avgPF;
      }
    }
    if (extraCanalDays > 0 && totalSeaTimeSegs > 0) {
      const avgF = weightedEuSeaF / totalSeaTimeSegs;
      if (avgF > 0) {
        if (hasScrubber) {
          sv_euHsfoExtra += extraCanalDays * (profile.hsfo.canal || 0) * avgF;
          sv_euHsfo += extraCanalDays * (profile.hsfo.canal || 0) * avgF;
        } else {
          sv_euVlsfoExtra += extraCanalDays * (profile.vlsfo.canal || 0) * avgF;
          sv_euVlsfo += extraCanalDays * (profile.vlsfo.canal || 0) * avgF;
        }
      }
    }
  }

  // ---- Reconcile to the engine ----------------------------------------
  // The workbook must report exactly the EU-covered fuel the software used for
  // EU ETS and FuelEU. Any residual (rounding / override differences) is booked
  // on the "Extra Time" line so the component rows still add up to the total.
  {
    const eng = (results as { euCoveredFuel?: { hsfo: number; vlsfo: number; lsmgo: number } }).euCoveredFuel;
    if (eng) {
      sv_euHsfoExtra += (eng.hsfo || 0) - sv_euHsfo;
      sv_euVlsfoExtra += (eng.vlsfo || 0) - sv_euVlsfo;
      sv_euLsmgoExtra += (eng.lsmgo || 0) - sv_euLsmgo;
      sv_euHsfo = eng.hsfo || 0;
      sv_euVlsfo = eng.vlsfo || 0;
      sv_euLsmgo = eng.lsmgo || 0;
    }
  }

  // Now build Excel formulas for EU-covered fuel using SUMPRODUCT over sequence columns
  // Sea EU fuel: SUMPRODUCT of (NonECA time per leg × rate × RF × EU sea factor) per fuel type
  // For HSFO sea EU:
  setCalcLabel(r, "HSFO EU Sea (mt)", false, false, true);
  const hsfoEuSeaF = `IF(${scrCell}=1,SUMPRODUCT((${seqRange(SC.NECAB)}*${hBal}+${seqRange(SC.NECAL)}*${hLad})*${seqRange(SC.EUSEA)})*${rfCell},0)`;
  setCalcFormula(r, hsfoEuSeaF, sv_euHsfoSea, false, false, true);
  const R_EU_HSFO_SEA = r; r++;

  setCalcLabel(r, "VLSFO EU Sea (mt)", false, false, true);
  const vlsfoEuSeaF = `IF(${scrCell}=0,SUMPRODUCT((${seqRange(SC.NECAB)}*${vBal}+${seqRange(SC.NECAL)}*${vLad})*${seqRange(SC.EUSEA)})*${rfCell},0)`;
  setCalcFormula(r, vlsfoEuSeaF, sv_euVlsfoSea, false, false, true);
  const R_EU_VLSFO_SEA = r; r++;

  setCalcLabel(r, "LSMGO EU Sea ME (mt)", false, false, true);
  const lsmgoEuSeaMeF = `SUMPRODUCT((${seqRange(SC.ECAB)}*${lBal}+${seqRange(SC.ECAL)}*${lLad})*${seqRange(SC.EUSEA)})*${rfCell}`;
  setCalcFormula(r, lsmgoEuSeaMeF, sv_euLsmgoSeaMe, false, false, true);
  const R_EU_LSMGO_SEA_ME = r; r++;

  setCalcLabel(r, "LSMGO EU Sea AE (mt)", false, false, true);
  const lsmgoEuSeaAeF = `SUMPRODUCT((${seqRange(SC.BSEA)}*(${aeBal})+${seqRange(SC.LSEA)}*(${aeLad}))*${seqRange(SC.EUSEA)})*${rfCell}`;
  setCalcFormula(r, lsmgoEuSeaAeF, sv_euLsmgoSeaAe, false, false, true);
  const R_EU_LSMGO_SEA_AE = r; r++;
  r++;

  // Port EU fuel — uses EUPORT factor column (1 for EU port, 0 for non-EU)
  setCalcLabel(r, "HSFO EU Port (mt)", false, false, true);
  const hsfoEuPortF = `SUMPRODUCT((${seqRange(SC.HLD)}*${hLoad}+${seqRange(SC.HDD)}*${hDisch}+${seqRange(SC.HID)}*${hIdle})*${seqRange(SC.EUPORT)})`;
  setCalcFormula(r, hsfoEuPortF, sv_euHsfoPort, false, false, true);
  const R_EU_HSFO_PORT = r; r++;

  setCalcLabel(r, "VLSFO EU Port (mt)", false, false, true);
  const vlsfoEuPortF = `SUMPRODUCT((${seqRange(SC.VLD)}*${vLoad}+${seqRange(SC.VDD)}*${vDisch}+${seqRange(SC.VID)}*${vIdle})*${seqRange(SC.EUPORT)})`;
  setCalcFormula(r, vlsfoEuPortF, sv_euVlsfoPort, false, false, true);
  const R_EU_VLSFO_PORT = r; r++;

  setCalcLabel(r, "LSMGO EU Port (mt)", false, false, true);
  const lsmgoEuPortF = `SUMPRODUCT((${seqRange(SC.LLD)}*${lLoad}+${seqRange(SC.LDD)}*${lDisch}+${seqRange(SC.LID)}*${lIdle})*${seqRange(SC.EUPORT)})`;
  setCalcFormula(r, lsmgoEuPortF, sv_euLsmgoPort, false, false, true);
  const R_EU_LSMGO_PORT = r; r++;

  // AE Port EU
  setCalcLabel(r, "LSMGO EU Port AE (mt)", false, false, true);
  const lsmgoEuPortAeF = `SUMPRODUCT((${seqRange(SC.ISLD)}*${seqRange(SC.WDAYS)}*(${aeLoad})+${seqRange(SC.ISDC)}*${seqRange(SC.WDAYS)}*(${aeDisch})+${seqRange(SC.IDAYS)}*(${aeIdle}))*${seqRange(SC.EUPORT)})`;
  setCalcFormula(r, lsmgoEuPortAeF, sv_euLsmgoPortAe, false, false, true);
  const R_EU_LSMGO_PORT_AE = r; r++;
  r++;

  setCalcLabel(r, "HSFO EU Extra Time (mt)", false, false, true);
  setCalcFormula(r, `${sv_euHsfoExtra}`, sv_euHsfoExtra, false, false, true);
  const R_EU_HSFO_EXTRA = r; r++;

  setCalcLabel(r, "VLSFO EU Extra Time (mt)", false, false, true);
  setCalcFormula(r, `${sv_euVlsfoExtra}`, sv_euVlsfoExtra, false, false, true);
  const R_EU_VLSFO_EXTRA = r; r++;

  setCalcLabel(r, "LSMGO EU Extra Time (mt)", false, false, true);
  setCalcFormula(r, `${sv_euLsmgoExtra}`, sv_euLsmgoExtra, false, false, true);
  const R_EU_LSMGO_EXTRA = r; r++;
  r++;

  // EU-Covered Fuel Totals
  setCalcLabel(r, "HSFO EU Total (mt)", true);
  setCalcFormula(r, `${B(R_EU_HSFO_SEA)}+${B(R_EU_HSFO_PORT)}+${B(R_EU_HSFO_EXTRA)}`, sv_euHsfo, true);
  const R_EU_HSFOT = r; r++;

  setCalcLabel(r, "VLSFO EU Total (mt)", true);
  setCalcFormula(r, `${B(R_EU_VLSFO_SEA)}+${B(R_EU_VLSFO_PORT)}+${B(R_EU_VLSFO_EXTRA)}`, sv_euVlsfo, true);
  const R_EU_VLSFOT = r; r++;

  setCalcLabel(r, "LSMGO EU Total (mt)", true);
  setCalcFormula(r, `${B(R_EU_LSMGO_SEA_ME)}+${B(R_EU_LSMGO_SEA_AE)}+${B(R_EU_LSMGO_PORT)}+${B(R_EU_LSMGO_PORT_AE)}+${B(R_EU_LSMGO_EXTRA)}`, sv_euLsmgo, true);
  const R_EU_LSMGOT = r; r++;

  // EU coverage percentages
  setCalcLabel(r, "HSFO EU Coverage (%)", false, false, true);
  setCalcFormula(r, `IF(${B(R_HSFOT)}>0,${B(R_EU_HSFOT)}/${B(R_HSFOT)}*100,0)`,
    results.hsfoConsumption > 0 ? (sv_euHsfo / results.hsfoConsumption * 100) : 0, false, false, true);
  r++;

  setCalcLabel(r, "VLSFO EU Coverage (%)", false, false, true);
  setCalcFormula(r, `IF(${B(R_VLSFOT)}>0,${B(R_EU_VLSFOT)}/${B(R_VLSFOT)}*100,0)`,
    results.vlsfoConsumption > 0 ? (sv_euVlsfo / results.vlsfoConsumption * 100) : 0, false, false, true);
  r++;

  setCalcLabel(r, "LSMGO EU Coverage (%)", false, false, true);
  setCalcFormula(r, `IF(${B(R_LSMGOT)}>0,${B(R_EU_LSMGOT)}/${B(R_LSMGOT)}*100,0)`,
    results.lsmgoConsumption > 0 ? (sv_euLsmgo / results.lsmgoConsumption * 100) : 0, false, false, true);
  r++;
  r++;

  // EU ETS
  setSubSectionHeader(r, "EU EMISSIONS TRADING SYSTEM (EU ETS) — BOTTOM-UP FROM COVERED FUEL"); r++;
  setCalcLabel(r, "Commercial Sea Voyage Coverage (%) — time weighted", false, false, true);
  setCalcFormula(r,
    `IF(SUMPRODUCT(${seqRange(SC.EUWIN)},${seqRange(SC.SEAT)})>0,SUMPRODUCT(${seqRange(SC.EUSEA)},${seqRange(SC.SEAT)})/SUMPRODUCT(${seqRange(SC.EUWIN)},${seqRange(SC.SEAT)})*100,0)`,
    results.etsVoyageCoverage * 100, false, false, true);
  r++;
  setText(0, r, "Important", S.inputLabel);
  setText(1, r, "Voyage coverage is informational only. Chargeable CO₂ is calculated from covered sea fuel plus covered EU-port fuel, then multiplied by phase-in.", S.inputText); r++;

  setCalcLabel(r, "ETS Phase-in (%)", false, false, true);
  setNum(1, r, results.etsPhaseIn * 100, S.envFormula);
  setNum(2, r, results.etsPhaseIn * 100, S.envSoftware);
  const R_ETSPHASE = r; r++;
  setText(0, r, "Phase-in basis", S.inputLabel);
  setText(1, r, `Current calculation year ${new Date().getFullYear()} (2024: 40%, 2025: 70%, 2026 onward: 100%).`, S.inputText); r++;

  // EU CO₂ from fuel — BOTTOM-UP per EU MRV/ETS:
  // = HSFO_EU × 3.114 + VLSFO_EU × 3.151 + LSMGO_EU × 3.206
  setCalcLabel(r, "EU CO₂ from Fuel (mt)", false, false, true);
  setCalcFormula(r,
    `${B(R_EU_HSFOT)}*${B(R_CFH)}+${B(R_EU_VLSFOT)}*${B(R_CFV)}+${B(R_EU_LSMGOT)}*${B(R_CFL)}`,
    sv_euHsfo * CO2_EMISSION_FACTORS.hsfo
      + sv_euVlsfo * CO2_EMISSION_FACTORS.vlsfo
      + sv_euLsmgo * CO2_EMISSION_FACTORS.lsmgo,
    false, false, true);
  const R_EUCO2 = r; r++;

  // Chargeable CO₂ EUA = EU CO₂ from fuel × Phase-in
  setCalcLabel(r, "Chargeable CO₂ EUA (mt)", false, false, true);
  setCalcFormula(r,
    `${B(R_EUCO2)}*${B(R_ETSPHASE)}/100`,
    results.chargeableCo2, false, false, true);
  const R_CHCO2 = r; r++;

  setCalcLabel(r, "EUA CO₂ Cost ($)", false, false, true);
  setCalcFormula(r, `${B(R_CHCO2)}*${B(R_EUP)}`, results.euaCo2Cost, false, false, true);
  const R_EUACOST = r; r++;

  setCalcLabel(r, "EUA Freight Impact ($/mt)", false, false, true);
  setCalcFormula(r, `IF(${B(R_QTY)}>0,${B(R_EUACOST)}/${B(R_QTY)},0)`, results.euaFreightImpact, false, false, true);
  r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // UK ETS — exact Phase 1 internal rules
  // ═══════════════════════════════════════════════════════
  setSubSectionHeader(r, "UNITED KINGDOM EMISSIONS TRADING SCHEME (UK ETS) — EXACT ENGINE LOGIC"); r++;
  setText(0, r, "Sea rule", S.inputLabel);
  setText(1, r, "GB↔GB and NI↔NI 100%; GB↔NI 50%; UK↔non-UK and non-UK↔non-UK 0% in Phase 1.", S.inputText); r++;
  setText(0, r, "Port-stay rule", S.inputLabel);
  setText(1, r, "100% where uk_ets=true, otherwise 0%. Applies to load, discharge, bunkering and passage/waiting port time.", S.inputText); r++;
  setText(0, r, "Phase-in rule", S.inputLabel);
  setText(1, r, "0% before 1 July 2026; 100% from 1 July 2026. No gradual phase-in.", S.inputText); r++;

  setText(0, r, "Origin", S.seqHeader); setText(1, r, "Destination / Port", S.seqHeader); setText(2, r, "Origin Zone", S.seqHeader); setText(3, r, "Destination Zone", S.seqHeader); setText(4, r, "Sea Coverage %", S.seqHeader); setText(5, r, "Port Coverage %", S.seqHeader); setText(6, r, "Covered HSFO", S.seqHeader); setText(7, r, "Covered VLSFO", S.seqHeader); setText(8, r, "Covered LSMGO", S.seqHeader); setText(9, r, "Covered CO₂", S.seqHeader); setText(10, r, "Chargeable CO₂", S.seqHeader); r++;
  results.ukEtsResult.legBreakdown.forEach((detail, index) => {
    const style = index % 2 ? S.seqDataAlt : S.seqData;
    const textStyle = index % 2 ? S.seqTextAlt : S.seqText;
    setText(0, r, detail.originPort, textStyle); setText(1, r, detail.destPort, textStyle);
    setText(2, r, detail.originZone ? String(detail.originZone).toUpperCase() : "Non-UK", textStyle);
    setText(3, r, detail.destZone ? String(detail.destZone).toUpperCase() : "Non-UK", textStyle);
    setNum(4, r, detail.seaCoveragePct, style); setNum(5, r, detail.portCoveragePct, style);
    setNum(6, r, detail.ukCoveredFuel.hsfo, style); setNum(7, r, detail.ukCoveredFuel.vlsfo, style); setNum(8, r, detail.ukCoveredFuel.lsmgo, style);
    setNum(9, r, detail.ukCoveredCo2, style); setNum(10, r, detail.chargeableCo2, style); r++;
  });
  r++;
  setCalcLabel(r, "UK Sea Voyage Coverage (%) — time weighted", false, false, true);
  setNum(1, r, (results.ukEtsVoyageCoverage || 0) * 100, S.envFormula);
  setNum(2, r, (results.ukEtsVoyageCoverage || 0) * 100, S.envSoftware);
  r++;

  setCalcLabel(r, "UK ETS Phase-in (%)", false, false, true);
  setNum(1, r, (results.ukEtsPhaseIn || 0) * 100, S.envFormula);
  setNum(2, r, (results.ukEtsPhaseIn || 0) * 100, S.envSoftware);
  const R_UKPHASE = r; r++;

  setCalcLabel(r, "UK-Covered HSFO (mt)", false, false, true);
  setNum(1, r, results.ukEtsResult?.ukCoveredFuel?.hsfo || 0, S.envFormula);
  setNum(2, r, results.ukEtsResult?.ukCoveredFuel?.hsfo || 0, S.envSoftware);
  const R_UK_H = r; r++;
  setCalcLabel(r, "UK-Covered VLSFO (mt)", false, false, true);
  setNum(1, r, results.ukEtsResult?.ukCoveredFuel?.vlsfo || 0, S.envFormula);
  setNum(2, r, results.ukEtsResult?.ukCoveredFuel?.vlsfo || 0, S.envSoftware);
  const R_UK_V = r; r++;
  setCalcLabel(r, "UK-Covered LSMGO (mt)", false, false, true);
  setNum(1, r, results.ukEtsResult?.ukCoveredFuel?.lsmgo || 0, S.envFormula);
  setNum(2, r, results.ukEtsResult?.ukCoveredFuel?.lsmgo || 0, S.envSoftware);
  const R_UK_L = r; r++;

  setCalcLabel(r, "UK CO₂ from Fuel (mt)", false, false, true);
  setCalcFormula(r,
    `${B(R_UK_H)}*${B(R_CFH)}+${B(R_UK_V)}*${B(R_CFV)}+${B(R_UK_L)}*${B(R_CFL)}`,
    (results.ukEtsResult?.ukCoveredFuel?.hsfo || 0) * CO2_EMISSION_FACTORS.hsfo
      + (results.ukEtsResult?.ukCoveredFuel?.vlsfo || 0) * CO2_EMISSION_FACTORS.vlsfo
      + (results.ukEtsResult?.ukCoveredFuel?.lsmgo || 0) * CO2_EMISSION_FACTORS.lsmgo,
    false, false, true);
  const R_UKCO2 = r; r++;

  setCalcLabel(r, "Chargeable CO₂ UKA (mt)", false, false, true);
  setCalcFormula(r, `${B(R_UKCO2)}*${B(R_UKPHASE)}/100`, results.ukEtsResult?.chargeableCo2 || 0, false, false, true);
  const R_UKCH = r; r++;

  setCalcLabel(r, "UK ETS Cost ($)", false, false, true);
  setCalcFormula(r, `${B(R_UKCH)}*${B(R_UKP)}`, results.ukEtsCost || 0, false, false, true);
  const R_UKCOST = r; r++;

  setCalcLabel(r, "UK ETS Freight Impact ($/mt)", false, false, true);
  setCalcFormula(r, `IF(${B(R_QTY)}>0,${B(R_UKCOST)}/${B(R_QTY)},0)`, results.ukEtsFreightImpact || 0, false, false, true);
  r++;

  // FuelEU Maritime
  setSubSectionHeader(r, "FUELEU MARITIME — WELL-TO-WAKE ENERGY & COMPLIANCE BALANCE"); r++;
  setText(0, r, "Coverage basis", S.inputLabel); setText(1, r, "Uses the same EU-covered fuel above: sea 100/50/0 plus EU port stays at 100%.", S.inputText); r++;
  setCalcLabel(r, "Voyage Year", false, false, true); setNum(1, r, results.fuelEuResult.voyageYear, S.envFormula); setNum(2, r, results.fuelEuResult.voyageYear, S.envSoftware); r++;
  setCalcLabel(r, "GHG Intensity Limit (gCO₂e/MJ)", false, false, true); setNum(1, r, results.fuelEuResult.ghgLimit, S.envFormula); setNum(2, r, results.fuelEuResult.ghgLimit, S.envSoftware); const R_FE_LIMIT = r; r++;
  setCalcLabel(r, "Penalty Rate (€/MJ shortfall)", false, false, true); setNum(1, r, FUEL_EU_PENALTY_RATE_EUR_PER_MJ, S.envFormula); setNum(2, r, FUEL_EU_PENALTY_RATE_EUR_PER_MJ, S.envSoftware); const R_FE_RATE = r; r++;

  // EU-covered fuel quantities (link back to EU fuel totals)
  setCalcLabel(r, "HSFO EU Fuel (mt)", false, false, true);
  setCalcFormula(r, `${B(R_EU_HSFOT)}`, sv_euHsfo, false, false, true);
  const R_FE_HQ = r; r++;
  setCalcLabel(r, "VLSFO EU Fuel (mt)", false, false, true);
  setCalcFormula(r, `${B(R_EU_VLSFOT)}`, sv_euVlsfo, false, false, true);
  const R_FE_VQ = r; r++;
  setCalcLabel(r, "LSMGO EU Fuel (mt)", false, false, true);
  setCalcFormula(r, `${B(R_EU_LSMGOT)}`, sv_euLsmgo, false, false, true);
  const R_FE_LQ = r; r++;

  const feRows: Partial<Record<FuelKey, { energy: number; balance: number }>> = {};
  (["hsfo", "vlsfo", "lsmgo"] as FuelKey[]).forEach((fuel, index) => {
    const qtyRow = [R_FE_HQ, R_FE_VQ, R_FE_LQ][index];
    const props = FUEL_EU_PROPERTIES[fuel];
    const detail = results.fuelEuResult.fuels[fuel];
    setCalcLabel(r, `${fuel.toUpperCase()} Lower Calorific Value (MJ/g)`, false, false, true); setNum(1, r, props.lcv, S.envFormula); setNum(2, r, props.lcv, S.envSoftware); const lcvRow = r; r++;
    setCalcLabel(r, `${fuel.toUpperCase()} Well-to-Wake GHG (gCO₂e/MJ)`, false, false, true); setNum(1, r, props.ghg, S.envFormula); setNum(2, r, props.ghg, S.envSoftware); const ghgRow = r; r++;
    setCalcLabel(r, `${fuel.toUpperCase()} EU Energy (MJ)`, false, false, true); setCalcFormula(r, `${B(qtyRow)}*1000000*${B(lcvRow)}`, detail.euEnergy, false, false, true); const energyRow = r; r++;
    setCalcLabel(r, `${fuel.toUpperCase()} Compliance Balance (gCO₂e)`, false, false, true); setCalcFormula(r, `(${B(R_FE_LIMIT)}-${B(ghgRow)})*${B(energyRow)}`, detail.balance, false, false, true); const balanceRow = r; r++;
    feRows[fuel] = { energy: energyRow, balance: balanceRow };
  });
  const feH = feRows.hsfo; const feV = feRows.vlsfo; const feL = feRows.lsmgo;
  if (!feH || !feV || !feL) return;
  setCalcLabel(r, "Total EU Energy (MJ)", true); setCalcFormula(r, `${B(feH.energy)}+${B(feV.energy)}+${B(feL.energy)}`, results.fuelEuResult.totalEuEnergy, true); const R_FE_ENERGY = r; r++;
  setCalcLabel(r, "Total Compliance Balance (gCO₂e; negative = deficit)", true); setCalcFormula(r, `${B(feH.balance)}+${B(feV.balance)}+${B(feL.balance)}`, results.fuelEuResult.totalBalance, true); const R_FE_BAL = r; r++;
  setCalcLabel(r, "Weighted Voyage GHG Intensity (gCO₂e/MJ)", false, false, true); setCalcFormula(r, `IF(${B(R_FE_ENERGY)}>0,(${B(feH.energy)}*${FUEL_EU_PROPERTIES.hsfo.ghg}+${B(feV.energy)}*${FUEL_EU_PROPERTIES.vlsfo.ghg}+${B(feL.energy)}*${FUEL_EU_PROPERTIES.lsmgo.ghg})/${B(R_FE_ENERGY)},0)`, results.fuelEuResult.voyageGhg, false, false, true); const R_FE_GHG = r; r++;

  setCalcLabel(r, "FuelEU Total Penalty ($)", true);
  setCalcFormula(r, `IF(AND(${B(R_FE_BAL)}<0,${B(R_FE_GHG)}>0),ABS(${B(R_FE_BAL)})/${B(R_FE_GHG)}*${B(R_FE_RATE)}*${rfCell},0)`, results.fuelEuTotalPenalty, true);
  const R_FE_TOTAL = r; r++;

  // Replace the earlier regulatory source literals with live forward links to
  // the detailed calculation blocks. All Financials, NTCE/GTCE and P&L rows
  // therefore recalculate when coverage, prices or FuelEU assumptions change.
  setFormula(1, R_REG_EUA, `${B(R_EUACOST)}`, svEuaCost, S.formula);
  setNum(2, R_REG_EUA, svEuaCost, S.software);
  setFormula(1, R_REG_UK, `${B(R_UKCOST)}`, svUkCost, S.formula);
  setNum(2, R_REG_UK, svUkCost, S.software);
  setFormula(1, R_REG_FEU, `${B(R_FE_TOTAL)}`, svFuelEuCost, S.formula);
  setNum(2, R_REG_FEU, svFuelEuCost, S.software);

  r++;
  setSectionHeader(r, "FINAL PROFIT & LOSS AFTER REGULATORY IMPACTS"); r++;
  const basePnl = results.pAndL + svRegulatory;
  setCalcLabel(r, "P&L Before EU ETS / UK ETS / FuelEU ($)", false, true); setCalcFormula(r, `${basePnl}`, basePnl, false, true); const R_FINAL_BASE = r; r++;
  setCalcLabel(r, "Less: Applied EU ETS Cost ($)"); setCalcFormula(r, `${B(R_APP_EUA)}*${B(R_EUACOST)}`, applyEua ? svEuaCost : 0); const R_FINAL_EU = r; r++;
  setCalcLabel(r, "Less: Applied UK ETS Cost ($)"); setCalcFormula(r, `${B(R_APP_UK)}*${B(R_UKCOST)}`, applyUk ? svUkCost : 0); const R_FINAL_UK = r; r++;
  setCalcLabel(r, "Less: Applied FuelEU Penalty ($)"); setCalcFormula(r, `${B(R_APP_FEU)}*${B(R_FE_TOTAL)}`, applyFuelEu ? svFuelEuCost : 0); const R_FINAL_FE = r; r++;
  setCalcLabel(r, "Final P&L After Selected Regulatory Costs ($)", false, true); setCalcFormula(r, `${B(R_FINAL_BASE)}-${B(R_FINAL_EU)}-${B(R_FINAL_UK)}-${B(R_FINAL_FE)}`, results.pAndL, false, true); r++;

  // ═══════════════════════════════════════════════════════
  // FINALIZE WORKSHEET
  // ═══════════════════════════════════════════════════════

  // Set sheet range (expanded for new EU columns)
  ws["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 45, r: r } });

  // Column widths (expanded for new EU columns)
  ws["!cols"] = [
    { wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 8 }, { wch: 8 },
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
    { wch: 11 }, { wch: 11 }, { wch: 11 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ];

  // Freeze panes — freeze first column for labels
  ws["!freeze"] = { xSplit: 1, ySplit: 0 };

  XLSX.utils.book_append_sheet(wb, ws, "Voyage Calculation");

  const vesselName = vessel.name || "Voyage";
  const fileName = `${vesselName}_Estimate_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
