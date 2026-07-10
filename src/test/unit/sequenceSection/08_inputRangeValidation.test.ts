import { describe, it, expect } from "vitest";
import {
  SEQUENCE_FIELDS,
  validateNumeric,
  validateSequence,
  type NumericFieldConfig,
  type SequenceRowForValidation,
} from "@/utils/validation";

/**
 * UNIT — Input Range Validation for the Sequence section.
 *
 * Every editable numeric input is validated against its documented min/max.
 * Boundary values (min, max, just-below-min, just-above-max) are checked and
 * an appropriate message is produced.
 */

function boundaryCases(cfg: NumericFieldConfig) {
  return [
    { value: cfg.min, kind: "min", valid: true as const },
    { value: cfg.max, kind: "max", valid: true as const },
    { value: cfg.min - 1, kind: "below min", valid: false as const },
    { value: cfg.max + 1, kind: "above max", valid: false as const },
  ];
}

describe("Sequence input range validation", () => {
  Object.entries(SEQUENCE_FIELDS).forEach(([field, cfg]) => {
    describe(`${field} (${cfg.label}) — allowed range [${cfg.min}, ${cfg.max}]`, () => {
      boundaryCases(cfg).forEach(({ value, kind, valid }) => {
        it(`${kind} value ${value} → ${valid ? "accepted" : "rejected"}`, () => {
          const msg = validateNumeric(value, cfg);
          if (valid) {
            // nonZero required fields still reject 0.
            if (cfg.nonZero && cfg.required && value === 0) {
              expect(msg).toBe("This field is required");
            } else {
              expect(msg).toBeNull();
            }
          } else {
            expect(msg).toBe(`Value must be between ${cfg.min} and ${cfg.max}`);
          }
        });
      });

      if (cfg.required) {
        it("empty value → required error", () => {
          expect(validateNumeric("", cfg)).toBe("This field is required");
        });
      }

      it("non-numeric string → 'Only numeric values are allowed'", () => {
        expect(validateNumeric("abc", cfg)).toBe("Only numeric values are allowed");
      });
    });
  });
});

describe("Sequence — boundary values propagate through validateSequence", () => {
  const baseRow = (over: Partial<SequenceRowForValidation> = {}): SequenceRowForValidation => ({
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

  it("distance at the upper boundary (30,000 nm) is accepted", () => {
    const issues = validateSequence([baseRow({ distance: 30_000 })]);
    expect(issues.some((i) => i.field === "distance")).toBe(false);
  });

  it("distance one unit above the upper boundary is rejected", () => {
    const issues = validateSequence([baseRow({ distance: 30_001 })]);
    expect(issues.some((i) => i.field === "distance")).toBe(true);
  });

  it("expDa at zero → required (nonZero) error", () => {
    const issues = validateSequence([baseRow({ expDa: 0 })]);
    expect(issues.some((i) => i.field === "expDa")).toBe(true);
  });

  it("quantity above 550,000 MT is rejected", () => {
    const issues = validateSequence([baseRow({ quantity: 550_001 })]);
    expect(issues.some((i) => i.field === "quantity")).toBe(true);
  });

  it("turn+extra combined above 1000 h is rejected", () => {
    const issues = validateSequence([baseRow({ turnTime: 900, extraTime: 200 })]);
    expect(issues.some((i) => i.field === "turnExtra")).toBe(true);
  });
});