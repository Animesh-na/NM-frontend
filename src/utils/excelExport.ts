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

function fmt(v: number, decimals = 2): number {
  return Number(v.toFixed(decimals));
}

export function exportVoyageToExcel(data: ExportData) {
  const { vessel, sequence, cargos, bunker, misc, hireRate, netBB, results } = data;
  const wb = XLSX.utils.book_new();
  const cargo = cargos[0] || { rate: 0, rateType: "mt", quantity: 0, voyageCommission: 0, tcCommission: 0, demurrageRate: 0, despatchRate: 0, demurrageAmount: 0, despatchAmount: 0, stowageFactor: 0 };
  const profile = vessel.speedProfile === "eco" ? vessel.ecoConsumption : vessel.fullConsumption;
  const hasScrubber = vessel.hasScrubber === true;

  // ====== SHEET 1: SUMMARY ======
  const summaryData = [
    ["VOYAGE ESTIMATION SUMMARY"],
    ["Generated", new Date().toLocaleString()],
    [],
    ["=== VESSEL ==="],
    ["Vessel Name", vessel.name],
    ["Vessel Type", vessel.type],
    ["DWT", vessel.dwt],
    ["GT", vessel.gt],
    ["Cubic Capacity (m³)", vessel.cubic],
    ["Speed Profile", vessel.speedProfile],
    ["Scrubber Fitted", hasScrubber ? "Yes" : "No"],
    ["Eco Speed Ballast (kn)", vessel.ecoConsumption?.speed?.ballast || 0],
    ["Eco Speed Laden (kn)", vessel.ecoConsumption?.speed?.laden || 0],
    ["Full Speed Ballast (kn)", vessel.fullConsumption?.speed?.ballast || 0],
    ["Full Speed Laden (kn)", vessel.fullConsumption?.speed?.laden || 0],
    [],
    ["=== CARGO ==="],
    ["Rate", cargo.rate],
    ["Rate Type", cargo.rateType],
    ["Quantity (MT)", cargo.quantity],
    ["Voyage Commission (%)", cargo.voyageCommission],
    ["TC Commission (%)", cargo.tcCommission],
    ["Demurrage Rate ($/day)", cargo.demurrageRate],
    ["Despatch Rate ($/day)", cargo.despatchRate],
    ["Stowage Factor (m³/mt)", cargo.stowageFactor],
    [],
    ["=== HIRE ==="],
    ["Daily Hire Rate ($/day)", hireRate],
    ["Net Ballast Bonus ($)", netBB],
    [],
    ["=== BUNKER PRICES ==="],
    ["HSFO Price ($/mt)", bunker.hsfo.price],
    ["VLSFO Price ($/mt)", bunker.vlsfo.price],
    ["LSMGO Price ($/mt)", bunker.lsmgo.price],
    ["CO₂ Price ($/mt)", bunker.co2Price],
    ["Reward Factor", bunker.rewardFactor],
    ["HSFO ROB Start (mt)", bunker.hsfo.robStart],
    ["VLSFO ROB Start (mt)", bunker.vlsfo.robStart],
    ["LSMGO ROB Start (mt)", bunker.lsmgo.robStart],
    [],
    ["=== MISC COSTS ==="],
    ["Misc Cost ($)", misc.miscCost],
    ["Extra Fees ($)", misc.extraFees],
    ["Extra Insurance ($)", misc.extraInsurance],
    ["Canal Cost 1 ($)", misc.canalCost1],
    ["Canal Cost 2 ($)", misc.canalCost2],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ====== SHEET 2: SEQUENCE ======
  const seqHeaders = [
    "ID", "Type", "Operation", "Port", "UNLOC",
    "Distance (nm)", "ECA Distance (nm)", "Speed Context", "ECA Speed Context",
    "Sea Margin (%)", "Base Sea Time (d)", "Sea Margin Time (d)", "ECA Time (d)", "Sea Time (d)", "Total Leg Time (d)",
    "Quantity (MT)", "Productivity (MT/d)", "Terms", "Coeff Factor",
    "Turn Time (h)", "Extra Time (h)", "Calc Port Days (d)",
    "Draft (m)", "Cranes", "Exp DA ($)",
    "Port Fuel Type", "Port Max Draft", "UKC %",
    "Bunkering HSFO", "Bunkering VLSFO", "Bunkering LSMGO"
  ];
  const seqRows = sequence.map(row => [
    row.id, row.type, row.operation || "", row.port, row.portUnloc,
    fmt(row.distance), fmt(row.ecaDistance), row.distanceSpeedContext, row.ecaDistanceSpeedContext,
    fmt(row.seaMargin), fmt(row.baseSeaTime, 4), fmt(row.seaMarginTime, 4), fmt(row.ecaTime, 4), fmt(row.seaTime, 4), fmt(row.totalLegTime, 4),
    fmt(row.quantity), fmt(row.productivity), row.terms, fmt(row.coefficientFactor, 2),
    fmt(row.turnTime), fmt(row.extraTime), fmt(row.calculatedPortDays, 4),
    fmt(row.draft, 1), row.cranes, fmt(row.expDa),
    row.portFuelType, fmt(row.portMaxDraft, 1), fmt(row.ukcPercent),
    fmt(row.bunkeringHsfo), fmt(row.bunkeringVlsfo), fmt(row.bunkeringLsmgo)
  ]);
  const wsSeq = XLSX.utils.aoa_to_sheet([seqHeaders, ...seqRows]);
  wsSeq["!cols"] = seqHeaders.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, wsSeq, "Sequence");

  // ====== SHEET 3: TIME & DISTANCE ======
  const timeData = [
    ["TIME & DISTANCE CALCULATIONS"],
    [],
    ["Metric", "Value", "Unit", "Formula"],
    ["Total Distance", fmt(results.totalDistance), "nm", "Σ Leg Distances"],
    ["Total ECA Distance", fmt(results.totalEcaDistance), "nm", "Σ ECA Leg Distances"],
    ["Non-ECA Distance", fmt(results.nonEcaDistance), "nm", "Total - ECA"],
    ["Laden Distance", fmt(results.ladenDistance), "nm", "Σ Laden Leg Distances"],
    [],
    ["Time Ballast (sea)", fmt(results.seaDaysBallast, 4), "days", "Ballast Distance / (Speed × 24)"],
    ["Time Laden (sea)", fmt(results.seaDaysLaden, 4), "days", "Laden Distance / (Speed × 24)"],
    ["Total Sea Days", fmt(results.totalSeaDays, 4), "days", "Ballast + Laden + Extra Sea"],
    ["Total Port Days", fmt(results.totalPortDays, 4), "days", "Σ Port Days"],
    ["Extra Sea Days", fmt(results.extraSeaDays, 4), "days", "From Misc section"],
    ["Extra Port Days", fmt(results.extraPortDays, 4), "days", "From Misc section"],
    ["Extra Canal Days", fmt(results.extraCanalDays, 4), "days", "Canal 1 + Canal 2"],
    ["Base Sea Time", fmt(results.baseSeaTime, 4), "days", "Before sea margin"],
    ["Sea Margin Time", fmt(results.seaMarginTime, 4), "days", "Base × Sea Margin%"],
    ["TOTAL VOYAGE DAYS", fmt(results.totalVoyageDays, 4), "days", "Sea + Port + Extra"],
  ];
  const wsTime = XLSX.utils.aoa_to_sheet(timeData);
  wsTime["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 8 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsTime, "Time & Distance");

  // ====== SHEET 4: CONSUMPTION MATRIX ======
  const matrixData = [
    ["CONSUMPTION RATES (TPD) - " + vessel.speedProfile.toUpperCase() + " PROFILE"],
    [],
    ["Fuel", "Ballast", "Laden", "Load", "Discharge", "Idle", "Canal"],
    ["HSFO", profile.hsfo.ballast, profile.hsfo.laden, profile.hsfo.load, profile.hsfo.discharge, profile.hsfo.idle, profile.hsfo.canal],
    ["VLSFO", profile.vlsfo.ballast, profile.vlsfo.laden, profile.vlsfo.load, profile.vlsfo.discharge, profile.vlsfo.idle, profile.vlsfo.canal],
    ["LSMGO", profile.lsmgo.ballast, profile.lsmgo.laden, profile.lsmgo.load, profile.lsmgo.discharge, profile.lsmgo.idle, profile.lsmgo.canal],
    ["AE", profile.ae.ballast, profile.ae.laden, profile.ae.load, profile.ae.discharge, profile.ae.idle, "N/A"],
    ["AE+Scrubber", profile.aeScrubber?.ballast || 0, profile.aeScrubber?.laden || 0, profile.aeScrubber?.load || 0, profile.aeScrubber?.discharge || 0, profile.aeScrubber?.idle || 0, "N/A"],
    [],
    ["Active AE Profile", hasScrubber ? "AE+Scrubber" : "AE"],
    [],
    ["SPEED (kn)", "Ballast", "Laden"],
    [vessel.speedProfile.toUpperCase(), profile.speed.ballast, profile.speed.laden],
  ];
  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixData);
  wsMatrix["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsMatrix, "Consumption Matrix");

  // ====== SHEET 5: BUNKER CONSUMPTION & COST ======
  const bunkerData = [
    ["BUNKER CONSUMPTION & COST"],
    [],
    ["Fuel Type", "Consumption (mt)", "Price ($/mt)", "Cost ($)"],
    ["HSFO", fmt(results.hsfoConsumption, 4), bunker.hsfo.price, fmt(results.hsfoConsumption * bunker.hsfo.price)],
    ["VLSFO", fmt(results.vlsfoConsumption, 4), bunker.vlsfo.price, fmt(results.vlsfoConsumption * bunker.vlsfo.price)],
    ["LSMGO", fmt(results.lsmgoConsumption, 4), bunker.lsmgo.price, fmt(results.lsmgoConsumption * bunker.lsmgo.price)],
    ["TOTAL", fmt(results.hsfoConsumption + results.vlsfoConsumption + results.lsmgoConsumption, 4), "", fmt(results.totalBunkerCost)],
    [],
    ["=== ECA vs Non-ECA Fuel Breakdown ==="],
    ["", "HSFO (mt)", "VLSFO (mt)", "LSMGO (mt)", "Total (mt)"],
    ["Non-ECA", fmt(results.nonEcaFuel.hsfo, 4), fmt(results.nonEcaFuel.vlsfo, 4), fmt(results.nonEcaFuel.lsmgo, 4), fmt(results.nonEcaFuel.total, 4)],
    ["ECA", fmt(results.ecaFuel.hsfo, 4), fmt(results.ecaFuel.vlsfo, 4), fmt(results.ecaFuel.lsmgo, 4), fmt(results.ecaFuel.total, 4)],
  ];
  const wsBunker = XLSX.utils.aoa_to_sheet(bunkerData);
  wsBunker["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsBunker, "Bunker");

  // ====== SHEET 6: FINANCIAL / ECONOMICS ======
  const finData = [
    ["FINANCIAL CALCULATIONS"],
    [],
    ["Metric", "Value ($)", "Formula"],
    ["Gross Freight", fmt(results.grossFreight), cargo.rateType === "lumpsum" ? "Lumpsum" : `${cargo.rate} × ${cargo.quantity} MT`],
    ["Voyage Commission", fmt(results.voyageCommission), `Gross Freight × ${cargo.voyageCommission}%`],
    ["Net Freight", fmt(results.netFreight), "Gross Freight - Voyage Commission"],
    [],
    ["Port Costs", fmt(results.portCosts), "Σ Expected DA (all ports)"],
    ["Bunker Cost", fmt(results.totalBunkerCost), "(HSFO×Price) + (VLSFO×Price) + (LSMGO×Price)"],
    ["Misc Costs", fmt(results.miscCosts), "Misc + Extra Fees + Extra Insurance"],
    ["Canal Costs", fmt(results.canalCosts), "Canal 1 + Canal 2"],
    ["Total Voyage Costs (excl Hire)", fmt(results.voyageCostExclHire), "Port + Bunker + Misc + Canal"],
    [],
    ["Hire Rate ($/day)", hireRate, ""],
    ["Net BB ($)", netBB, ""],
    ["Hire Cost", fmt(results.hireCost), `${hireRate} × ${fmt(results.totalVoyageDays, 4)} days + Net BB(${netBB})`],
    ["Voyage Cost Incl Hire", fmt(results.voyageCostInclHire), "Voyage Cost Excl Hire + Hire Cost"],
    [],
    ["=== PROFITABILITY ==="],
    ["P&L", fmt(results.pAndL), "Net Freight - Voyage Cost Incl Hire + Dem - Desp"],
    ["TCE ($/day)", fmt(results.tce), "GTCE (see below)"],
    ["NTCE ($/day)", fmt(results.ntce), "(Net Freight - Voyage Costs) / Total Days"],
    ["GTCE ($/day)", fmt(results.gtce), "NTCE / (1 - TC Commission%)"],
    ["Gross Rate ($/mt)", fmt(results.grossRate), "(Voy Cost Incl Hire / Qty) / (1 - Voy Comm%)"],
    [],
    ["Gross Profit", fmt(results.grossProfit), "Net Freight - Voyage Costs + Dem - Desp"],
  ];
  const wsFin = XLSX.utils.aoa_to_sheet(finData);
  wsFin["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsFin, "Financials");

  // ====== SHEET 7: ENVIRONMENTAL ======
  const envData = [
    ["ENVIRONMENTAL METRICS"],
    [],
    ["Metric", "Value", "Unit", "Formula"],
    ["Total CO₂", fmt(results.totalCo2, 4), "mt", "(HSFO×3.114) + (VLSFO×3.151) + (LSMGO×3.206)"],
    ["CO₂ Laden", fmt(results.co2Laden, 4), "mt", "Total CO₂ × (Laden Days / Sea Days)"],
    ["CO₂ Ballast", fmt(results.co2Ballast, 4), "mt", "Total CO₂ × (Ballast Days / Sea Days)"],
    [],
    ["CO₂ from HSFO", fmt(results.co2ByFuel.hsfo, 4), "mt", `${fmt(results.hsfoConsumption, 4)} × 3.114`],
    ["CO₂ from VLSFO", fmt(results.co2ByFuel.vlsfo, 4), "mt", `${fmt(results.vlsfoConsumption, 4)} × 3.151`],
    ["CO₂ from LSMGO", fmt(results.co2ByFuel.lsmgo, 4), "mt", `${fmt(results.lsmgoConsumption, 4)} × 3.206`],
    [],
    ["Non-ECA CO₂", fmt(results.nonEcaCo2, 4), "mt", ""],
    ["ECA CO₂", fmt(results.ecaCo2, 4), "mt", ""],
    [],
    ["EFOI", fmt(results.efoi, 4), "gCO₂/tnm", "Total CO₂ × 1M / (Cargo × Laden Dist)"],
    ["AFR/CII (Actual)", fmt(results.afrCii, 4), "gCO₂/dwt-nm", "Total CO₂ × 1M / (DWT × Total Dist)"],
    ["CII Rating", results.ciiRating, "", "A/B/C/D/E based on IMO thresholds"],
    ["Required CII", fmt(results.ciiResult.requiredCii, 4), "gCO₂/dwt-nm", "IMO reference for vessel type/year"],
    ["CII Ratio", fmt(results.ciiResult.ratio, 4), "", "Actual / Required"],
    [],
    ["=== EU ETS ==="],
    ["Chargeable CO₂", fmt(results.chargeableCo2, 4), "mt", ""],
    ["ETS Voyage Coverage", fmt(results.etsVoyageCoverage * 100), "%", ""],
    ["ETS Phase-in", fmt(results.etsPhaseIn * 100), "%", ""],
    ["ETS Cost", fmt(results.etsCost), "$", `Chargeable CO₂ × CO₂ Price ($${bunker.co2Price})`],
  ];
  const wsEnv = XLSX.utils.aoa_to_sheet(envData);
  wsEnv["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsEnv, "Environmental");

  // Download
  const vesselName = vessel.name || "Voyage";
  const fileName = `${vesselName}_Estimate_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
