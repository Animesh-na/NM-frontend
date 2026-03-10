import * as XLSX from "xlsx-js-style";
import type { VoyageResults } from "@/hooks/useVoyageCalculation";
import type { VesselData } from "@/data/vessels";
import type { SequenceRowUI, CargoEntry, MiscState } from "@/context/VoyageContext";

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
  };
  misc: MiscState;
  hireRate: number;
  netBB: number;
  results: VoyageResults;
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
  const { vessel, sequence, cargos, bunker, misc, hireRate, netBB, results } = data;
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

  // --- CARGO ---
  setSectionHeader(r, "CARGO"); r++;
  setText(0, r, "Rate", S.inputLabel); setNum(1, r, cargo.rate); const R_RATE = r; r++;
  setText(0, r, "Rate Type", S.inputLabel); setText(1, r, cargo.rateType, S.inputText); const R_RTYPE = r; r++;
  setText(0, r, "Quantity (MT)", S.inputLabel); setNum(1, r, sequenceCargoQuantity); const R_QTY = r; r++;
  setText(0, r, "Voyage Comm (%)", S.inputLabel); setNum(1, r, cargo.voyageCommission); const R_VCOMM = r; r++;
  setText(0, r, "TC Comm (%)", S.inputLabel); setNum(1, r, cargo.tcCommission); const R_TCOMM = r; r++;
  const totalDemurrage = cargos.reduce((sum, c) => sum + (c.demurrageAmount || 0), 0);
  const totalDespatch = cargos.reduce((sum, c) => sum + (c.despatchAmount || 0), 0);
  setText(0, r, "Demurrage ($)", S.inputLabel); setNum(1, r, totalDemurrage); const R_DEM = r; r++;
  setText(0, r, "Despatch ($)", S.inputLabel); setNum(1, r, totalDespatch); const R_DESP = r; r++;
  r++;

  // --- BUNKER PRICES ---
  setSectionHeader(r, "BUNKER PRICES"); r++;
  setText(0, r, "HSFO Price ($/mt)", S.inputLabel); setNum(1, r, bunker.hsfo.price); const R_HP = r; r++;
  setText(0, r, "VLSFO Price ($/mt)", S.inputLabel); setNum(1, r, bunker.vlsfo.price); const R_VP = r; r++;
  setText(0, r, "LSMGO Price ($/mt)", S.inputLabel); setNum(1, r, bunker.lsmgo.price); const R_LP = r; r++;
  setText(0, r, "CO₂ Price ($/mt)", S.inputLabel); setNum(1, r, bunker.co2Price); const R_CO2P = r; r++;
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

  setSectionHeader(r, "VOYAGE SEQUENCE"); r++;

  // Column indices
  const SC = {
    ID: 0, OP: 1, PORT: 2, DIST: 3, ECAD: 4, SEAT: 5, ECAT: 6,
    PORTD: 7, TURNH: 8, DA: 9, LADEN: 10, PFUEL: 11,
    // Formula columns
    NECAT: 12, WDAYS: 13, IDAYS: 14,
    BSEA: 15, LSEA: 16, ECAB: 17, ECAL: 18, NECAB: 19, NECAL: 20,
    ISLD: 21, ISDC: 22,
    HLD: 23, VLD: 24, LLD: 25,
    HDD: 26, VDD: 27, LDD: 28,
    HID: 29, VID: 30, LID: 31,
  };

  // Headers — styled
  const seqHeaders = [
    "ID", "Operation", "Port", "Distance", "ECA Dist", "Sea Time", "ECA Time",
    "Port Days", "Turn+Extra(h)", "Exp DA", "Is Laden", "Port Fuel",
    "NonECA Time", "Working Days", "Idle Days",
    "Bal Sea", "Lad Sea", "ECA Bal", "ECA Lad", "NECA Bal", "NECA Lad",
    "IsLoad", "IsDisch",
    "HSFO Ld D", "VLSFO Ld D", "LSMGO Ld D",
    "HSFO Dc D", "VLSFO Dc D", "LSMGO Dc D",
    "HSFO Id D", "VLSFO Id D", "LSMGO Id D",
  ];
  seqHeaders.forEach((h, i) => setText(i, r, h, S.seqHeader));
  r++;

  // Pre-compute isLaden flags (stateful — cannot be done with pure Excel formulas)
  const ladenFlags: boolean[] = [];
  let isLaden = false;
  sequence.forEach((leg) => {
    ladenFlags.push(isLaden);
    const op = String(leg.operation || "");
    if (op === "load" || op === "loading") isLaden = true;
    else if (op === "disch" || op === "discharging") isLaden = false;
  });

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
    const portDays = leg.calculatedPortDays || 0;
    const turnExtraH = (leg.turnTime || 0) + (leg.extraTime || 0);
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

    // --- Formula columns (green tinted) ---
    const c = (cn: number) => cellRef(cn, rr);

    setFormula(SC.NECAT, rr, `${c(SC.SEAT)}-${c(SC.ECAT)}`, seaTime - ecaTime, fStyle);

    const wd = Math.max(0, portDays - turnExtraH / 24);
    setFormula(SC.WDAYS, rr, `MAX(0,${c(SC.PORTD)}-${c(SC.TURNH)}/24)`, wd, fStyle);

    const isLoadDisch = op === "load" || op === "loading" || op === "disch" || op === "discharging";
    const idleVal = isLoadDisch ? portDays - wd : portDays;
    setFormula(SC.IDAYS, rr,
      `IF(OR(${c(SC.OP)}="load",${c(SC.OP)}="loading",${c(SC.OP)}="disch",${c(SC.OP)}="discharging"),${c(SC.PORTD)}-${c(SC.WDAYS)},${c(SC.PORTD)})`,
      idleVal, fStyle);

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
    const pd = (leg as any).calculatedPortDays || 0;
    const teh = ((leg as any).turnTime || 0) + ((leg as any).extraTime || 0);
    const wd = Math.max(0, pd - teh / 24);
    const op = String(leg.operation || "");
    const pf = (leg as any).portFuelType || (hasScrubber ? "hsfo" : "vlsfo");
    const isLd = op === "load" || op === "loading";
    const isDc = op === "disch" || op === "discharging";

    if (il) { c_ecaLadD += et; c_necaLadD += net; }
    else { c_ecaBalD += et; c_necaBalD += net; }

    if (isLd) {
      c_tload += wd;
      if (pf === "hsfo") { c_hld += wd; c_hid += pd - wd; }
      else if (pf === "vlsfo") { c_vld += wd; c_vid += pd - wd; }
      else { c_lld += wd; c_lid += pd - wd; }
      c_tidle += pd - wd;
    } else if (isDc) {
      c_tdisch += wd;
      if (pf === "hsfo") { c_hdd += wd; c_hid += pd - wd; }
      else if (pf === "vlsfo") { c_vdd += wd; c_vid += pd - wd; }
      else { c_ldd += wd; c_lid += pd - wd; }
      c_tidle += pd - wd;
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
  setSubSectionHeader(r, "PORT TIME BY FUEL TYPE"); r++;

  setCalcLabel(r, "Loading Days (HSFO)"); setCalcFormula(r, `SUM(${seqRange(SC.HLD)})`, c_hld); const R_HLD = r; r++;
  setCalcLabel(r, "Loading Days (VLSFO)"); setCalcFormula(r, `SUM(${seqRange(SC.VLD)})`, c_vld); const R_VLD = r; r++;
  setCalcLabel(r, "Loading Days (LSMGO)"); setCalcFormula(r, `SUM(${seqRange(SC.LLD)})`, c_lld); const R_LLD = r; r++;
  setCalcLabel(r, "Disch Days (HSFO)"); setCalcFormula(r, `SUM(${seqRange(SC.HDD)})`, c_hdd); const R_HDD = r; r++;
  setCalcLabel(r, "Disch Days (VLSFO)"); setCalcFormula(r, `SUM(${seqRange(SC.VDD)})`, c_vdd); const R_VDD = r; r++;
  setCalcLabel(r, "Disch Days (LSMGO)"); setCalcFormula(r, `SUM(${seqRange(SC.LDD)})`, c_ldd); const R_LDD = r; r++;
  setCalcLabel(r, "Idle Days (HSFO)"); setCalcFormula(r, `SUM(${seqRange(SC.HID)})`, c_hid); const R_HID = r; r++;
  setCalcLabel(r, "Idle Days (VLSFO)"); setCalcFormula(r, `SUM(${seqRange(SC.VID)})`, c_vid); const R_VID = r; r++;
  setCalcLabel(r, "Idle Days (LSMGO)"); setCalcFormula(r, `SUM(${seqRange(SC.LID)})`, c_lid); const R_LID = r; r++;

  setCalcLabel(r, "Total Loading Days"); setCalcFormula(r, `${B(R_HLD)}+${B(R_VLD)}+${B(R_LLD)}`, c_tload); const R_TLOAD = r; r++;
  setCalcLabel(r, "Total Disch Days"); setCalcFormula(r, `${B(R_HDD)}+${B(R_VDD)}+${B(R_LDD)}`, c_tdisch); const R_TDISCH = r; r++;
  setCalcLabel(r, "Total Idle Days"); setCalcFormula(r, `${B(R_HID)}+${B(R_VID)}+${B(R_LID)}`, c_tidle); const R_TIDLE = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 4: BUNKER CONSUMPTION (FORMULAS)
  // ═══════════════════════════════════════════════════════

  setSubSectionHeader(r, "BUNKER CONSUMPTION"); r++;

  // --- Sea Consumption ---
  setSubSectionHeader(r, "Sea Consumption"); r++;

  setCalcLabel(r, "HSFO Sea (mt)");
  setCalcFormula(r,
    `IF(${scrCell}=1,(${B(R_NECAB_D)}*${hBal}+${B(R_NECAL_D)}*${hLad}+${xSeaCell}*${hLad})*${rfCell},0)`,
    sv_hsfoSea);
  const R_HSFO_SEA = r; r++;

  setCalcLabel(r, "VLSFO Sea (mt)");
  setCalcFormula(r,
    `IF(${scrCell}=0,(${B(R_NECAB_D)}*${vBal}+${B(R_NECAL_D)}*${vLad}+${xSeaCell}*${vLad})*${rfCell},0)`,
    sv_vlsfoSea);
  const R_VLSFO_SEA = r; r++;

  setCalcLabel(r, "LSMGO Sea ECA (mt)");
  setCalcFormula(r,
    `(${B(R_ECAB_D)}*${lBal}+${B(R_ECAL_D)}*${lLad})*${rfCell}`,
    sv_lsmgoSea);
  const R_LSMGO_SEA = r; r++;
  r++;

  // --- Port Consumption ---
  setSubSectionHeader(r, "Port Consumption"); r++;

  setCalcLabel(r, "HSFO Loading (mt)"); setCalcFormula(r, `${B(R_HLD)}*${hLoad}`, sv_hLoad); const R_HL = r; r++;
  setCalcLabel(r, "HSFO Disch (mt)"); setCalcFormula(r, `${B(R_HDD)}*${hDisch}`, sv_hDisch); const R_HD = r; r++;
  setCalcLabel(r, "HSFO Idle (mt)");
  setCalcFormula(r, `(${B(R_HID)}+IF(${scrCell}=1,${xPortCell},0))*${hIdle}`, sv_hIdle);
  const R_HI = r; r++;
  setCalcLabel(r, "HSFO Canal (mt)");
  setCalcFormula(r, `IF(${scrCell}=1,${xCanalCell}*${hCanal},0)`, sv_hCanal);
  const R_HC = r; r++;

  setCalcLabel(r, "VLSFO Loading (mt)"); setCalcFormula(r, `${B(R_VLD)}*${vLoad}`, sv_vLoad); const R_VL = r; r++;
  setCalcLabel(r, "VLSFO Disch (mt)"); setCalcFormula(r, `${B(R_VDD)}*${vDisch}`, sv_vDisch); const R_VD = r; r++;
  setCalcLabel(r, "VLSFO Idle (mt)");
  setCalcFormula(r, `(${B(R_VID)}+IF(${scrCell}=0,${xPortCell},0))*${vIdle}`, sv_vIdle);
  const R_VI = r; r++;
  setCalcLabel(r, "VLSFO Canal (mt)");
  setCalcFormula(r, `IF(${scrCell}=0,${xCanalCell}*${vCanal},0)`, sv_vCanal);
  const R_VC = r; r++;

  setCalcLabel(r, "LSMGO Loading (mt)"); setCalcFormula(r, `${B(R_LLD)}*${lLoad}`, sv_lLoad); const R_LL = r; r++;
  setCalcLabel(r, "LSMGO Disch (mt)"); setCalcFormula(r, `${B(R_LDD)}*${lDisch}`, sv_lDisch); const R_LD = r; r++;
  setCalcLabel(r, "LSMGO Idle (mt)"); setCalcFormula(r, `${B(R_LID)}*${lIdle}`, sv_lIdle); const R_LI = r; r++;
  setCalcLabel(r, "LSMGO Canal (mt)"); setCalcFormula(r, `0`, 0); const R_LC = r; r++;
  r++;

  // --- AE Consumption (always LSMGO) ---
  setSubSectionHeader(r, "AE Consumption (→ LSMGO)"); r++;

  setCalcLabel(r, "AE Sea (mt)");
  setCalcFormula(r,
    `(${B(R_SBAL)}*(${aeBal})+${B(R_SLAD)}*(${aeLad})+${xSeaCell}*(${aeLad}))*${rfCell}`, sv_aeSea);
  const R_AES = r; r++;

  setCalcLabel(r, "AE Port (mt)");
  setCalcFormula(r,
    `${B(R_TLOAD)}*(${aeLoad})+${B(R_TDISCH)}*(${aeDisch})+(${B(R_TIDLE)}+${xPortCell})*(${aeIdle})`, sv_aePort);
  const R_AEP = r; r++;

  setCalcLabel(r, "AE Total (mt)");
  setCalcFormula(r, `${B(R_AES)}+${B(R_AEP)}`, sv_aeTotal);
  const R_AET = r; r++;
  r++;

  // --- TOTAL FUEL CONSUMPTION ---
  setSubSectionHeader(r, "TOTAL FUEL CONSUMPTION"); r++;

  setCalcLabel(r, "HSFO Total (mt)", true);
  setCalcFormula(r, `${B(R_HSFO_SEA)}+${B(R_HL)}+${B(R_HD)}+${B(R_HI)}+${B(R_HC)}`, results.hsfoConsumption, true);
  const R_HSFOT = r; r++;

  setCalcLabel(r, "VLSFO Total (mt)", true);
  setCalcFormula(r, `${B(R_VLSFO_SEA)}+${B(R_VL)}+${B(R_VD)}+${B(R_VI)}+${B(R_VC)}`, results.vlsfoConsumption, true);
  const R_VLSFOT = r; r++;

  setCalcLabel(r, "LSMGO Total (mt)", true);
  setCalcFormula(r, `${B(R_LSMGO_SEA)}+${B(R_LL)}+${B(R_LD)}+${B(R_LI)}+${B(R_LC)}+${B(R_AET)}`, results.lsmgoConsumption, true);
  const R_LSMGOT = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 5: BUNKER COST
  // ═══════════════════════════════════════════════════════

  setSubSectionHeader(r, "BUNKER COST"); r++;

  setCalcLabel(r, "HSFO Cost ($)");
  setCalcFormula(r, `${B(R_HSFOT)}*${B(R_HP)}`, results.hsfoConsumption * bunker.hsfo.price);
  const R_HCOST = r; r++;

  setCalcLabel(r, "VLSFO Cost ($)");
  setCalcFormula(r, `${B(R_VLSFOT)}*${B(R_VP)}`, results.vlsfoConsumption * bunker.vlsfo.price);
  const R_VCOST = r; r++;

  setCalcLabel(r, "LSMGO Cost ($)");
  setCalcFormula(r, `${B(R_LSMGOT)}*${B(R_LP)}`, results.lsmgoConsumption * bunker.lsmgo.price);
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
  setCalcFormula(r, `IF(${B(R_RTYPE)}="lumpsum",${B(R_RATE)},${B(R_RATE)}*${B(R_QTY)})`, results.grossFreight);
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

  setCalcLabel(r, "Voyage Costs excl Hire ($)", true);
  setCalcFormula(r, `${B(R_BUNKC)}+${B(R_PCOST)}+${B(R_MISCT)}+${B(R_CANALT)}`, results.voyageCostExclHire, true);
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
  setCalcFormula(r, `${B(R_NF)}-${B(R_VCEXH)}+${B(R_DEM)}-${B(R_DESP)}`, results.grossProfit, false, true);
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
  // SECTION 8: ENVIRONMENTAL
  // ═══════════════════════════════════════════════════════

  setSectionHeader(r, "ENVIRONMENTAL & EMISSIONS"); r++;
  setText(0, r, "", S.envLabel);
  ws[cellRef(1, r)] = { t: "s", v: "Excel Formula", s: S.colHeaderFormula };
  ws[cellRef(2, r)] = { t: "s", v: "Software Value", s: S.colHeaderSoftware };
  r++;

  // CO₂ emission factors
  setCalcLabel(r, "CO₂ Factor HSFO (t/t)", false, false, true); setNum(1, r, 3.114, S.envFormula); const R_CFH = r; r++;
  setCalcLabel(r, "CO₂ Factor VLSFO (t/t)", false, false, true); setNum(1, r, 3.151, S.envFormula); const R_CFV = r; r++;
  setCalcLabel(r, "CO₂ Factor LSMGO (t/t)", false, false, true); setNum(1, r, 3.206, S.envFormula); const R_CFL = r; r++;
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

  // EU ETS
  setSubSectionHeader(r, "EU ETS"); r++;
  setCalcLabel(r, "Chargeable CO₂ EUA (mt)", false, false, true); setNum(1, r, results.chargeableCo2, S.envFormula); setNum(2, r, results.chargeableCo2, S.envSoftware); const R_CHCO2 = r; r++;
  setCalcLabel(r, "ETS Coverage (%)", false, false, true); setNum(1, r, results.etsVoyageCoverage * 100, S.envFormula); setNum(2, r, results.etsVoyageCoverage * 100, S.envSoftware); r++;
  setCalcLabel(r, "ETS Phase-in (%)", false, false, true); setNum(1, r, results.etsPhaseIn * 100, S.envFormula); setNum(2, r, results.etsPhaseIn * 100, S.envSoftware); r++;

  setCalcLabel(r, "EUA CO₂ Cost ($)", false, false, true);
  setCalcFormula(r, `${B(R_CHCO2)}*${B(R_CO2P)}`, results.euaCo2Cost, false, false, true);
  const R_EUACOST = r; r++;

  setCalcLabel(r, "EUA Freight Impact ($/mt)", false, false, true);
  setCalcFormula(r, `IF(${B(R_QTY)}>0,${B(R_EUACOST)}/${B(R_QTY)},0)`, results.euaFreightImpact, false, false, true);
  r++;
  r++;

  // FuelEU Maritime
  setSubSectionHeader(r, "FuelEU Maritime"); r++;
  setCalcLabel(r, "GHG Intensity Target (gCO₂eq/MJ)", false, false, true); setNum(1, r, results.fuelEuResult.target, S.envFormula); setNum(2, r, results.fuelEuResult.target, S.envSoftware); r++;
  setCalcLabel(r, "HSFO Penalty ($)", false, false, true); setNum(1, r, results.fuelEuResult.fuels.hsfo.penalty, S.envFormula); setNum(2, r, results.fuelEuResult.fuels.hsfo.penalty, S.envSoftware); const R_FEH = r; r++;
  setCalcLabel(r, "VLSFO Penalty ($)", false, false, true); setNum(1, r, results.fuelEuResult.fuels.vlsfo.penalty, S.envFormula); setNum(2, r, results.fuelEuResult.fuels.vlsfo.penalty, S.envSoftware); const R_FEV = r; r++;
  setCalcLabel(r, "LSMGO Penalty ($)", false, false, true); setNum(1, r, results.fuelEuResult.fuels.lsmgo.penalty, S.envFormula); setNum(2, r, results.fuelEuResult.fuels.lsmgo.penalty, S.envSoftware); const R_FEL = r; r++;
  setCalcLabel(r, "FuelEU Total Penalty ($)", true);
  setCalcFormula(r, `${B(R_FEH)}+${B(R_FEV)}+${B(R_FEL)}`, results.fuelEuTotalPenalty, true);
  r++;

  // ═══════════════════════════════════════════════════════
  // FINALIZE WORKSHEET
  // ═══════════════════════════════════════════════════════

  // Set sheet range
  ws["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 31, r: r } });

  // Column widths
  ws["!cols"] = [
    { wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 8 }, { wch: 8 },
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
    { wch: 11 }, { wch: 11 }, { wch: 11 },
  ];

  // Freeze panes — freeze first column for labels
  ws["!freeze"] = { xSplit: 1, ySplit: 0 };

  XLSX.utils.book_append_sheet(wb, ws, "Voyage Calculation");

  const vesselName = vessel.name || "Voyage";
  const fileName = `${vesselName}_Estimate_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
