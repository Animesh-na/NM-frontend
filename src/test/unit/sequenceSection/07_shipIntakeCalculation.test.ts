import { describe, it, expect } from "vitest";
import { calculateDraftRestriction } from "@/utils/draftRestriction";

/**
 * UNIT — Ship Intake Calculation.
 *
 * Seasonal draft transition (per IntakeCalculator.calc):
 *   winter   = summerDraft × (1 − 1/48)
 *   summer   = summerDraft
 *   tropical = summerDraft × (1 + 1/48)
 *
 * Seasonal DWT is derived from the change in draft × TPC × 100.
 * calculateDraftRestriction verifies that the vessel actually fits the port.
 */

type Season = "winter" | "summer" | "tropical";

interface IntakeInput {
  summerDwt: number;
  summerDraft: number;
  tpc: number;
  season: Season;
  portDraft: number;
  constants?: number;
  bob?: number;
  freshWater?: number;
  waterDensityFactor?: number; // relative to SW; 1.0 = SW, ~0.9756 = FW/1.025
  cubicM3?: number;
  sfCuFtPerMt?: number;
}

function computeIntake(i: IntakeInput) {
  const density = i.waterDensityFactor ?? 1;
  const seasonalDraft =
    i.season === "winter"
      ? i.summerDraft - i.summerDraft / 48
      : i.season === "tropical"
        ? i.summerDraft + i.summerDraft / 48
        : i.summerDraft;

  const seasonalDwt = i.summerDwt - (i.summerDraft - seasonalDraft) * (i.tpc * 100);
  const dwtReduction = Math.max(0, (i.summerDraft - i.portDraft) * 100 * i.tpc);
  const dwtAfterDraftDensity = (seasonalDwt - dwtReduction) * density;
  const totalDeductions = (i.constants ?? 0) + (i.bob ?? 0) + (i.freshWater ?? 0);
  const dwcc = dwtAfterDraftDensity - totalDeductions;

  const cuFt = (i.cubicM3 ?? 0) * 35.3147;
  const volumeBased = i.sfCuFtPerMt && i.sfCuFtPerMt > 0 ? cuFt / i.sfCuFtPerMt : Infinity;

  return {
    seasonalDraft,
    seasonalDwt,
    finalIntake: Math.max(0, Math.min(Math.round(dwcc), Math.round(volumeBased))),
  };
}

describe("Ship Intake Calculation", () => {
  const base = { summerDwt: 82_000, summerDraft: 14.4, tpc: 66, portDraft: 14.4 };

  describe("Seasonal draft transitions", () => {
    it("Summer keeps the vessel's summer draft", () => {
      expect(computeIntake({ ...base, season: "summer" }).seasonalDraft).toBeCloseTo(14.4, 4);
    });

    it("Winter reduces the draft by 1/48 of summer draft", () => {
      const r = computeIntake({ ...base, season: "winter" });
      expect(r.seasonalDraft).toBeCloseTo(14.4 - 14.4 / 48, 4);
    });

    it("Tropical increases the draft by 1/48 of summer draft", () => {
      const r = computeIntake({ ...base, season: "tropical" });
      expect(r.seasonalDraft).toBeCloseTo(14.4 + 14.4 / 48, 4);
    });
  });

  describe("Seasonal DWT adjustment", () => {
    it("Winter DWT drops by (summerDraft − seasonalDraft) × TPC × 100", () => {
      const r = computeIntake({ ...base, season: "winter" });
      const expected = base.summerDwt - (14.4 - (14.4 - 14.4 / 48)) * (66 * 100);
      expect(r.seasonalDwt).toBeCloseTo(expected, 2);
      expect(r.seasonalDwt).toBeLessThan(base.summerDwt);
    });

    it("Tropical DWT rises above the summer figure", () => {
      const r = computeIntake({ ...base, season: "tropical" });
      expect(r.seasonalDwt).toBeGreaterThan(base.summerDwt);
    });
  });

  describe("Intake responds to seasonal changes", () => {
    it("Same port draft: Tropical intake > Summer intake > Winter intake", () => {
      const args = { ...base, portDraft: 20 /* unrestricted */, constants: 300, bob: 500 };
      const winter = computeIntake({ ...args, season: "winter" }).finalIntake;
      const summer = computeIntake({ ...args, season: "summer" }).finalIntake;
      const tropical = computeIntake({ ...args, season: "tropical" }).finalIntake;
      expect(tropical).toBeGreaterThan(summer);
      expect(summer).toBeGreaterThan(winter);
    });
  });

  describe("Draft restriction (accessibility)", () => {
    it("Deep-water port: 75,000 MT cargo request is ACCESSIBLE", () => {
      const r = calculateDraftRestriction({
        currentDraftM: 5,
        dwtMt: 82_000,
        tpcMtPerCm: 66,
        shipCubicCapacityM3: 100_000,
        portName: "Rotterdam",
        portMaxDraftM: 22,
        ukcPercent: 0,
        stowageFactorM3PerMt: 1.2,
        requestedCargoMt: 75_000,
      });
      expect(r.status).toBe("ACCESSIBLE");
    });

    it("Shallow port with UKC: request above limit → NOT ACCESSIBLE, limiting = draft", () => {
      const r = calculateDraftRestriction({
        currentDraftM: 7,
        dwtMt: 82_000,
        tpcMtPerCm: 66,
        shipCubicCapacityM3: 100_000,
        portName: "River Port",
        portMaxDraftM: 9,
        ukcPercent: 10,
        stowageFactorM3PerMt: 1.2,
        requestedCargoMt: 60_000,
      });
      expect(r.status).toBe("NOT ACCESSIBLE");
      expect(r.limitingFactor).toBe("draft");
    });
  });
});