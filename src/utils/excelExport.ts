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
    ["Demurrage Amount ($)", cargo.demurrageAmount],
    ["Despatch Amount ($)", cargo.despatchAmount],
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
    ["Time Ballast (sea)", fmt(results.seaDaysBallast, 4), "days", "Σ Ballast Leg Sea Times (with margin)"],
    ["Time Laden (sea)", fmt(results.seaDaysLaden, 4), "days", "Σ Laden Leg Sea Times (with margin)"],
    ["Total Sea Days", fmt(results.totalSeaDays, 4), "days", "Ballast + Laden + Extra Sea"],
    ["Total Port Days", fmt(results.totalPortDays, 4), "days", "Σ Port Days (working + turn + extra)"],
    ["Extra Sea Days", fmt(results.extraSeaDays, 4), "days", "From Misc section"],
    ["Extra Port Days", fmt(results.extraPortDays, 4), "days", "From Misc section"],
    ["Extra Canal Days", fmt(results.extraCanalDays, 4), "days", "Canal 1 + Canal 2"],
    ["Base Sea Time", fmt(results.baseSeaTime, 4), "days", "Σ (Distance / Speed / 24) before margin"],
    ["Sea Margin Time", fmt(results.seaMarginTime, 4), "days", "Σ (Base Sea Time × Sea Margin%)"],
    ["TOTAL VOYAGE DAYS", fmt(results.totalVoyageDays, 4), "days", "Sea + Port + Extra Port + Extra Canal"],
  ];
  const wsTime = XLSX.utils.aoa_to_sheet(timeData);
  wsTime["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 8 }, { wch: 45 }];
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
    ["Scrubber Fitted", hasScrubber ? "Yes (HSFO outside ECA)" : "No (VLSFO outside ECA)"],
    [],
    ["SPEED (kn)", "Ballast", "Laden"],
    [vessel.speedProfile.toUpperCase(), profile.speed.ballast, profile.speed.laden],
  ];
  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixData);
  wsMatrix["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsMatrix, "Consumption Matrix");

  // ====== SHEET 5: BUNKER CONSUMPTION & COST ======
  const totalFuelConsumption = results.hsfoConsumption + results.vlsfoConsumption + results.lsmgoConsumption;
  const bunkerData = [
    ["BUNKER CONSUMPTION & COST"],
    [],
    ["Fuel Type", "Consumption (mt)", "Price ($/mt)", "Cost ($)"],
    ["HSFO", fmt(results.hsfoConsumption, 4), bunker.hsfo.price, fmt(results.hsfoConsumption * bunker.hsfo.price)],
    ["VLSFO", fmt(results.vlsfoConsumption, 4), bunker.vlsfo.price, fmt(results.vlsfoConsumption * bunker.vlsfo.price)],
    ["LSMGO", fmt(results.lsmgoConsumption, 4), bunker.lsmgo.price, fmt(results.lsmgoConsumption * bunker.lsmgo.price)],
    ["TOTAL", fmt(totalFuelConsumption, 4), "", fmt(results.totalBunkerCost)],
    [],
    ["=== ECA vs Non-ECA Fuel Breakdown ==="],
    ["", "HSFO (mt)", "VLSFO (mt)", "LSMGO (mt)", "Total (mt)"],
    ["Non-ECA", fmt(results.nonEcaFuel.hsfo, 4), fmt(results.nonEcaFuel.vlsfo, 4), fmt(results.nonEcaFuel.lsmgo, 4), fmt(results.nonEcaFuel.total, 4)],
    ["ECA", fmt(results.ecaFuel.hsfo, 4), fmt(results.ecaFuel.vlsfo, 4), fmt(results.ecaFuel.lsmgo, 4), fmt(results.ecaFuel.total, 4)],
    [],
    ["=== EU-Covered Fuel (for EU ETS & FuelEU) ==="],
    ["", "HSFO (mt)", "VLSFO (mt)", "LSMGO (mt)"],
    ["EU Covered", fmt(results.euCoveredFuel.hsfo, 4), fmt(results.euCoveredFuel.vlsfo, 4), fmt(results.euCoveredFuel.lsmgo, 4)],
  ];
  const wsBunker = XLSX.utils.aoa_to_sheet(bunkerData);
  wsBunker["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsBunker, "Bunker");

  // ====== SHEET 6: FINANCIAL / ECONOMICS ======
  const tcCommPct = cargo.tcCommission;
  const voyCommPct = cargo.voyageCommission;
  const finData = [
    ["FINANCIAL CALCULATIONS"],
    [],
    ["Metric", "Value ($)", "Formula"],
    ["Gross Freight", fmt(results.grossFreight), cargo.rateType === "lumpsum" ? "Lumpsum" : `${cargo.rate} × ${cargo.quantity} MT`],
    ["Voyage Commission", fmt(results.voyageCommission), `Gross Freight × ${voyCommPct}%`],
    ["Net Freight", fmt(results.netFreight), "Gross Freight - Voyage Commission"],
    [],
    ["Port Costs", fmt(results.portCosts), "Σ Expected DA (all ports)"],
    ["Bunker Cost", fmt(results.totalBunkerCost), "(HSFO×Price) + (VLSFO×Price) + (LSMGO×Price)"],
    ["Misc Costs", fmt(results.miscCosts), "Misc + Extra Fees + Extra Insurance"],
    ["Canal Costs", fmt(results.canalCosts), "Canal 1 + Canal 2"],
    ["Total Voyage Costs (excl Hire)", fmt(results.voyageCostExclHire), "Bunker + Port + Misc + Canal"],
    [],
    ["Hire Rate ($/day)", hireRate, ""],
    ["Net BB ($)", netBB, ""],
    ["Hire Cost", fmt(results.hireCost), `${hireRate} × ${fmt(results.totalVoyageDays, 4)} days + Net BB($${netBB})`],
    ["Voyage Cost Incl Hire", fmt(results.voyageCostInclHire), "Voyage Cost Excl Hire + Hire Cost"],
    [],
    ["Demurrage ($)", fmt(cargo.demurrageAmount), `Demurrage Rate: $${cargo.demurrageRate}/day`],
    ["Despatch ($)", fmt(cargo.despatchAmount), `Despatch Rate: $${cargo.despatchRate}/day`],
    [],
    ["=== PROFITABILITY ==="],
    ["Gross Profit", fmt(results.grossProfit), "Net Freight - Voyage Costs + Demurrage - Despatch"],
    ["P&L", fmt(results.pAndL), "Gross Profit - Hire Cost"],
    ["NTCE ($/day)", fmt(results.ntce), "(Net Freight - Voyage Costs Excl Hire) / Total Voyage Days"],
    ["GTCE ($/day)", fmt(results.gtce), `NTCE / (1 - TC Commission ${tcCommPct}%)`],
    ["TCE ($/day)", fmt(results.tce), "= GTCE"],
    ["Gross Rate ($/mt)", fmt(results.grossRate), `(Voyage Cost Incl Hire / Qty) / (1 - Voy Comm ${voyCommPct}%)`],
  ];
  const wsFin = XLSX.utils.aoa_to_sheet(finData);
  wsFin["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, wsFin, "Financials");

  // ====== SHEET 7: ENVIRONMENTAL ======
  const envData = [
    ["ENVIRONMENTAL METRICS"],
    [],
    ["Metric", "Value", "Unit", "Formula"],
    ["Total CO₂", fmt(results.totalCo2, 4), "mt", "(HSFO×3.114) + (VLSFO×3.114) + (LSMGO×3.206)"],
    ["CO₂ Laden", fmt(results.co2Laden, 4), "mt", "Total CO₂ × (Laden Sea Days / Total Sea Days)"],
    ["CO₂ Ballast", fmt(results.co2Ballast, 4), "mt", "Total CO₂ × (Ballast Sea Days / Total Sea Days)"],
    [],
    ["CO₂ from HSFO", fmt(results.co2ByFuel.hsfo, 4), "mt", `${fmt(results.hsfoConsumption, 4)} × 3.114`],
    ["CO₂ from VLSFO", fmt(results.co2ByFuel.vlsfo, 4), "mt", `${fmt(results.vlsfoConsumption, 4)} × 3.114`],
    ["CO₂ from LSMGO", fmt(results.co2ByFuel.lsmgo, 4), "mt", `${fmt(results.lsmgoConsumption, 4)} × 3.206`],
    [],
    ["Non-ECA CO₂", fmt(results.nonEcaCo2, 4), "mt", "CO₂ from non-ECA fuel consumption"],
    ["ECA CO₂", fmt(results.ecaCo2, 4), "mt", "CO₂ from ECA fuel consumption"],
    [],
    ["EFOI", fmt(results.efoi, 4), "gCO₂/tnm", "Total CO₂ × 1M / (Cargo × Laden Distance)"],
    ["AFR/CII (Actual)", fmt(results.afrCii, 4), "gCO₂/dwt-nm", "Total CO₂ × 1M / (DWT × Total Distance)"],
    ["CII Rating", results.ciiRating, "", "A/B/C/D/E based on IMO thresholds"],
    ["Required CII", fmt(results.ciiResult.requiredCii, 4), "gCO₂/dwt-nm", "IMO reference for vessel type/year"],
    ["CII Ratio", fmt(results.ciiResult.ciiRatio, 4), "", "Actual CII / Required CII"],
    [],
    ["=== EU ETS ==="],
    ["Total CO₂ Cost", fmt(results.totalCo2Cost), "$", `Total CO₂ × CO₂ Price ($${bunker.co2Price})`],
    ["Chargeable CO₂ (EUA)", fmt(results.chargeableCo2, 4), "mt", "Σ (Leg CO₂ × Coverage × Phase-In)"],
    ["ETS Voyage Coverage", fmt(results.etsVoyageCoverage * 100), "%", "100% EU-EU, 50% EU-NonEU, 0% NonEU-NonEU"],
    ["ETS Phase-in", fmt(results.etsPhaseIn * 100), "%", "2024: 40%, 2025: 70%, 2026+: 100%"],
    ["EUA CO₂ Cost", fmt(results.euaCo2Cost), "$", `Chargeable CO₂ × CO₂ Price ($${bunker.co2Price})`],
    ["EUA Freight Impact", fmt(results.euaFreightImpact), "$/mt", "EUA CO₂ Cost / Cargo Quantity"],
    [],
    ["=== FuelEU Maritime ==="],
    ["FuelEU Total Penalty", fmt(results.fuelEuTotalPenalty), "$", "Sum of per-fuel penalties on EU-covered quantities"],
    ["HSFO Penalty", fmt(results.fuelEuResult.fuels.hsfo.penalty), "$", `${fmt(results.euCoveredFuel.hsfo, 2)}t × penalty rate`],
    ["VLSFO Penalty", fmt(results.fuelEuResult.fuels.vlsfo.penalty), "$", `${fmt(results.euCoveredFuel.vlsfo, 2)}t × penalty rate`],
    ["LSMGO Penalty", fmt(results.fuelEuResult.fuels.lsmgo.penalty), "$", `${fmt(results.euCoveredFuel.lsmgo, 2)}t × penalty rate`],
    ["GHG Intensity Target", fmt(results.fuelEuResult.target, 2), "gCO₂eq/MJ", "FuelEU Maritime benchmark for current year"],
  ];
  const wsEnv = XLSX.utils.aoa_to_sheet(envData);
  wsEnv["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, wsEnv, "Environmental");

  // Download
  const vesselName = vessel.name || "Voyage";
  const fileName = `${vesselName}_Estimate_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
