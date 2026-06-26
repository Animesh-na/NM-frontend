# Unit Testing — How to Run, Read & Extend

All unit tests live under `src/test/unit/` and are grouped **section by section**
to match the voyage calculator UI:

| File | Covers |
| --- | --- |
| `01_vesselSection.test.ts`   | Speed profile, scrubber routing, reward factor |
| `02_sequenceSection.test.ts` | Distance, sea/port days, total voyage days |
| `03_bunkerSection.test.ts`   | Fuel consumption, ECA switch, bunker cost |
| `04_cargoSection.test.ts`    | Gross/Net freight, commissions, TCE/NTCE/GTCE, P&L |
| `05_miscSection.test.ts`     | Misc, canal, extra-time, cost roll-up |
| `06_emissionSection.test.ts` | CO₂ totals, CII rating, EU ETS |
| `07_validation.test.ts`      | Numeric ranges, required fields, MAX limits |

Shared inputs live in:
- `src/test/helpers/mockVesselData.ts` — vessel fixtures
- `src/test/helpers/mockSequenceData.ts` — sequence / cargo / bunker fixtures
- `src/test/helpers/scenarios.ts` — **`buildInputs(overrides)`** factory

## 1. Running the tests

```bash
# Run everything once
bun run test

# Watch mode — re-runs on file save
bun run test:watch

# Run a single file
bun run test src/test/unit/03_bunkerSection.test.ts

# Run a single test by name (substring match)
bun run test -- -t "totalBunkerCost"

# Verbose console + JSON report saved to test-reports/
bun run test:report
```

The verbose reporter prints each `describe` and `it` line with ✓ / ✗ status and
the failing expectation. The JSON file (`test-reports/test-report.json`) is
machine-readable for CI dashboards.

## 2. Reading the output

```
 ✓ src/test/unit/03_bunkerSection.test.ts (7)
   Bunker Section
     Consumption
       ✓ no-scrubber vessel: HSFO=0, VLSFO>0, LSMGO>0
       ✓ ECA fuel breakdown is LSMGO-only ...
     Cost
       ✓ totalBunkerCost = Σ(consumption × price)
       ✗ zero prices → zero total cost
         AssertionError: expected 12.34 to be 0
```

- Each `describe` block = scenario group (e.g. "Cost").
- Each `it` block = one assertion scenario with a plain-English title.
- Failure prints the exact expected vs received value with file/line.

## 3. Adding your own test

Pick the right section file (or create `0X_yourSection.test.ts`) and follow
this template:

```ts
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVoyageCalculation } from "@/hooks/useVoyageCalculation";
import { buildInputs } from "../helpers/scenarios";

describe("My Scenario", () => {
  it("describes the assertion in plain English", () => {
    const r = renderHook(() =>
      useVoyageCalculation(buildInputs({ hireRate: 20000 })),  // 👈 only override what you need
    ).result.current;

    expect(r.totalVoyageDays).toBeGreaterThan(0);
    expect(r.pAndL).toBeCloseTo(123456, 0);   // tolerance: 0 decimals
  });
});
```

### Useful matchers
| Matcher | Use case |
| --- | --- |
| `toBe(value)` | exact equality (numbers, strings, booleans) |
| `toBeCloseTo(value, digits)` | floats — second arg = decimals tolerance |
| `toBeGreaterThan / toBeLessThan` | range bounds |
| `toContain(item)` | arrays / strings |
| `toEqual([])` | deep equality (objects/arrays) |

### Tips
- **Always override via `buildInputs({ ... })`** — keeps the test minimal and
  immune to fixture changes.
- For validation tests, import directly from `@/utils/validation` and assert
  against the returned `ValidationIssue[]`.
- Group related assertions inside one `describe` block — Vitest prints the
  group header once, making failures easier to scan.

## 4. CI / regression

`bun run test` exits with code 0 on success, 1 on any failure. Wire it into
CI as the gate; `test:report` additionally writes JSON for dashboards.