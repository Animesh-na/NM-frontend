import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation, type VoyageInputs } from "@/hooks/useVoyageCalculation";
import { mockVessel } from "../helpers/mockVesselData";
import { mockSimpleSequence, mockCargo, mockBunker, mockMiscCosts, mockExtraTime } from "../helpers/mockSequenceData";

/**
 * VOYAGE SUMMARY REPORT
 * Runs the full calculation and prints every result field for manual validation.
 */
describe("Voyage Summary Report", () => {
  const fullInputs: VoyageInputs = {
    vessel: mockVessel,
    sequence: mockSimpleSequence,
    cargo: mockCargo,
    bunker: mockBunker,
    hireRate: 15000,
    misc: mockMiscCosts,
    extraTime: mockExtraTime,
  };

  it("should print full voyage summary for validation", () => {
    const { result } = renderHook(() => useVoyageCalculation(fullInputs));
    const r = result.current;

    const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const report = `
╔══════════════════════════════════════════════════════════════╗
║                    VOYAGE SUMMARY REPORT                     ║
╠══════════════════════════════════════════════════════════════╣
║  INPUTS                                                      ║
║  Vessel: ${mockVessel.name.padEnd(49)}║
║  Speed Profile: ${mockVessel.speedProfile.padEnd(42)}║
║  DWT: ${String(mockVessel.dwt).padEnd(53)}║
║  Hire Rate: $${fmt(fullInputs.hireRate).padEnd(47)}║
║  Cargo Rate: $${fmt(mockCargo.rate)} /${mockCargo.rateType.padEnd(38)}║
║  Cargo Qty: ${fmt(mockCargo.quantity).padEnd(47)}║
║  Voyage Commission: ${mockCargo.voyageCommission}%${" ".repeat(38)}║
║  TC Commission: ${mockCargo.tcCommission}%${" ".repeat(42)}║
╠══════════════════════════════════════════════════════════════╣
║  DISTANCE                                                    ║
║  Total Distance:      ${String(r.totalDistance).padEnd(10)} nm                    ║
║  ECA Distance:        ${String(r.totalEcaDistance).padEnd(10)} nm                    ║
║  Non-ECA Distance:    ${String(r.nonEcaDistance).padEnd(10)} nm                    ║
║  Laden Distance:      ${String(r.ladenDistance).padEnd(10)} nm                    ║
╠══════════════════════════════════════════════════════════════╣
║  TIME                                                        ║
║  Sea Days Ballast:    ${fmt(r.seaDaysBallast).padEnd(10)} days                   ║
║  Sea Days Laden:      ${fmt(r.seaDaysLaden).padEnd(10)} days                   ║
║  Extra Sea Days:      ${fmt(r.extraSeaDays).padEnd(10)} days                   ║
║  Total Sea Days:      ${fmt(r.totalSeaDays).padEnd(10)} days                   ║
║  Total Port Days:     ${fmt(r.totalPortDays).padEnd(10)} days                   ║
║  Extra Port Days:     ${fmt(r.extraPortDays).padEnd(10)} days                   ║
║  Extra Canal Days:    ${fmt(r.extraCanalDays).padEnd(10)} days                   ║
║  Base Sea Time:       ${fmt(r.baseSeaTime).padEnd(10)} days                   ║
║  Sea Margin Time:     ${fmt(r.seaMarginTime).padEnd(10)} days                   ║
║  ─────────────────────────────────────────────────────────── ║
║  TOTAL VOYAGE DAYS:   ${fmt(r.totalVoyageDays).padEnd(10)} days                   ║
╠══════════════════════════════════════════════════════════════╣
║  BUNKER CONSUMPTION                                          ║
║  HSFO:                ${fmt(r.hsfoConsumption).padEnd(10)} mt                     ║
║  VLSFO:               ${fmt(r.vlsfoConsumption).padEnd(10)} mt                     ║
║  LSMGO:               ${fmt(r.lsmgoConsumption).padEnd(10)} mt                     ║
║  ─────────────────────────────────────────────────────────── ║
║  TOTAL BUNKER COST:   $${fmt(r.totalBunkerCost).padEnd(37)}║
╠══════════════════════════════════════════════════════════════╣
║  REVENUE                                                     ║
║  Gross Freight:       $${fmt(r.grossFreight).padEnd(37)}║
║  Voyage Commission:   $${fmt(r.voyageCommission).padEnd(37)}║
║  Net Freight:         $${fmt(r.netFreight).padEnd(37)}║
╠══════════════════════════════════════════════════════════════╣
║  COSTS                                                       ║
║  Port Costs:          $${fmt(r.portCosts).padEnd(37)}║
║  Misc Costs:          $${fmt(r.miscCosts).padEnd(37)}║
║  Canal Costs:         $${fmt(r.canalCosts).padEnd(37)}║
║  Total Voyage Costs:  $${fmt(r.totalVoyageCosts).padEnd(37)}║
║  Hire Cost:           $${fmt(r.hireCost).padEnd(37)}║
║  ─────────────────────────────────────────────────────────── ║
║  Voyage Cost Excl Hire: $${fmt(r.voyageCostExclHire).padEnd(34)}║
║  Voyage Cost Incl Hire: $${fmt(r.voyageCostInclHire).padEnd(34)}║
╠══════════════════════════════════════════════════════════════╣
║  PROFITABILITY                                               ║
║  NTCE:                $${fmt(r.ntce).padEnd(14)} /day                    ║
║  GTCE:                $${fmt(r.gtce).padEnd(14)} /day                    ║
║  TCE:                 $${fmt(r.tce).padEnd(14)} /day                    ║
║  Gross Profit:        $${fmt(r.grossProfit).padEnd(37)}║
║  P&L:                 $${fmt(r.pAndL).padEnd(37)}║
╠══════════════════════════════════════════════════════════════╣
║  ENVIRONMENTAL                                               ║
║  Total CO₂:           ${fmt(r.totalCo2).padEnd(10)} t                      ║
║  CO₂ Laden:           ${fmt(r.co2Laden).padEnd(10)} t                      ║
║  CO₂ Ballast:         ${fmt(r.co2Ballast).padEnd(10)} t                      ║
║  CO₂ by HSFO:         ${fmt(r.co2ByFuel.hsfo).padEnd(10)} t                      ║
║  CO₂ by VLSFO:        ${fmt(r.co2ByFuel.vlsfo).padEnd(10)} t                      ║
║  CO₂ by LSMGO:        ${fmt(r.co2ByFuel.lsmgo).padEnd(10)} t                      ║
║  EFOI:                ${fmt(r.efoi).padEnd(10)} gCO₂/tnm                ║
║  AFR/CII:             ${fmt(r.afrCii).padEnd(10)} gCO₂/dwt-nm            ║
║  CII Rating:          ${r.ciiRating.padEnd(39)}║
║  ─────────────────────────────────────────────────────────── ║
║  EU ETS                                                      ║
║  ETS Cost:            $${fmt(r.etsCost).padEnd(37)}║
║  Chargeable CO₂:      ${fmt(r.chargeableCo2).padEnd(10)} t                      ║
║  ETS Coverage:        ${fmt(r.etsVoyageCoverage * 100).padEnd(10)} %                      ║
║  ETS Phase-in:        ${fmt(r.etsPhaseIn).padEnd(10)} %                      ║
╚══════════════════════════════════════════════════════════════╝`;

    console.log(report);

    // Basic sanity — test still passes
    expect(r.totalVoyageDays).toBeGreaterThan(0);
    expect(r.totalBunkerCost).toBeGreaterThan(0);
    expect(r.grossFreight).toBeGreaterThan(0);
    expect(r.totalCo2).toBeGreaterThan(0);
  });
});
