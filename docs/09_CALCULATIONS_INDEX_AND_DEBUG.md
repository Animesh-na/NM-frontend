# Calculations Index & Manual Debug Guide

> **Quick links**
> - [Console debug toggle](#console-debug-toggle) — silence/expand logs from DevTools
> - [`window.__voyage` inspector](#window__voyage-inspector) — poke at the latest run from the browser console
> - [Test the whole software](#test-the-whole-software) — one command to verify the full pipeline

---

## Console debug toggle

Every time the calculation engine runs (`src/hooks/useVoyageCalculation.ts`) it now logs through `src/utils/voyageLogger.ts`, which respects a single `localStorage` switch you can change live in DevTools:

```js
// In the browser console:
localStorage.VOYAGE_DEBUG = 'off'      // no logs at all
localStorage.VOYAGE_DEBUG = 'summary'  // ONLY the final summary table
localStorage.VOYAGE_DEBUG = 'on'       // collapsed group with all steps  (default)
localStorage.VOYAGE_DEBUG = 'verbose'  // expanded group with all steps
// then trigger a recalculation (edit any input) — no reload required
```

Each run produces:
1. A single collapsible group **🚢 Voyage Calculation — `<vessel>` (`<profile>`)** containing every `[Step N]` block.
2. A final `console.table` with the headline KPIs (distance, sea/port days, bunker mt + $, freight, hire, costs, P&L, TCE, CO₂, CII, ETS, FuelEU). This always prints unless `VOYAGE_DEBUG === 'off'`.

## `window.__voyage` inspector

After every calculation, the latest inputs and full result object are exposed at `window.__voyage`. Use it from DevTools to dig into anything the UI doesn't show:

```js
__voyage.inputs.cargo
__voyage.result.tce
__voyage.result.etsResult.legBreakdown
__voyage.result.fuelEuResult.fuels
copy(JSON.stringify(__voyage, null, 2))   // copy a full snapshot to the clipboard
```

## Test the whole software

A single end-to-end smoke test exercises the calculation engine, emission module, EU ETS coverage and FuelEU pricing across realistic scenarios (eco vs full, scrubber on/off, cheap bunkers, zero hire) and prints a side-by-side comparison table.

```bash
# Run just the smoke test:
bunx vitest run src/test/smoke

# Run the full test suite (unit + integration + smoke):
bunx vitest run
```

The smoke test (`src/test/smoke/overallSoftware.test.ts`) asserts the invariants that **every** voyage must satisfy — time conservation (`days = sea + port + extras`), `hire = rate × days`, `net ≤ gross`, valid CII grade, ETS phase-in within `[0, 100]`, non-negative bunker cost — and prints output like this:

```
┌──────────────────────────┬───────┬──────────┬──────────┬─────────┬──────────┐
│ (index)                  │ Days  │ Bunker $ │ Costs $  │ P&L $   │ CII      │
├──────────────────────────┼───────┼──────────┼──────────┼─────────┼──────────┤
│ Eco / no-scrubber        │ 30.16 │ 102004   │ 222004   │ 904657  │ 'A'      │
│ Full speed / no-scrubber │ 30.16 │ 121296   │ 241296   │ 885366  │ 'A'      │
│ Eco / scrubber on        │ 30.16 │ 209344   │ 329344   │ 797318  │ 'A'      │
└──────────────────────────┴───────┴──────────┴──────────┴─────────┴──────────┘
```

If this passes, the engine is wired up correctly end-to-end. To add a new scenario, append a `run("Your label", { /* overrides */ })` call to the `scenarios` array — overrides accept any subset of `VoyageInputs` (vessel, sequence, cargo, bunker, hireRate, misc, extraTime).

---

This is the single source of truth for **where every calculation lives** and **how to manually verify it** when reading or writing code. Use it as a map: pick the metric you care about, jump to the file/line, and follow the debug recipe.

---

## 1. File Map (who calculates what)

| Concern | File | Key symbols |
|---|---|---|
| Sea time per leg (Distance ÷ Speed × Sea Margin) | `src/context/VoyageContext.tsx` | `calculateSeaTime()` ~L326 |
| Distance auto-fetch (sea route + ECA split) | `src/services/marineApi.ts`, `src/utils/seaRouteDistance.ts` | `getSeaRouteDistance` |
| Port time (Qty ÷ Productivity × Terms multiplier) | `src/context/VoyageContext.tsx` | sequence row derivation |
| Voyage totals (distance, days, fuel, $, P&L, TCE, CII, ETS) | `src/hooks/useVoyageCalculation.ts` | `useVoyageCalculation()` |
| CO₂ factors, ETS coverage, CII, FuelEU | `src/utils/emissionCalculations.ts` | `calculateCo2Emissions`, `calculateEtsCost`, `calculateCiiRating`, `calculateFuelEuPenalty` |
| EU/EEA port classification fallback | `src/utils/euCountries.ts` | `isPortEuEea`, `EU_EEA_COUNTRIES` |
| Excel export (mirrors engine, with formulas) | `src/utils/excelExport.ts` | `exportVoyageToExcel` |
| Sequence summary panel (UI mirror of engine) | `src/components/voyage/SequenceSummary.tsx` | — |
| Calculation breakdown page (per-step UI audit) | `src/pages/CalculationBreakdown.tsx` + `src/components/breakdown/*` | one panel per topic |
| Vessel consumption matrix (Eco/Full × HSFO/VLSFO/LSMGO × Bal/Lad/Idle/Load/Disch/Canal) | `src/data/vessels.ts`, `src/components/voyage/ConsumptionMatrix.tsx` | `VesselData.ecoConsumption / fullConsumption` |
| Bunker prices, ROB, reward factor | `src/components/voyage/BunkerSection.tsx` | `BunkerData` |
| Intake / draft restriction | `src/components/voyage/IntakeCalculator.tsx`, `src/utils/draftRestriction.ts` | — |

---

## 2. Calculation → Source Location

### 2.1 Time
| Metric | Formula | File:Line |
|---|---|---|
| Base sea time per leg | `Distance / Speed` (non-ECA + ECA, by Eco/Full × Bal/Lad context) | `VoyageContext.tsx:326` `calculateSeaTime` |
| Sea margin time | `baseSeaTime × seaMargin%` (or API `delayHours / 24` in auto mode) | `VoyageContext.tsx:368` |
| Leg sea / ECA time (with margin) | `baseTime × (1 + margin%)` | `VoyageContext.tsx:373-376` |
| Working port days | `max(0, portDays − (turnTimeHrs+extraTimeHrs)/24)` | `useVoyageCalculation.ts:312-313` |
| Total sea days | `seaDaysBallast + seaDaysLaden + extraSeaDays` | `useVoyageCalculation.ts:398` |
| Total voyage days | `totalSeaDays + totalPortDays + extraPortDays + extraCanalDays` | `useVoyageCalculation.ts:401` |

### 2.2 Bunker consumption (AXS Marine model)
File: `src/hooks/useVoyageCalculation.ts` Step 4 (~L408-571)

| Stream | Rule |
|---|---|
| Non-ECA sea | Scrubber → HSFO rate; No scrubber → VLSFO rate. LSMGO = 0 outside ECA. |
| ECA sea | LSMGO at LSMGO Bal/Lad rate. HSFO = VLSFO = 0 inside ECA. |
| Port (load/disch/idle/canal) | Per-fuel matrix rate × days, fuel chosen via `portFuelType` (defaults LSMGO in ECA ports, scrubber→HSFO else VLSFO). |
| AE | Always LSMGO across sea + port; **0 during canal**. |
| Reward factor | Multiplies sea + AE-sea consumption only. |
| Total bunker $ | `Σ (qty_fuel × price_fuel)` Step 5 (~L373) |

### 2.3 Revenue / Costs / P&L
File: `useVoyageCalculation.ts` Steps 6–9 (~L388-436)

- `Gross Freight = rate × loadedQty` (or `lumpsum`)
- `Voyage Commission = Gross × voyComm%`
- `Net Freight = Gross − Voyage Commission`
- `Total Voyage Costs = Bunker + Port + Misc + Canal` (no commissions, no hire)
- `Hire Cost = hireRate × totalVoyageDays`
- `Voyage Result = Net Freight − Total Voyage Costs + Demurrage − Despatch`
- `P&L = Voyage Result − Hire Cost`
- `NTCE = (Net Freight − Total Voyage Costs) / totalVoyageDays`
- `GTCE = NTCE / (1 − tcCommission%)`
- `Gross Rate = (Voyage Cost incl. Hire) / loadedQty / (1 − voyComm%)` (breakeven)

### 2.4 Emissions
File: `src/utils/emissionCalculations.ts`

| Metric | Formula | Symbol |
|---|---|---|
| CO₂ per fuel | `qty × factor` (HSFO 3.114, VLSFO 3.151, LSMGO 3.206) | `calculateCo2Emissions` L187 |
| EFOI | `Total CO₂ × 10⁶ / (cargoQty × ladenDistance)` g/t·nm | `calculateEfoi` L378 |
| AFR CII | `Total CO₂ × 10⁶ / (DWT × totalDistance)` g/dwt·nm | `calculateCiiRating` L305 |
| Required CII | `a × DWT^(−c) × (1 − reductionFactor[year])` | same |
| Rating | A/B/C/D/E from `actual/required` ratio vs `CII_RATING_BOUNDARIES` (L84) | same |

### 2.5 EU ETS
File: `useVoyageCalculation.ts` (per-leg loop) + `emissionCalculations.ts` `calculateEtsCost` L234

- Coverage per leg from cargo bracket (Load → next Disch):
  - EU↔EU = 100 %, EU↔nonEU = 50 %, nonEU↔nonEU = 0 %
- Phase-in: `ETS_PHASE_IN_PERCENTAGES[year]` (2024 40 %, 2025 70 %, 2026+ 100 %)
- EU-covered fuel per fuel = `Σ legFuel × coveragePct`
- Chargeable CO₂ (mt) = `EU HSFO × 3.114 + EU VLSFO × 3.151 + EU LSMGO × 3.206) × phaseIn`
- EUA Cost ($) = `Chargeable CO₂ × CO₂ price`

### 2.6 FuelEU Maritime
File: `emissionCalculations.ts` `calculateFuelEuPenalty` L483, rates `FUEL_EU_COST_PER_TON` L454
- Per fuel: `EU-covered fuel(mt) × $/ton`
- Total penalty = sum of per-fuel costs

---

## 3. Console Debug — How to read the live trace

Every recompute prints a structured trace to the browser console. Open DevTools → Console and filter by tag:

| Tag | Where it comes from | What it shows |
|---|---|---|
| `========== VOYAGE CALCULATION START ==========` | `useVoyageCalculation.ts:263` | Start of one full recompute |
| `[Input]` | L264-268 | Vessel, hire, cargo, bunker, reward factor inputs |
| `[Step 1] Leg N` | L293 | Per-leg distance, port time, ballast/laden assignment |
| `[Step 1 Summary]` | L382 | Aggregated distances, sea/port days |
| `[Step 2-3]` | L403 | Extra time + total sea/voyage days |
| `[Step 4 ...]` | L420+ | Bunker consumption per fuel/zone (HSFO/VLSFO/LSMGO sea, port, AE, canal) |
| `[Step 5]` | bunker cost | Total bunker $ = Σ qty × price |
| `[Step 6-9]` | freight, costs, P&L, TCE | |
| `[Step 10]` | emissions | CO₂ split, EFOI, CII rating, ETS, FuelEU |
| `[VoyageContext] calculateSeaTime` | `VoyageContext.tsx:380` | Per-row sea time derivation incl. margin |

Tip: in DevTools console filter type `[Step 4` to inspect bunker only, or `Leg 3` to see one leg end-to-end.

---

## 4. Manual Verification Recipes

Use these to sanity-check any number you see in the UI / Excel.

### 4.1 Verify a leg sea time
1. Read `Distance` (non-ECA) and `ECA Distance` from the row.
2. From vessel matrix pick speed for `EV/EL/FV/FL` × `Bal/Lad`.
3. `baseSeaTime = Distance/SpeedV/24 + ECA/SpeedL/24` (speeds are kn → days = nm / kn / 24).
4. Apply margin: `total = baseSeaTime × (1 + seaMargin/100)`.
5. Compare to console `[VoyageContext] calculateSeaTime` line.

### 4.2 Verify a leg fuel
1. Identify ballast vs laden using **cargo on board before this leg** (load adds, disch subtracts). Console shows `cargoOnBoardBefore=… → assigned as LADEN/BALLAST`.
2. Sea fuel: rate from `vessel.ecoConsumption` or `fullConsumption` (per `vessel.speedProfile`), col = ballast|laden, fuel chosen by ECA flag + scrubber.
3. Multiply by leg sea days, then by `rewardFactor`.
4. Compare to `[Step 4]` console rows and to per-leg panel in `CalculationBreakdown` page.

### 4.3 Verify EU ETS chargeable CO₂
1. For each leg compute coverage % from cargo bracket (`isEuPort` for load + next disch).
2. EU fuel per type = `Σ legFuel × coverage%`. Confirm in `results.euCoveredFuel`.
3. Chargeable CO₂ = `(HSFO×3.114 + VLSFO×3.151 + LSMGO×3.206) × phaseIn`.
4. EUA $ = chargeable CO₂ × `bunker.co2Price`.
5. Excel: rows `EU_HSFOT/VLSFOT/LSMGOT` show EU-covered fuel; the chargeable CO₂ row uses these directly. Cross-check with `results.chargeableCo2` and `results.etsCost`.

### 4.4 Verify CII rating
1. `Required CII = a × DWT^(−c) × (1 − reduction[year])` from `CII_REFERENCE_VALUES` (vessel type) and `CII_RATING_BOUNDARIES`.
2. `Actual CII = totalCo2 × 1e6 / (DWT × totalDistance)`.
3. Rating from `actual/required` vs A/B/C/D/E thresholds (L84).

### 4.5 Cross-check Excel vs UI
Every number in the Excel summary has either:
- a literal value (white background), or
- an Excel formula referencing other cells of the same sheet (yellow background).

If UI ≠ Excel: open Excel, click the cell, follow `=B12*C12` references back; compare with the console `[Step …]` trace.

---

## 5. How to Add or Change a Calculation Safely

1. **Locate ownership** in §1. Calculation logic always lives in `useVoyageCalculation.ts` or `emissionCalculations.ts` — never inside components.
2. Add the formula in the engine, expose it on `VoyageResults`.
3. Add a `console.log("[Step X] …")` line next to it (mirror the existing style).
4. Surface it in:
   - `SequenceSummary.tsx` (sticky right panel) and/or
   - one of `src/components/breakdown/*Panel.tsx` (audit page).
5. Add an Excel row in `excelExport.ts` with both **Software Value** and **Excel Formula** columns so reconciliation stays automatic.
6. Add or extend a unit test under `src/test/unit/*` (one file per domain — see `cargoEconomics.test.ts`, `euEtsFuel.test.ts`, `voyageTime.test.ts`). Run: `bunx vitest run`.
7. If you changed an EU/regulatory rule, update `docs/04_EMISSION_MODULE_EXPLANATION.md` and this file.

---

## 6. Quick Pointer Cheat-Sheet

```
Sea time .................... VoyageContext.tsx          calculateSeaTime
Bunker / cost / TCE / P&L ... useVoyageCalculation.ts    useVoyageCalculation
CO₂ / CII / ETS / FuelEU .... emissionCalculations.ts    calculate*  
EU classification ........... euCountries.ts             isPortEuEea
Excel mirror ................ excelExport.ts             exportVoyageToExcel
UI summary .................. components/voyage/SequenceSummary.tsx
UI per-step audit ........... pages/CalculationBreakdown.tsx + components/breakdown/*
Tests ....................... src/test/unit/*, src/test/integration/*
```

For deeper narrative on each subsystem see the other docs in this folder (`01`–`08`). This file is the index and debug runbook.