# Sequence Section — Unit Tests

Heading-wise scenarios that mirror the QA checklist for the voyage sequence.
Every file uses custom inputs (see `src/test/helpers/scenarios.ts`) and asserts
against the real calculation engine or the shared validators.

| File | Covers |
| --- | --- |
| `01_portSequenceValidation.test.ts` | same-port 0nm, 30-port cap, discharge-before-load, per-cargo order, 0–30,000nm range |
| `02_cargoQuantityValidation.test.ts` | quantity required at load & discharge, load == discharge balance |
| `03_portDaysCalculation.test.ts` | working days, term coefficients (default + custom), extra time, roll-up |
| `04_seaDaysCalculation.test.ts` | ballast, laden, ECA, non-ECA, weather delay (extra at-sea) |
| `05_fuelConsumptionCalculation.test.ts` | ECA vs non-ECA sea fuel, port fuel, total voyage fuel |
| `06_apiTesting.test.ts` | distance API happy path + invalid/timeout/unavailable fallbacks |
| `07_shipIntakeCalculation.test.ts` | Winter/Summer/Tropical draft transitions & intake update |
| `08_inputRangeValidation.test.ts` | min/max/just-below/just-above boundaries per sequence field |

Run just this folder:

```bash
bun run test src/test/unit/sequenceSection
```