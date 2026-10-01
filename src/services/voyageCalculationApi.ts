import type { VoyageInputs } from "@/hooks/useVoyageCalculation";
import { apiRequest } from "@/services/marineApi";

/** Summary fields currently projected by the Go engine for reference-capture parity. */
export interface BackendVoyageSummary {
  SeaDaysBallast: number;
  SeaDaysLaden: number;
  TotalSeaDays: number;
  TotalPortDays: number;
  TotalVoyageDays: number;
  HSFOConsumption: number;
  VLSFOConsumption: number;
  LSMGOConsumption: number;
  TotalBunkerCost: number;
  GrossFreight: number;
  NetFreight: number;
  VoyageCostInclHire: number;
  VoyageCostExclHire: number;
  NTCE: number;
  TCE: number | null;
  GTCE: number;
  PAndL: number;
  TotalCO2: number;
  EFOI: number;
  AFR_CII: number;
  CIIRating: string;
  CII: { ActualCII: number; Rating: string };
  EUETS: { TotalCO2: number; ChargeableCO2: number; Cost: number };
  FuelEU: { TotalPenalty: number };
  UKETS: { ChargeableCO2: number; Cost: number };
  EUCoveredFuel: { hsfo: number; vlsfo: number; lsmgo: number };
  GrossRate: number;
  TotalCO2Cost: number;
  EUACost: number;
  EUAFreightImpact: number;
  FuelEUFreightImpact: number;
  UKETSFreightImpact: number;
}

export interface BackendVoyageCalculationResponse {
  calculation_id: string;
  client_sequence: number;
  engine_version: string;
  status: "completed";
  result: BackendVoyageSummary;
}

function fuelRate(row: { ballast: number; laden: number; load: number; discharge: number; idle: number; canal: number }) {
  return {
    ballast: row.ballast ?? 0,
    laden: row.laden ?? 0,
    load: row.load ?? 0,
    discharge: row.discharge ?? 0,
    idle: row.idle ?? 0,
    canal: row.canal ?? 0,
  };
}

function consumptionProfile(profile: VoyageInputs["vessel"]["ecoConsumption"]) {
  return {
    speed: {
      ballast: profile.speed.ballast,
      laden: profile.speed.laden,
      canal: profile.speed.canal,
    },
    hsfo: fuelRate(profile.hsfo),
    vlsfo: fuelRate(profile.vlsfo),
    lsmgo: fuelRate(profile.lsmgo),
    ae: fuelRate(profile.ae),
    aeScrubber: fuelRate(profile.aeScrubber),
  };
}

/** Explicitly project frontend state onto the Go engine's accepted input schema. */
function engineInput(input: VoyageInputs) {
  const vessel = input.vessel;
  return {
    vessel: {
      name: vessel.name,
      dwt: vessel.dwt,
      type: vessel.type,
      speedProfile: vessel.speedProfile,
      hasScrubber: vessel.hasScrubber,
      consumption: {},
      ecoConsumption: consumptionProfile(vessel.ecoConsumption),
      fullConsumption: consumptionProfile(vessel.fullConsumption),
    },
    sequence: input.sequence.map((row) => ({
      id: row.id,
      operation: row.operation,
      port: row.port,
      portUnloc: row.portUnloc,
      cgo: row.cgo,
      distance: row.distance,
      ecaDistance: row.ecaDistance,
      quantity: row.quantity,
      productivity: row.productivity ?? 0,
      terms: row.terms ?? "",
      coefficientFactor: row.coefficientFactor ?? row.termsFactor ?? 0,
      expDa: row.expDa,
      seaMargin: row.seaMargin ?? 0,
      turnTimeHours: row.turnTimeHours ?? 0,
      extraTimeHours: row.extraTimeHours ?? 0,
      portFuelType: row.portFuelType ?? "vlsfo",
      distanceSpeedContext: row.distanceSpeedContext ?? "",
      ecaDistanceSpeedContext: row.ecaDistanceSpeedContext ?? "",
      isEuEea: row.isEuEea ?? false,
      ukEts: row.ukEts ?? false,
      ukZone: row.ukZone ?? "",
      type: row.type ?? "port",
      assignedCargoIds: row.assignedCargoIds ?? [],
    })),
    cargo: input.cargo,
    cargos: input.cargos ?? [],
    bunker: {
      hsfo: input.bunker.hsfo,
      vlsfo: input.bunker.vlsfo,
      lsmgo: input.bunker.lsmgo,
      rewardFactor: input.bunker.rewardFactor ?? 1,
      euEtsPrice: input.bunker.euEtsPrice ?? 0,
      ukEtsPrice: input.bunker.ukEtsPrice ?? 0,
      fuelMode: input.bunker.fuelMode ?? "average",
      ignoreBob: input.bunker.ignoreBOB ?? false,
      portBunkering: (input.bunker.portBunkering ?? []).map((lot) => ({
        portUnloc: lot.portUnloc ?? "",
        portName: lot.portName ?? "",
        hsfo: lot.hsfo,
        vlsfo: lot.vlsfo,
        lsmgo: lot.lsmgo,
      })),
    },
    hireRate: input.hireRate,
    netBb: input.netBB ?? 0,
    misc: {
      miscCost: input.misc?.miscCost ?? 0,
      extraFees: input.misc?.extraFees ?? 0,
      extraInsurance: input.misc?.extraInsurance ?? 0,
      canalCost1: input.misc?.canalCost1 ?? 0,
    },
    extraTime: {
      canal1Days: input.extraTime?.canal1Days ?? 0,
      canalFuel: input.extraTime?.canalFuel ?? "",
    },
    applyEuaImpact: input.applyEuaImpact ?? false,
    applyFuelEuImpact: input.applyFuelEuImpact ?? false,
    applyUkEtsImpact: input.applyUkEtsImpact ?? false,
  };
}

/** Calls the authenticated Go engine. This summary is not yet the full legacy UI result. */
export function calculateVoyageOnBackend(
  input: VoyageInputs,
  options: { calculationId?: string; clientSequence?: number } = {},
): Promise<BackendVoyageCalculationResponse> {
  return apiRequest<BackendVoyageCalculationResponse>("/calculations/voyage", undefined, {
    method: "POST",
    body: {
      calculation_id: options.calculationId,
      client_sequence: options.clientSequence ?? 0,
      input: engineInput(input),
    },
  });
}
