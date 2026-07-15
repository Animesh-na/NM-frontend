import { describe, it, expect } from "vitest";
import {
  validateNumeric,
  validateVessel,
  validateSequence,
  validateCargos,
  validateCargoHeader,
  VESSEL_FIELDS,
  SEQUENCE_FIELDS,
  CARGO_FIELDS,
  MAX_CARGOS,
  MAX_SEQUENCE_PORTS,
  type SequenceRowForValidation,
} from "@/utils/validation";
import type { CargoEntry } from "@/context/VoyageContext";
import { customVessel } from "../helpers/scenarios";

/**
 * UNIT — Input Validation (numeric ranges, required fields, limits)
 */

const baseCargo = (over: Partial<CargoEntry> = {}): CargoEntry => ({
  id: 1,
  rate: 25,
  rateType: "mt",
  quantity: 50000,
  voyageCommission: 3.75,
  tcCommission: 2.5,
  demurrageRate: 15000,
  despatchRate: 7500,
  demurrageAmount: 0,
  despatchAmount: 0,
  averageMode: "average",
  ntcBase: 0,
  gtcTarget: 0,
  stowageFactor: 0,
  ...over,
});

describe("validateNumeric — generic numeric rule", () => {
  const cfg = { label: "Test", min: 0, max: 100, required: true };

  it("accepts a value inside the range", () => {
    expect(validateNumeric(50, cfg)).toBeNull();
  });

  it.each([
    ["", "This field is required"],
    [null, "This field is required"],
    [undefined, "This field is required"],
  ])("empty value %p → required error", (value, expected) => {
    expect(validateNumeric(value, cfg)).toBe(expected);
  });

  it("non-numeric string is rejected", () => {
    expect(validateNumeric("abc", cfg)).toBe("Only numeric values are allowed");
  });

  it.each([
    [-1, "Value must be between 0 and 100"],
    [101, "Value must be between 0 and 100"],
  ])("out-of-range %p → range error", (value, msg) => {
    expect(validateNumeric(value, cfg)).toBe(msg);
  });

  it("nonZero + required: 0 is treated as missing", () => {
    expect(validateNumeric(0, { ...cfg, nonZero: true })).toBe("This field is required");
  });

  it("speed field requires value > 0", () => {
    expect(validateNumeric(0, { label: "Speed", min: 0, max: 90, required: true, speed: true }))
      .toBe("Speed must be greater than 0");
  });
});

describe("VESSEL_FIELDS — published ranges", () => {
  it("ranges are sensible (min < max, > 0 where required)", () => {
    for (const [, cfg] of Object.entries(VESSEL_FIELDS)) {
      expect(cfg.max).toBeGreaterThan(cfg.min);
    }
    expect(VESSEL_FIELDS.dwt.max).toBe(600_000);
    expect(VESSEL_FIELDS.draft.max).toBe(50);
  });
});

describe("validateVessel", () => {
  it("custom vessel input is fully valid", () => {
    const vessel = customVessel({ dwt: 75_000, draft: 14.5, tpcTpi: 65 });
    expect(validateVessel(vessel)).toEqual([]);
  });

  it("dwt above max (1_000_000) → range error on dwt", () => {
    const issues = validateVessel(customVessel({ dwt: 1_000_000 }));
    const dwtErr = issues.find((i) => i.field === "dwt");
    expect(dwtErr?.message).toContain("between");
  });

  it("draft above range (100m) → range error", () => {
    const issues = validateVessel(customVessel({ draft: 100 }));
    const draftErr = issues.find((i) => i.field === "draft");
    expect(draftErr?.message).toContain("between");
  });

  it("speed of 0 in matrix → speed error", () => {
    const vessel = customVessel();
    const broken = {
      ...vessel,
      ecoConsumption: {
        ...vessel.ecoConsumption,
        speed: { ...vessel.ecoConsumption.speed, ballast: 0 },
      },
    };
    const issues = validateVessel(broken);
    expect(issues.some((i) => i.field === "matrix_speed_ballast")).toBe(true);
  });
});

