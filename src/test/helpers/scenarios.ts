/**
 * Custom input builders for unit tests.
 *
 * Unit scenarios should define their own input values through these builders
 * instead of importing shared business mock fixtures. The defaults below are
 * only valid structural fallbacks so a test can focus on the fields it owns.
 */
import type {
  BunkerData,
  CargoData,
  ExtraTimeData,
  MiscCostsData,
  SequenceRow,
  VoyageInputs,
} from "@/hooks/useVoyageCalculation";
import type { ConsumptionMatrix, ExtendedConsumption, VesselData } from "@/data/vessels";

type ConsumptionMatrixInput = Partial<{
  [K in keyof ConsumptionMatrix]: Partial<ExtendedConsumption>;
}>;

function customExtendedConsumption(
  values: Partial<ExtendedConsumption> = {},
): ExtendedConsumption {
  return {
    ballast: 0,
    laden: 0,
    canal: 0,
    load: 0,
    discharge: 0,
    idle: 0,
    misc1: 0,
    misc2: 0,
    ...values,
  };
}

export function customConsumptionMatrix(
  values: ConsumptionMatrixInput = {},
): ConsumptionMatrix {
  return {
    speed: customExtendedConsumption({ ballast: 12, laden: 12, canal: 8, ...values.speed }),
    hsfo: customExtendedConsumption({ ballast: 18, laden: 20, canal: 7, load: 2, discharge: 2, idle: 1, ...values.hsfo }),
    vlsfo: customExtendedConsumption({ ballast: 6, laden: 7, canal: 3, load: 0.6, discharge: 0.7, idle: 0.4, ...values.vlsfo }),
    lsmgo: customExtendedConsumption({ ballast: 1.2, laden: 1.4, canal: 0.5, load: 0.25, discharge: 0.3, idle: 0.2, ...values.lsmgo }),
    ae: customExtendedConsumption({ ballast: 1, laden: 1.1, canal: 0, load: 0.8, discharge: 0.9, idle: 0.5, ...values.ae }),
    aeScrubber: customExtendedConsumption({ ballast: 1.2, laden: 1.3, canal: 0, load: 0.9, discharge: 1, idle: 0.6, ...values.aeScrubber }),
  };
}

export function customVessel(values: Partial<VesselData> = {}): VesselData {
  const ecoConsumption = values.ecoConsumption ?? customConsumptionMatrix();
  const fullConsumption = values.fullConsumption ?? customConsumptionMatrix({
    speed: { ballast: 14, laden: 14 },
    hsfo: { ballast: 24, laden: 27 },
    vlsfo: { ballast: 8, laden: 9.5 },
    lsmgo: { ballast: 1.6, laden: 1.9 },
  });

  const base: VesselData = {
    name: "Custom Unit Test Vessel",
    type: "bulk_carrier",
    imo: "9000001",
    dwt: 75_000,
    gt: 42_000,
    cubic: 88_000,
    cubicUnit: "cbm",
    draft: 14,
    tpcTpi: 62,
    hsfoCapability: true,
    hasScrubber: false,
    scrubberCount: 0,
    builtYear: 2018,
    speedProfile: "eco",
    ecoConsumption,
    fullConsumption,
    loadDischIdleSame: false,
    miscMultiplier: 1,
    consumption: {
      speed: { ecoBallast: ecoConsumption.speed.ballast, ecoLaden: ecoConsumption.speed.laden, canal: ecoConsumption.speed.canal },
      hsfo: { ecoBallast: ecoConsumption.hsfo.ballast, ecoLaden: ecoConsumption.hsfo.laden, canal: ecoConsumption.hsfo.canal },
      vlsfo: { ecoBallast: ecoConsumption.vlsfo.ballast, ecoLaden: ecoConsumption.vlsfo.laden, canal: ecoConsumption.vlsfo.canal },
      lsmgo: { ecoBallast: ecoConsumption.lsmgo.ballast, ecoLaden: ecoConsumption.lsmgo.laden, canal: ecoConsumption.lsmgo.canal },
      ae: { ecoBallast: ecoConsumption.ae.ballast, ecoLaden: ecoConsumption.ae.laden, canal: ecoConsumption.ae.canal },
      aeScrubber: { ecoBallast: ecoConsumption.aeScrubber.ballast, ecoLaden: ecoConsumption.aeScrubber.laden, canal: ecoConsumption.aeScrubber.canal },
    },
  };

  return {
    ...base,
    ...values,
    ecoConsumption,
    fullConsumption,
  };
}

