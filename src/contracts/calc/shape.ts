/**
 * Compile-time shape agreement between the app's own types and the calc.v1
 * contract types generated from the JSON Schemas. `npx tsc --noEmit -p
 * tsconfig.app.json` fails if a field is added to or removed from either side
 * without updating the schema (and the Go types, which have their own check).
 * Nothing here runs at runtime.
 */
import type { VoyageResults, PerCargoBreakdown, EtsLegDetail } from "@/hooks/useVoyageCalculation";
import type { CiiResult, EtsResult, Co2BreakdownByFuel } from "@/utils/emissionCalculations";
import type { UkEtsResult, UkEtsLegDetail, UkEtsFuel } from "@/utils/ukEtsCalculations";
import type { FuelEuResult, FuelEuFuelDetail, FuelEuLegOutput } from "@/utils/fuelEuMaritime";
import type { SequenceRowUI, CargoEntry as AppCargoEntry, MiscState, PortBunkeringEntry as AppPortBunkeringEntry } from "@/context/VoyageContext";
import type { VesselData } from "@/data/vessels";
import type * as C from "./types.generated";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type KeysMatch<A, B> = Same<keyof A, keyof B>;

type Check<T extends true> = T;

// Result side: every VoyageResults field is in the DTO and vice versa.
export type ResultShapeChecks = [
  Check<KeysMatch<VoyageResults, C.CalculationResultDTO>>,
  Check<KeysMatch<CiiResult, C.CiiResult>>,
  Check<KeysMatch<CiiResult["boundaries"], C.CiiResult["boundaries"]>>,
  Check<KeysMatch<EtsResult, C.EtsResult>>,
  Check<KeysMatch<EtsResult["legBreakdown"][number], C.EtsResult["legBreakdown"][number]>>,
  Check<KeysMatch<EtsLegDetail, C.EtsLegDetail>>,
  Check<KeysMatch<UkEtsResult, C.UkEtsResult>>,
  Check<KeysMatch<UkEtsLegDetail, C.UkEtsLegDetail>>,
  Check<KeysMatch<UkEtsFuel, C.FuelQuantity>>,
  Check<KeysMatch<FuelEuResult, C.FuelEuResult>>,
  Check<KeysMatch<FuelEuFuelDetail, C.FuelEuFuelDetail>>,
  Check<KeysMatch<FuelEuLegOutput, C.FuelEuLegOutput>>,
  Check<KeysMatch<Co2BreakdownByFuel, C.FuelQuantityWithTotal>>,
  Check<KeysMatch<PerCargoBreakdown, C.PerCargoBreakdown>>,
];

// Input side: the saved sheet's building blocks match the input schema.
export type InputShapeChecks = [
  Check<KeysMatch<SequenceRowUI, C.SequenceRow>>,
  Check<KeysMatch<AppCargoEntry, C.CargoEntry>>,
  Check<KeysMatch<VesselData, C.Vessel>>,
  Check<KeysMatch<MiscState, C.Misc>>,
  Check<KeysMatch<AppPortBunkeringEntry, C.PortBunkeringEntry>>,
];
