import * as XLSX from "xlsx";
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
  const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
  const hasScrubber = vessel.hasScrubber === true;

  // ---- Cell writing helpers ----
  function setText(c: number, r: number, v: string) {
    ws[cellRef(c, r)] = { t: "s", v };
  }
  function setNum(c: number, r: number, v: number) {
    ws[cellRef(c, r)] = { t: "n", v };
  }
  function setFormula(c: number, r: number, f: string, v: number) {
    ws[cellRef(c, r)] = { t: "n", f, v };
  }

  let r = 1; // current row (1-indexed for Excel)

  // ═══════════════════════════════════════════════════════
  // SECTION 1: ALL MANUAL INPUTS
  // ═══════════════════════════════════════════════════════

  setText(0, r, "VOYAGE ESTIMATION — FORMULA WORKBOOK"); r++;
  setText(0, r, "Generated"); setText(1, r, new Date().toLocaleString()); r++;
  r++;

  // --- VESSEL ---
  setText(0, r, "═══ VESSEL ═══"); r++;
  setText(0, r, "Vessel Name"); setText(1, r, vessel.name); r++;
  setText(0, r, "DWT"); setNum(1, r, vessel.dwt); const R_DWT = r; r++;
  setText(0, r, "GT"); setNum(1, r, vessel.gt); r++;
  setText(0, r, "Scrubber (1=Yes, 0=No)"); setNum(1, r, hasScrubber ? 1 : 0); const R_SCR = r; r++;
  setText(0, r, "Speed Ballast (kn)"); setNum(1, r, profile.speed.ballast); r++;
  setText(0, r, "Speed Laden (kn)"); setNum(1, r, profile.speed.laden); r++;
  r++;

  // --- CONSUMPTION MATRIX ---
  setText(0, r, "═══ CONSUMPTION RATES (TPD) ═══"); r++;
  const rateColNames = ["Ballast", "Laden", "Load", "Disch", "Idle", "Canal"];
  rateColNames.forEach((h, i) => setText(i + 1, r, h)); r++;

  const R_HSFO = r;
  setText(0, r, "HSFO");
  [profile.hsfo.ballast, profile.hsfo.laden, profile.hsfo.load, profile.hsfo.discharge, profile.hsfo.idle, profile.hsfo.canal]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;

  const R_VLSFO = r;
  setText(0, r, "VLSFO");
  [profile.vlsfo.ballast, profile.vlsfo.laden, profile.vlsfo.load, profile.vlsfo.discharge, profile.vlsfo.idle, profile.vlsfo.canal]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;

  const R_LSMGO = r;
  setText(0, r, "LSMGO");
  [profile.lsmgo.ballast, profile.lsmgo.laden, profile.lsmgo.load, profile.lsmgo.discharge, profile.lsmgo.idle, profile.lsmgo.canal]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;

  const R_AE = r;
  setText(0, r, "AE");
  [profile.ae.ballast, profile.ae.laden, profile.ae.load, profile.ae.discharge, profile.ae.idle]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;

  const R_AESCR = r;
  setText(0, r, "AE+Scrubber");
  [profile.aeScrubber?.ballast || 0, profile.aeScrubber?.laden || 0, profile.aeScrubber?.load || 0, profile.aeScrubber?.discharge || 0, profile.aeScrubber?.idle || 0]
    .forEach((v, i) => setNum(i + 1, r, v || 0)); r++;
  r++;

  // --- CARGO ---
  setText(0, r, "═══ CARGO ═══"); r++;
  setText(0, r, "Rate"); setNum(1, r, cargo.rate); const R_RATE = r; r++;
  setText(0, r, "Rate Type"); setText(1, r, cargo.rateType); const R_RTYPE = r; r++;
  setText(0, r, "Quantity (MT)"); setNum(1, r, cargo.quantity); const R_QTY = r; r++;
  setText(0, r, "Voyage Comm (%)"); setNum(1, r, cargo.voyageCommission); const R_VCOMM = r; r++;
  setText(0, r, "TC Comm (%)"); setNum(1, r, cargo.tcCommission); const R_TCOMM = r; r++;
  setText(0, r, "Demurrage ($)"); setNum(1, r, cargo.demurrageAmount); const R_DEM = r; r++;
  setText(0, r, "Despatch ($)"); setNum(1, r, cargo.despatchAmount); const R_DESP = r; r++;
  r++;

  // --- BUNKER PRICES ---
  setText(0, r, "═══ BUNKER PRICES ═══"); r++;
  setText(0, r, "HSFO Price ($/mt)"); setNum(1, r, bunker.hsfo.price); const R_HP = r; r++;
  setText(0, r, "VLSFO Price ($/mt)"); setNum(1, r, bunker.vlsfo.price); const R_VP = r; r++;
  setText(0, r, "LSMGO Price ($/mt)"); setNum(1, r, bunker.lsmgo.price); const R_LP = r; r++;
  setText(0, r, "CO₂ Price ($/mt)"); setNum(1, r, bunker.co2Price); const R_CO2P = r; r++;
  setText(0, r, "Reward Factor"); setNum(1, r, bunker.rewardFactor); const R_RF = r; r++;
  r++;

  // --- HIRE ---
  setText(0, r, "═══ HIRE ═══"); r++;
  setText(0, r, "Daily Hire Rate ($/day)"); setNum(1, r, hireRate); const R_HIRE = r; r++;
  setText(0, r, "Net BB ($)"); setNum(1, r, netBB); const R_BB = r; r++;
  r++;

  // --- MISC ---
  setText(0, r, "═══ MISC COSTS ═══"); r++;
  setText(0, r, "Misc Cost ($)"); setNum(1, r, misc.miscCost); const R_MISC = r; r++;
  setText(0, r, "Extra Fees ($)"); setNum(1, r, misc.extraFees); const R_XFEE = r; r++;
  setText(0, r, "Extra Insurance ($)"); setNum(1, r, misc.extraInsurance); const R_XINS = r; r++;
  setText(0, r, "Canal Cost 1 ($)"); setNum(1, r, misc.canalCost1); const R_CC1 = r; r++;
  setText(0, r, "Canal Cost 2 ($)"); setNum(1, r, misc.canalCost2); const R_CC2 = r; r++;
  r++;

  // --- EXTRA TIME ---
  setText(0, r, "═══ EXTRA TIME ═══"); r++;
  setText(0, r, "Extra Sea Days"); setNum(1, r, results.extraSeaDays); const R_XSEA = r; r++;
  setText(0, r, "Extra Port Days"); setNum(1, r, results.extraPortDays); const R_XPORT = r; r++;
  setText(0, r, "Extra Canal Days"); setNum(1, r, results.extraCanalDays); const R_XCANAL = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 2: SEQUENCE TABLE (with formula helper columns)
  // ═══════════════════════════════════════════════════════

  setText(0, r, "═══ SEQUENCE ═══"); r++;

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

  // Headers
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
  seqHeaders.forEach((h, i) => setText(i, r, h));
  r++;

  // Pre-compute isLaden flags (stateful — cannot be done with pure Excel formulas)
  const ladenFlags: boolean[] = [];
  let isLaden = false;
  sequence.forEach((leg) => {
    ladenFlags.push(isLaden);
    const op = leg.operation || "";
    if (op === "load" || op === "loading") isLaden = true;
    else if (op === "disch" || op === "discharging") isLaden = false;
  });

  const seqStartRow = r;
  sequence.forEach((leg, idx) => {
    const rr = r + idx;
    const op = leg.operation || "";
    const portFuel = (leg as any).portFuelType || (hasScrubber ? "hsfo" : "vlsfo");
    const seaTime = leg.seaTime || 0;
    const ecaTime = leg.ecaTime || 0;
    const portDays = leg.calculatedPortDays || 0;
    const turnExtraH = (leg.turnTime || 0) + (leg.extraTime || 0);
    const isLadenLeg = ladenFlags[idx];

    // --- Data columns (inputs) ---
    setNum(SC.ID, rr, leg.id);
    setText(SC.OP, rr, op);
    setText(SC.PORT, rr, leg.port);
    setNum(SC.DIST, rr, leg.distance);
    setNum(SC.ECAD, rr, leg.ecaDistance);
    setNum(SC.SEAT, rr, seaTime);
    setNum(SC.ECAT, rr, ecaTime);
    setNum(SC.PORTD, rr, portDays);
    setNum(SC.TURNH, rr, turnExtraH);
    setNum(SC.DA, rr, leg.expDa);
    setNum(SC.LADEN, rr, isLadenLeg ? 1 : 0);
    setText(SC.PFUEL, rr, portFuel);

    // --- Formula columns ---
    const c = (cn: number) => cellRef(cn, rr);

    // NonECA Time = SeaTime - ECA Time
    setFormula(SC.NECAT, rr, `${c(SC.SEAT)}-${c(SC.ECAT)}`, seaTime - ecaTime);

    // Working Days = MAX(0, PortDays - TurnHours/24)
    const wd = Math.max(0, portDays - turnExtraH / 24);
    setFormula(SC.WDAYS, rr, `MAX(0,${c(SC.PORTD)}-${c(SC.TURNH)}/24)`, wd);

    // Idle Days: for load/disch = turnExtra time; for idle/waiting/bunkering/other = all port days
    const isLoadDisch = op === "load" || op === "loading" || op === "disch" || op === "discharging";
    const idleVal = isLoadDisch ? portDays - wd : portDays;
    setFormula(SC.IDAYS, rr,
      `IF(OR(${c(SC.OP)}="load",${c(SC.OP)}="loading",${c(SC.OP)}="disch",${c(SC.OP)}="discharging"),${c(SC.PORTD)}-${c(SC.WDAYS)},${c(SC.PORTD)})`,
      idleVal);

    // Ballast/Laden sea time split
    setFormula(SC.BSEA, rr, `IF(${c(SC.LADEN)}=0,${c(SC.SEAT)},0)`, isLadenLeg ? 0 : seaTime);
    setFormula(SC.LSEA, rr, `IF(${c(SC.LADEN)}=1,${c(SC.SEAT)},0)`, isLadenLeg ? seaTime : 0);
    setFormula(SC.ECAB, rr, `IF(${c(SC.LADEN)}=0,${c(SC.ECAT)},0)`, isLadenLeg ? 0 : ecaTime);
    setFormula(SC.ECAL, rr, `IF(${c(SC.LADEN)}=1,${c(SC.ECAT)},0)`, isLadenLeg ? ecaTime : 0);
    setFormula(SC.NECAB, rr, `IF(${c(SC.LADEN)}=0,${c(SC.NECAT)},0)`, isLadenLeg ? 0 : (seaTime - ecaTime));
    setFormula(SC.NECAL, rr, `IF(${c(SC.LADEN)}=1,${c(SC.NECAT)},0)`, isLadenLeg ? (seaTime - ecaTime) : 0);

    // Is Load / Is Disch flags
    const isLoad = op === "load" || op === "loading";
    const isDisch = op === "disch" || op === "discharging";
    setFormula(SC.ISLD, rr, `IF(OR(${c(SC.OP)}="load",${c(SC.OP)}="loading"),1,0)`, isLoad ? 1 : 0);
    setFormula(SC.ISDC, rr, `IF(OR(${c(SC.OP)}="disch",${c(SC.OP)}="discharging"),1,0)`, isDisch ? 1 : 0);

    // Port fuel type split — loading days
    setFormula(SC.HLD, rr, `IF(AND(${c(SC.ISLD)}=1,${c(SC.PFUEL)}="hsfo"),${c(SC.WDAYS)},0)`,
      (isLoad && portFuel === "hsfo") ? wd : 0);
    setFormula(SC.VLD, rr, `IF(AND(${c(SC.ISLD)}=1,${c(SC.PFUEL)}="vlsfo"),${c(SC.WDAYS)},0)`,
      (isLoad && portFuel === "vlsfo") ? wd : 0);
    setFormula(SC.LLD, rr, `IF(AND(${c(SC.ISLD)}=1,${c(SC.PFUEL)}="lsmgo"),${c(SC.WDAYS)},0)`,
      (isLoad && portFuel === "lsmgo") ? wd : 0);

    // Disch days by fuel
    setFormula(SC.HDD, rr, `IF(AND(${c(SC.ISDC)}=1,${c(SC.PFUEL)}="hsfo"),${c(SC.WDAYS)},0)`,
      (isDisch && portFuel === "hsfo") ? wd : 0);
    setFormula(SC.VDD, rr, `IF(AND(${c(SC.ISDC)}=1,${c(SC.PFUEL)}="vlsfo"),${c(SC.WDAYS)},0)`,
      (isDisch && portFuel === "vlsfo") ? wd : 0);
    setFormula(SC.LDD, rr, `IF(AND(${c(SC.ISDC)}=1,${c(SC.PFUEL)}="lsmgo"),${c(SC.WDAYS)},0)`,
      (isDisch && portFuel === "lsmgo") ? wd : 0);

    // Idle days by fuel
    setFormula(SC.HID, rr, `IF(${c(SC.PFUEL)}="hsfo",${c(SC.IDAYS)},0)`,
      portFuel === "hsfo" ? idleVal : 0);
    setFormula(SC.VID, rr, `IF(${c(SC.PFUEL)}="vlsfo",${c(SC.IDAYS)},0)`,
      portFuel === "vlsfo" ? idleVal : 0);
    setFormula(SC.LID, rr, `IF(${c(SC.PFUEL)}="lsmgo",${c(SC.IDAYS)},0)`,
      portFuel === "lsmgo" ? idleVal : 0);
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

  setText(0, r, "══════════════════════════════════════════════"); r++;
  setText(0, r, "CALCULATIONS (ALL EXCEL FORMULAS BELOW)"); r++;
  r++;

  // --- TIME & DISTANCE ---
  setText(0, r, "═══ TIME & DISTANCE ═══"); r++;

  setText(0, r, "Total Distance (nm)");
  setFormula(1, r, `SUM(${seqRange(SC.DIST)})`, results.totalDistance);
  const R_TOTDIST = r; r++;

  setText(0, r, "Total ECA Distance (nm)");
  setFormula(1, r, `SUM(${seqRange(SC.ECAD)})`, results.totalEcaDistance);
  const R_ECADIST = r; r++;

  setText(0, r, "Non-ECA Distance (nm)");
  setFormula(1, r, `${B(R_TOTDIST)}-${B(R_ECADIST)}`, results.nonEcaDistance);
  r++;

  setText(0, r, "Laden Distance (nm)");
  setFormula(1, r, `SUMPRODUCT(${seqRange(SC.LADEN)},${seqRange(SC.DIST)})`, results.ladenDistance);
  const R_LADIST = r; r++;

  setText(0, r, "Sea Days Ballast");
  setFormula(1, r, `SUM(${seqRange(SC.BSEA)})`, results.seaDaysBallast);
  const R_SBAL = r; r++;

  setText(0, r, "Sea Days Laden");
  setFormula(1, r, `SUM(${seqRange(SC.LSEA)})`, results.seaDaysLaden);
  const R_SLAD = r; r++;

  setText(0, r, "Total Port Days");
  setFormula(1, r, `SUM(${seqRange(SC.PORTD)})`, results.totalPortDays);
  const R_TPORT = r; r++;

  setText(0, r, "Port Costs ($)");
  setFormula(1, r, `SUM(${seqRange(SC.DA)})`, results.portCosts);
  const R_PCOST = r; r++;

  setText(0, r, "Total Sea Days");
  setFormula(1, r, `${B(R_SBAL)}+${B(R_SLAD)}+${xSeaCell}`, results.totalSeaDays);
  const R_TSEA = r; r++;

  setText(0, r, "TOTAL VOYAGE DAYS");
  setFormula(1, r, `${B(R_TSEA)}+${B(R_TPORT)}+${xPortCell}+${xCanalCell}`, results.totalVoyageDays);
  const R_TVOY = r; r++;
  r++;

  // ECA/NonECA sea time breakdown
  setText(0, r, "ECA Sea Bal Days");
  setFormula(1, r, `SUM(${seqRange(SC.ECAB)})`, 0);
  const R_ECAB_D = r; r++;

  setText(0, r, "ECA Sea Lad Days");
  setFormula(1, r, `SUM(${seqRange(SC.ECAL)})`, 0);
  const R_ECAL_D = r; r++;

  setText(0, r, "NonECA Sea Bal Days");
  setFormula(1, r, `SUM(${seqRange(SC.NECAB)})`, 0);
  const R_NECAB_D = r; r++;

  setText(0, r, "NonECA Sea Lad Days");
  setFormula(1, r, `SUM(${seqRange(SC.NECAL)})`, 0);
  const R_NECAL_D = r; r++;
  r++;

  // --- PORT TIME AGGREGATES ---
  setText(0, r, "═══ PORT TIME BY FUEL TYPE ═══"); r++;

  setText(0, r, "Loading Days (HSFO)"); setFormula(1, r, `SUM(${seqRange(SC.HLD)})`, 0); const R_HLD = r; r++;
  setText(0, r, "Loading Days (VLSFO)"); setFormula(1, r, `SUM(${seqRange(SC.VLD)})`, 0); const R_VLD = r; r++;
  setText(0, r, "Loading Days (LSMGO)"); setFormula(1, r, `SUM(${seqRange(SC.LLD)})`, 0); const R_LLD = r; r++;
  setText(0, r, "Disch Days (HSFO)"); setFormula(1, r, `SUM(${seqRange(SC.HDD)})`, 0); const R_HDD = r; r++;
  setText(0, r, "Disch Days (VLSFO)"); setFormula(1, r, `SUM(${seqRange(SC.VDD)})`, 0); const R_VDD = r; r++;
  setText(0, r, "Disch Days (LSMGO)"); setFormula(1, r, `SUM(${seqRange(SC.LDD)})`, 0); const R_LDD = r; r++;
  setText(0, r, "Idle Days (HSFO)"); setFormula(1, r, `SUM(${seqRange(SC.HID)})`, 0); const R_HID = r; r++;
  setText(0, r, "Idle Days (VLSFO)"); setFormula(1, r, `SUM(${seqRange(SC.VID)})`, 0); const R_VID = r; r++;
  setText(0, r, "Idle Days (LSMGO)"); setFormula(1, r, `SUM(${seqRange(SC.LID)})`, 0); const R_LID = r; r++;

  // Total loading/disch/idle (all fuels)
  setText(0, r, "Total Loading Days"); setFormula(1, r, `${B(R_HLD)}+${B(R_VLD)}+${B(R_LLD)}`, 0); const R_TLOAD = r; r++;
  setText(0, r, "Total Disch Days"); setFormula(1, r, `${B(R_HDD)}+${B(R_VDD)}+${B(R_LDD)}`, 0); const R_TDISCH = r; r++;
  setText(0, r, "Total Idle Days"); setFormula(1, r, `${B(R_HID)}+${B(R_VID)}+${B(R_LID)}`, 0); const R_TIDLE = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 4: BUNKER CONSUMPTION (FORMULAS)
  // ═══════════════════════════════════════════════════════

  setText(0, r, "═══ BUNKER CONSUMPTION ═══"); r++;

  // --- Sea Consumption ---
  setText(0, r, "--- Sea Consumption ---"); r++;

  // HSFO Sea = IF(scrubber, (NonECA_Bal×Rate + NonECA_Lad×Rate + ExtraSea×LadenRate) × RF, 0)
  setText(0, r, "HSFO Sea (mt)");
  setFormula(1, r,
    `IF(${scrCell}=1,(${B(R_NECAB_D)}*${hBal}+${B(R_NECAL_D)}*${hLad}+${xSeaCell}*${hLad})*${rfCell},0)`,
    results.nonEcaFuel.hsfo);
  const R_HSFO_SEA = r; r++;

  // VLSFO Sea = IF(NO scrubber, same logic with VLSFO rates)
  setText(0, r, "VLSFO Sea (mt)");
  setFormula(1, r,
    `IF(${scrCell}=0,(${B(R_NECAB_D)}*${vBal}+${B(R_NECAL_D)}*${vLad}+${xSeaCell}*${vLad})*${rfCell},0)`,
    results.nonEcaFuel.vlsfo);
  const R_VLSFO_SEA = r; r++;

  // LSMGO Sea (ECA only) = (ECA_Bal×LSMGO_Bal + ECA_Lad×LSMGO_Lad) × RF
  setText(0, r, "LSMGO Sea ECA (mt)");
  setFormula(1, r,
    `(${B(R_ECAB_D)}*${lBal}+${B(R_ECAL_D)}*${lLad})*${rfCell}`,
    results.ecaFuel.lsmgo);
  const R_LSMGO_SEA = r; r++;
  r++;

  // --- Port Consumption ---
  setText(0, r, "--- Port Consumption ---"); r++;

  // HSFO port
  setText(0, r, "HSFO Loading (mt)"); setFormula(1, r, `${B(R_HLD)}*${hLoad}`, 0); const R_HL = r; r++;
  setText(0, r, "HSFO Disch (mt)"); setFormula(1, r, `${B(R_HDD)}*${hDisch}`, 0); const R_HD = r; r++;
  setText(0, r, "HSFO Idle (mt)");
  setFormula(1, r, `(${B(R_HID)}+IF(${scrCell}=1,${xPortCell},0))*${hIdle}`, 0);
  const R_HI = r; r++;
  setText(0, r, "HSFO Canal (mt)");
  setFormula(1, r, `IF(${scrCell}=1,${xCanalCell}*${hCanal},0)`, 0);
  const R_HC = r; r++;

  // VLSFO port
  setText(0, r, "VLSFO Loading (mt)"); setFormula(1, r, `${B(R_VLD)}*${vLoad}`, 0); const R_VL = r; r++;
  setText(0, r, "VLSFO Disch (mt)"); setFormula(1, r, `${B(R_VDD)}*${vDisch}`, 0); const R_VD = r; r++;
  setText(0, r, "VLSFO Idle (mt)");
  setFormula(1, r, `(${B(R_VID)}+IF(${scrCell}=0,${xPortCell},0))*${vIdle}`, 0);
  const R_VI = r; r++;
  setText(0, r, "VLSFO Canal (mt)");
  setFormula(1, r, `IF(${scrCell}=0,${xCanalCell}*${vCanal},0)`, 0);
  const R_VC = r; r++;

  // LSMGO port
  setText(0, r, "LSMGO Loading (mt)"); setFormula(1, r, `${B(R_LLD)}*${lLoad}`, 0); const R_LL = r; r++;
  setText(0, r, "LSMGO Disch (mt)"); setFormula(1, r, `${B(R_LDD)}*${lDisch}`, 0); const R_LD = r; r++;
  setText(0, r, "LSMGO Idle (mt)"); setFormula(1, r, `${B(R_LID)}*${lIdle}`, 0); const R_LI = r; r++;
  setText(0, r, "LSMGO Canal (mt)"); setFormula(1, r, `0`, 0); const R_LC = r; r++;
  r++;

  // --- AE Consumption (always LSMGO) ---
  setText(0, r, "--- AE Consumption (→ LSMGO) ---"); r++;

  // AE Sea = (Bal_Total × AE_Bal + Lad_Total × AE_Lad + ExtraSea × AE_Lad) × RF
  setText(0, r, "AE Sea (mt)");
  setFormula(1, r,
    `(${B(R_SBAL)}*(${aeBal})+${B(R_SLAD)}*(${aeLad})+${xSeaCell}*(${aeLad}))*${rfCell}`, 0);
  const R_AES = r; r++;

  // AE Port = Load_Total × AE_Load + Disch_Total × AE_Disch + (Idle+ExtraPort) × AE_Idle
  setText(0, r, "AE Port (mt)");
  setFormula(1, r,
    `${B(R_TLOAD)}*(${aeLoad})+${B(R_TDISCH)}*(${aeDisch})+(${B(R_TIDLE)}+${xPortCell})*(${aeIdle})`, 0);
  const R_AEP = r; r++;

  setText(0, r, "AE Total (mt)");
  setFormula(1, r, `${B(R_AES)}+${B(R_AEP)}`, 0);
  const R_AET = r; r++;
  r++;

  // --- TOTAL FUEL CONSUMPTION ---
  setText(0, r, "═══ TOTAL FUEL CONSUMPTION ═══"); r++;

  setText(0, r, "HSFO Total (mt)");
  setFormula(1, r, `${B(R_HSFO_SEA)}+${B(R_HL)}+${B(R_HD)}+${B(R_HI)}+${B(R_HC)}`, results.hsfoConsumption);
  const R_HSFOT = r; r++;

  setText(0, r, "VLSFO Total (mt)");
  setFormula(1, r, `${B(R_VLSFO_SEA)}+${B(R_VL)}+${B(R_VD)}+${B(R_VI)}+${B(R_VC)}`, results.vlsfoConsumption);
  const R_VLSFOT = r; r++;

  setText(0, r, "LSMGO Total (mt)");
  setFormula(1, r, `${B(R_LSMGO_SEA)}+${B(R_LL)}+${B(R_LD)}+${B(R_LI)}+${B(R_LC)}+${B(R_AET)}`, results.lsmgoConsumption);
  const R_LSMGOT = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 5: BUNKER COST
  // ═══════════════════════════════════════════════════════

  setText(0, r, "═══ BUNKER COST ═══"); r++;

  setText(0, r, "HSFO Cost ($)");
  setFormula(1, r, `${B(R_HSFOT)}*${B(R_HP)}`, results.hsfoConsumption * bunker.hsfo.price);
  const R_HCOST = r; r++;

  setText(0, r, "VLSFO Cost ($)");
  setFormula(1, r, `${B(R_VLSFOT)}*${B(R_VP)}`, results.vlsfoConsumption * bunker.vlsfo.price);
  const R_VCOST = r; r++;

  setText(0, r, "LSMGO Cost ($)");
  setFormula(1, r, `${B(R_LSMGOT)}*${B(R_LP)}`, results.lsmgoConsumption * bunker.lsmgo.price);
  const R_LCOST = r; r++;

  setText(0, r, "Total Bunker Cost ($)");
  setFormula(1, r, `${B(R_HCOST)}+${B(R_VCOST)}+${B(R_LCOST)}`, results.totalBunkerCost);
  const R_BUNKC = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 6: FINANCIALS
  // ═══════════════════════════════════════════════════════

  setText(0, r, "═══ FINANCIALS ═══"); r++;

  setText(0, r, "Gross Freight ($)");
  setFormula(1, r, `IF(${B(R_RTYPE)}="lumpsum",${B(R_RATE)},${B(R_RATE)}*${B(R_QTY)})`, results.grossFreight);
  const R_GF = r; r++;

  setText(0, r, "Voyage Commission ($)");
  setFormula(1, r, `${B(R_GF)}*${B(R_VCOMM)}/100`, results.voyageCommission);
  const R_VCAMT = r; r++;

  setText(0, r, "Net Freight ($)");
  setFormula(1, r, `${B(R_GF)}-${B(R_VCAMT)}`, results.netFreight);
  const R_NF = r; r++;

  setText(0, r, "Misc Costs ($)");
  setFormula(1, r, `${B(R_MISC)}+${B(R_XFEE)}+${B(R_XINS)}`, results.miscCosts);
  const R_MISCT = r; r++;

  setText(0, r, "Canal Costs ($)");
  setFormula(1, r, `${B(R_CC1)}+${B(R_CC2)}`, results.canalCosts);
  const R_CANALT = r; r++;

  setText(0, r, "Voyage Costs excl Hire ($)");
  setFormula(1, r, `${B(R_BUNKC)}+${B(R_PCOST)}+${B(R_MISCT)}+${B(R_CANALT)}`, results.voyageCostExclHire);
  const R_VCEXH = r; r++;

  setText(0, r, "Hire Cost ($)");
  setFormula(1, r, `${B(R_HIRE)}*${B(R_TVOY)}+${B(R_BB)}`, results.hireCost);
  const R_HIRECOST = r; r++;

  setText(0, r, "Voyage Cost incl Hire ($)");
  setFormula(1, r, `${B(R_VCEXH)}+${B(R_HIRECOST)}`, results.voyageCostInclHire);
  const R_VCINH = r; r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 7: PROFITABILITY
  // ═══════════════════════════════════════════════════════

  setText(0, r, "═══ PROFITABILITY ═══"); r++;

  setText(0, r, "Gross Profit ($)");
  setFormula(1, r, `${B(R_NF)}-${B(R_VCEXH)}+${B(R_DEM)}-${B(R_DESP)}`, results.grossProfit);
  const R_GP = r; r++;

  setText(0, r, "P&L ($)");
  setFormula(1, r, `${B(R_GP)}-${B(R_HIRECOST)}`, results.pAndL);
  r++;

  setText(0, r, "NTCE ($/day)");
  setFormula(1, r, `IF(${B(R_TVOY)}>0,(${B(R_NF)}-${B(R_VCEXH)})/${B(R_TVOY)},0)`, results.ntce);
  const R_NTCE = r; r++;

  setText(0, r, "GTCE ($/day)");
  setFormula(1, r, `IF(${B(R_TCOMM)}<100,${B(R_NTCE)}/(1-${B(R_TCOMM)}/100),0)`, results.gtce);
  const R_GTCE = r; r++;

  setText(0, r, "TCE ($/day)");
  setFormula(1, r, `${B(R_GTCE)}`, results.tce);
  r++;

  setText(0, r, "Gross Rate ($/mt)");
  setFormula(1, r,
    `IF(AND(${B(R_QTY)}>0,${B(R_VCOMM)}<100),(${B(R_VCINH)}/${B(R_QTY)})/(1-${B(R_VCOMM)}/100),0)`,
    results.grossRate);
  r++;
  r++;

  // ═══════════════════════════════════════════════════════
  // SECTION 8: ENVIRONMENTAL
  // ═══════════════════════════════════════════════════════

  setText(0, r, "═══ ENVIRONMENTAL ═══"); r++;

  // CO₂ emission factors
  setText(0, r, "CO₂ Factor HSFO (t/t)"); setNum(1, r, 3.114); const R_CFH = r; r++;
  setText(0, r, "CO₂ Factor VLSFO (t/t)"); setNum(1, r, 3.114); const R_CFV = r; r++;
  setText(0, r, "CO₂ Factor LSMGO (t/t)"); setNum(1, r, 3.206); const R_CFL = r; r++;
  r++;

  setText(0, r, "CO₂ from HSFO (mt)");
  setFormula(1, r, `${B(R_HSFOT)}*${B(R_CFH)}`, results.co2ByFuel.hsfo);
  const R_CO2H = r; r++;

  setText(0, r, "CO₂ from VLSFO (mt)");
  setFormula(1, r, `${B(R_VLSFOT)}*${B(R_CFV)}`, results.co2ByFuel.vlsfo);
  const R_CO2V = r; r++;

  setText(0, r, "CO₂ from LSMGO (mt)");
  setFormula(1, r, `${B(R_LSMGOT)}*${B(R_CFL)}`, results.co2ByFuel.lsmgo);
  const R_CO2L = r; r++;

  setText(0, r, "Total CO₂ (mt)");
  setFormula(1, r, `${B(R_CO2H)}+${B(R_CO2V)}+${B(R_CO2L)}`, results.totalCo2);
  const R_TCO2 = r; r++;
  r++;

  setText(0, r, "CO₂ Ballast (mt)");
  setFormula(1, r, `IF(${B(R_TSEA)}>0,${B(R_TCO2)}*${B(R_SBAL)}/${B(R_TSEA)},0)`, results.co2Ballast);
  r++;

  setText(0, r, "CO₂ Laden (mt)");
  setFormula(1, r, `IF(${B(R_TSEA)}>0,${B(R_TCO2)}*${B(R_SLAD)}/${B(R_TSEA)},0)`, results.co2Laden);
  r++;
  r++;

  // EFOI
  setText(0, r, "EFOI (gCO₂/tnm)");
  setFormula(1, r,
    `IF(AND(${B(R_QTY)}>0,${B(R_LADIST)}>0),${B(R_TCO2)}*1000000/(${B(R_QTY)}*${B(R_LADIST)}),0)`,
    results.efoi);
  r++;

  // CII
  setText(0, r, "CII Actual (gCO₂/dwt-nm)");
  setFormula(1, r,
    `IF(AND(${B(R_DWT)}>0,${B(R_TOTDIST)}>0),${B(R_TCO2)}*1000000/(${B(R_DWT)}*${B(R_TOTDIST)}),0)`,
    results.afrCii);
  r++;

  setText(0, r, "CII Rating"); setText(1, r, results.ciiRating); r++;
  setText(0, r, "Required CII"); setNum(1, r, results.ciiResult.requiredCii); r++;
  setText(0, r, "CII Ratio"); setNum(1, r, results.ciiResult.ciiRatio); r++;
  r++;

  // Total CO₂ Cost
  setText(0, r, "Total CO₂ Cost ($)");
  setFormula(1, r, `${B(R_TCO2)}*${B(R_CO2P)}`, results.totalCo2Cost);
  r++;

  // EU ETS (per-leg coverage is pre-computed — too complex for simple formulas)
  setText(0, r, "Chargeable CO₂ EUA (mt)"); setNum(1, r, results.chargeableCo2); const R_CHCO2 = r; r++;
  setText(0, r, "ETS Coverage (%)"); setNum(1, r, results.etsVoyageCoverage * 100); r++;
  setText(0, r, "ETS Phase-in (%)"); setNum(1, r, results.etsPhaseIn * 100); r++;

  setText(0, r, "EUA CO₂ Cost ($)");
  setFormula(1, r, `${B(R_CHCO2)}*${B(R_CO2P)}`, results.euaCo2Cost);
  const R_EUACOST = r; r++;

  setText(0, r, "EUA Freight Impact ($/mt)");
  setFormula(1, r, `IF(${B(R_QTY)}>0,${B(R_EUACOST)}/${B(R_QTY)},0)`, results.euaFreightImpact);
  r++;
  r++;

  // FuelEU Maritime
  setText(0, r, "═══ FuelEU Maritime ═══"); r++;
  setText(0, r, "GHG Intensity Target (gCO₂eq/MJ)"); setNum(1, r, results.fuelEuResult.target); r++;
  setText(0, r, "HSFO Penalty ($)"); setNum(1, r, results.fuelEuResult.fuels.hsfo.penalty); const R_FEH = r; r++;
  setText(0, r, "VLSFO Penalty ($)"); setNum(1, r, results.fuelEuResult.fuels.vlsfo.penalty); const R_FEV = r; r++;
  setText(0, r, "LSMGO Penalty ($)"); setNum(1, r, results.fuelEuResult.fuels.lsmgo.penalty); const R_FEL = r; r++;
  setText(0, r, "FuelEU Total Penalty ($)");
  setFormula(1, r, `${B(R_FEH)}+${B(R_FEV)}+${B(R_FEL)}`, results.fuelEuTotalPenalty);
  r++;

  // ═══════════════════════════════════════════════════════
  // FINALIZE WORKSHEET
  // ═══════════════════════════════════════════════════════

  // Set sheet range
  ws["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 31, r: r } });

  // Column widths
  ws["!cols"] = [
    { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 8 }, { wch: 8 },
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
    { wch: 11 }, { wch: 11 }, { wch: 11 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Voyage Calculation");

  const vesselName = vessel.name || "Voyage";
  const fileName = `${vesselName}_Estimate_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
