# Unit Testing — Custom Inputs Per Scenario

All unit tests live under `src/test/unit/` and are grouped section-by-section to
match the voyage calculator UI.

| File | Covers |
| --- | --- |
| `01_vesselSection.test.ts` | Speed profile, scrubber routing, reward factor |
| `02_sequenceSection.test.ts` | Distance, sea/port days, total voyage days |
| `03_bunkerSection.test.ts` | Fuel consumption, fuel costs, ECA switching |
| `04_cargoSection.test.ts` | Gross/Net freight, commissions, TCE/NTCE/GTCE, P&L |
| `05_miscSection.test.ts` | Misc, canal, extra-time, cost roll-up |
| `06_emissionSection.test.ts` | CO₂ totals, CII rating, EU ETS |
| `07_validation.test.ts` | Numeric ranges, required fields, max limits |

## 1. Testing approach

Unit tests should use **custom inputs inside each test case**. Do not depend on
shared business mock voyages for unit scenarios.

Use `src/test/helpers/scenarios.ts` only for shape builders:

- `createVoyageTestInputs(...)`
- `customVessel(...)`
- `customConsumptionMatrix(...)`
- `customLeg(...)`
- `customCargo(...)`
- `customBunker(...)`
- `customMiscCosts(...)`
- `customExtraTime(...)`

These builders provide valid object structure, but every important value for a
scenario should be declared in that `it(...)` block.

## 2. Running the tests

```bash
# Run everything once
bun run test

# Watch mode — re-runs on file save
bun run test:watch

# Run a single unit file
bun run test src/test/unit/03_bunkerSection.test.ts

# Run one scenario by name
bun run test -- -t "custom totalBunkerCost"

# Verbose console + JSON report saved to test-reports/
bun run test:report
```

`test:report` writes:

- `test-reports/test-report.log` — readable verbose log
- `test-reports/test-report.json` — machine-readable result for CI dashboards

## 3. Reading the output

```text
 ✓ src/test/unit/03_bunkerSection.test.ts (6)
   Bunker Section
     Consumption
       ✓ custom no-scrubber voyage consumes VLSFO and LSMGO but no HSFO
     Cost
       ✗ custom zero fuel prices produce zero bunker cost
         AssertionError: expected 12.34 to be 0
```

- Each `describe` block is a scenario group.
- Each `it` block is one business scenario.
- A failure prints the expected/received values and file line.

## 4. Adding your own custom unit test

Pick the correct section file and copy this pattern:

```ts
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import {
  createVoyageTestInputs,
  customBunker,
  customCargo,
  customLeg,
  customVessel,
} from "../helpers/scenarios";

describe("My Custom Scenario", () => {
  it("calculates P&L for my exact voyage inputs", () => {
    const inputs = createVoyageTestInputs({
      vessel: customVessel({ dwt: 82_000, speedProfile: "eco" }),
      sequence: [
        customLeg({ id: 1, operation: "load", distance: 1_200, seaTime: 4, quantity: 55_000 }),
        customLeg({ id: 2, operation: "disch", distance: 2_400, seaTime: 8, quantity: 55_000 }),
      ],
      cargo: customCargo({ quantity: 55_000, rate: 34, rateType: "mt" }),
      bunker: customBunker({
        vlsfo: { price: 625, robStart: 300 },
        lsmgo: { price: 810, robStart: 120 },
      }),
      hireRate: 16_000,
    });

    const result = renderHook(() => useVoyageCalculation(inputs)).result.current;

    expect(result.grossFreight).toBeCloseTo(55_000 * 34, 2);
    expect(result.pAndL).toBeGreaterThan(0);
  });
});
```

## 5. Validation tests

For validation scenarios, import the validation function directly and build the
exact data being tested:

```ts
const issues = validateSequence([
  { id: 1, type: "port", operation: "loading", port: "", distance: 500, expDa: 25_000 },
]);

expect(issues.some((issue) => issue.field === "port")).toBe(true);
```

## 6. Useful matchers

| Matcher | Use case |
| --- | --- |
| `toBe(value)` | exact equality |
| `toBeCloseTo(value, digits)` | decimal / float calculations |
| `toBeGreaterThan(value)` | minimum business expectation |
| `toBeLessThan(value)` | maximum business expectation |
| `toContain(item)` | arrays / strings |
| `toEqual(object)` | deep object or array equality |

## 7. Rules for maintainable tests

- Declare important input values inside the test case.
- Do not import shared mock voyage fixtures into unit tests.
- Keep one business scenario per `it(...)` block.
- Use exact expected values where possible.
- Use `toBeCloseTo` for maritime calculations with decimals.
- Add new custom scenarios by copying an existing unit test and changing only
  the explicit custom input values.

## 8. CI / regression

`bun run test` exits with code `0` on success and `1` on any failure. Use it as
the CI gate. Use `bun run test:report` when you need saved logs and JSON output.