export function customLeg(values: Partial<SequenceRow> = {}): SequenceRow {
  return {
    id: 1,
    operation: "load",
    port: "Custom Load Port",
    portUnloc: "BRCLP",
    cgo: "Custom Cargo",
    distance: 1_000,
    ecaDistance: 0,
    portDays: 2,
    quantity: 50_000,
    expDa: 20_000,
    seaTime: 3,
    ecaTime: 0,
    nonEcaTime: 3,
    baseSeaTime: 2.85,
    seaMarginTime: 0.15,
    seaMargin: 5,
    turnTimeHours: 6,
    extraTimeHours: 0,
    portFuelType: "vlsfo",
    isEuEea: false,
    type: "port",
    assignedCargoIds: [1],
    ...values,
  };
}

export function customCargo(values: Partial<CargoData> = {}): CargoData {
  return {
    rate: 30,
    rateType: "mt",
    quantity: 50_000,
    voyageCommission: 3.75,
    tcCommission: 2.5,
    demurrage: 0,
    despatch: 0,
    ...values,
  };
}

export function customBunker(values: Partial<BunkerData> = {}): BunkerData {
  return {
    hsfo: { price: 450, robStart: 500, ...values.hsfo },
    vlsfo: { price: 600, robStart: 300, ...values.vlsfo },
    lsmgo: { price: 800, robStart: 150, ...values.lsmgo },
    co2Price: 75,
    rewardFactor: 1,
    ...values,
  };
}

export function customMiscCosts(values: Partial<MiscCostsData> = {}): MiscCostsData {
  return {
    miscCost: 0,
    extraFees: 0,
    extraInsurance: 0,
    canalCost1: 0,
    canalCost2: 0,
    ...values,
  };
}

export function customExtraTime(values: Partial<ExtraTimeData> = {}): ExtraTimeData {
  return {
    canal1Days: 0,
    canal2Days: 0,
    idlePortDays: 0,
    atSeaDays: 0,
    atSeaSpeedContext: "EV",
    ...values,
  };
}

export function createVoyageTestInputs(values: Partial<VoyageInputs> = {}): VoyageInputs {
  return {
    vessel: values.vessel ?? customVessel(),
    sequence: values.sequence ?? [
      customLeg({ id: 1, operation: "load", port: "Custom Load Port", distance: 1_000, ecaDistance: 0, seaTime: 3, ecaTime: 0, nonEcaTime: 3, portDays: 2, quantity: 50_000 }),
      customLeg({ id: 2, operation: "disch", port: "Custom Discharge Port", portUnloc: "NLCDP", distance: 2_400, ecaDistance: 200, seaTime: 8, ecaTime: 0.7, nonEcaTime: 7.3, portDays: 3, quantity: 50_000, expDa: 25_000 }),
    ],
    cargo: values.cargo ?? customCargo(),
    bunker: values.bunker ?? customBunker(),
    hireRate: values.hireRate ?? 15_000,
    netBB: values.netBB,
    misc: values.misc ?? customMiscCosts(),
    extraTime: values.extraTime ?? customExtraTime(),
    applyEuaImpact: values.applyEuaImpact,
    applyFuelEuImpact: values.applyFuelEuImpact,
    cargos: values.cargos,
  };
}