describe("validateSequence", () => {
  const goodRow = (over: Partial<SequenceRowForValidation> = {}): SequenceRowForValidation => ({
    id: 1,
    type: "port",
    operation: "loading",
    port: "Santos",
    portId: 11,
    distance: 1000,
    ecaDistance: 0,
    turnTime: 6,
    extraTime: 0,
    expDa: 25000,
    quantity: 50000,
    ...over,
  });

  it("valid sequence → no issues", () => {
    expect(validateSequence([goodRow()])).toEqual([]);
  });

  it("missing port → port error", () => {
    const issues = validateSequence([goodRow({ port: "" })]);
    expect(issues.some((i) => i.field === "port")).toBe(true);
  });

  it("both distance and ECA distance 0 → distance error", () => {
    const issues = validateSequence([goodRow({ distance: 0, ecaDistance: 0 })]);
    expect(issues.some((i) => i.field === "distance")).toBe(true);
  });

  it("expDa = 0 is allowed (DA is optional)", () => {
    const issues = validateSequence([goodRow({ expDa: 0 })]);
    expect(issues.some((i) => i.field === "expDa")).toBe(false);
  });

  it("more than MAX_SEQUENCE_PORTS rows → count error", () => {
    const rows: SequenceRowForValidation[] = Array.from({ length: MAX_SEQUENCE_PORTS + 1 }, (_, i) =>
      goodRow({ id: i + 1 }),
    );
    const issues = validateSequence(rows);
    expect(issues.some((i) => i.field === "_count")).toBe(true);
  });

  it("turn + extra > max → range error", () => {
    const issues = validateSequence([goodRow({ turnTime: 900, extraTime: 200 })]);
    expect(issues.some((i) => i.field === "turnExtra")).toBe(true);
  });

  it("first leg is exempt from distance when open port is empty", () => {
    const rows: SequenceRowForValidation[] = [
      { id: 0, type: "open", port: "" },
      goodRow({ id: 1, distance: 0, ecaDistance: 0 }),
    ];
    const issues = validateSequence(rows);
    expect(issues.some((i) => i.field === "distance" && i.rowId === 1)).toBe(false);
  });
});

describe("validateCargos", () => {
  it("valid cargo → no issues", () => {
    expect(validateCargos([baseCargo()])).toEqual([]);
  });

  it("rate becomes mandatory only after a quantity has been loaded", () => {
    const c = baseCargo({ rate: 0 });
    // No loaded qty → rate 0 is allowed.
    expect(validateCargos([c]).filter((i) => i.field === "rate")).toEqual([]);
    // Loaded qty present → rate 0 must trigger required.
    const issues = validateCargos([c], new Map([[1, 50000]]), new Map([[1, 50000]]));
    expect(issues.some((i) => i.field === "rate")).toBe(true);
  });

  it("flags load/discharge imbalance per cargo", () => {
    const issues = validateCargos(
      [baseCargo()],
      new Map([[1, 50000]]),
      new Map([[1, 40000]]),
    );
    expect(issues.some((i) => i.field === "quantityBalance")).toBe(true);
  });

  it("more than MAX_CARGOS cargoes → count error", () => {
    const list = Array.from({ length: MAX_CARGOS + 1 }, (_, i) => baseCargo({ id: i + 1 }));
    const issues = validateCargos(list);
    expect(issues.some((i) => i.field === "_count")).toBe(true);
  });
});

describe("validateCargoHeader", () => {
  it("GTC = 0 → required error; positive value → no error", () => {
    expect(validateCargoHeader(0, 0).some((i) => i.field === "gtc")).toBe(true);
    expect(validateCargoHeader(12000, 0).some((i) => i.field === "gtc")).toBe(false);
  });
});

describe("Published constants", () => {
  it("CARGO_FIELDS.gtc requires non-zero", () => {
    expect(CARGO_FIELDS.gtc.nonZero).toBe(true);
    expect(CARGO_FIELDS.gtc.required).toBe(true);
  });
  it("SEQUENCE_FIELDS.expDa is optional (DA can be 0)", () => {
    expect(SEQUENCE_FIELDS.expDa.required).toBe(false);
  });
});