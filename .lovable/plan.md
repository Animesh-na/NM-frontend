
## Goal
Implement field-level validation across Vessel, Sequence, and Cargo sections, plus cross-row rules (cargo qty balance, max 5 cargoes, max 30 sequence rows, distance OR ECA distance required). Block the Voyage Summary until all required fields are valid and display a validation summary.

## 1. New shared validation module
Create `src/utils/validation.ts`:
- Field config map per section/field with `{ required, min, max, label }` from the spec.
- `validateNumeric(value, cfg)` returns `{ valid, error }` with messages:
  - empty → "This field is required"
  - NaN / non-numeric / Infinity → "Only numeric values are allowed"
  - negative or out-of-range → "Value must be between {min} and {max}"
  - speed special-case → "Speed must be greater than 0"
- `trim` strings before validation; reject NaN/Infinity.
- `validateVessel(vessel)`, `validateSequence(rows)`, `validateCargos(cargos)` returning a flat `ValidationIssue[]` (`{ id, section, rowId?, field, message }`).
- Cross-row rules:
  - Sequence: at each row, at least one of `distance` or `ecaDistance` must be > 0 (port/repos types only; not for "open"). 
  - Total port-class rows (`port` + `repos`, excluding `open`) ≤ 30 — error message "Maximum 30 ports/legs allowed".
  - Cargo: total load qty per cargo must equal total discharge qty for that cargo (use existing `cargoValidation`/`getCargoRowMap`). Reuse existing logic if it already covers this; otherwise add it.
  - Cargos length ≤ 5 (enforce in `addCargo` with toast + return).

## 2. Wire validation into VoyageContext
- Compute `validationIssues` via `useMemo` from vessel/sequence/cargos.
- Expose `validationIssues`, `hasErrors`, helper `getFieldError(section, field, rowId?)` on context.
- In `addCargo`, guard against >5 with `toast.error("Maximum 5 cargoes are allowed per voyage")`.

## 3. Per-field UI: red borders + tooltips
Touch only the input cells in:
- `src/components/voyage/VesselPanel.tsx` (DWT, GT, Cubic, Draft, TPC, Speed B/L, HSFO, VLSFO, LSMGO, AE, AE+Scrubber)
- `src/components/voyage/SequenceTable.tsx` (Distance, ECA Distance, Turn+Extra, Exp DA, Quantity)
- `src/components/voyage/CargoSection.tsx` (Rate, Demurrage, Despatch, GTC, Gross BB, Voyage Comm %, TC Comm %)

For each, look up the issue via `getFieldError(...)` and apply `aria-invalid` + `className` `border-red-500 focus-visible:ring-red-500` plus a `title` (native tooltip) with the message. No structural rewrites — just className/title conditional additions.

Validation triggers on edit (already, via onChange), paste (covered by onChange), import (state updates flow through memo), and save (see step 5).

## 4. Voyage Summary gate + error banner
In `src/components/voyage/VoyageSummary.tsx`:
- Read `validationIssues` from context.
- If any **required** vessel/cargo/sequence error or cross-row error: render a compact error panel instead of the summary numbers:
  - Header: `"X validation errors found"`.
  - Scrollable list of messages (clickable → scrolls/focuses first invalid field via `document.getElementById` — we assign deterministic ids in each input: `v-${section}-${field}-${rowId|''}`).
  - "Scroll to first" button focuses the first issue's element.
- Only when zero errors → show existing summary content.

## 5. Save / import hooks
- In `Index.tsx` save handler: before `saveCurrentSheet`, if `hasErrors` → `toast.error("X validation errors found")` and abort.
- In `JsonImportSection.tsx` (admin import): after applying state, run validation; toast count of errors if any. State still loads (so user can fix) but the summary gate blocks the totals.

## 6. Tests (light)
Add a small unit test `src/test/unit/validation.test.ts` covering:
- Empty/NaN/negative/out-of-range messages.
- Speed > 0 special case.
- Distance OR ECA distance rule.
- 6th cargo rejection helper.

## Out of scope
- No changes to calculation engine, context shape beyond exposing validation, or styling beyond red borders + the summary banner.
- No DB/migration changes.

## Files touched
- add: `src/utils/validation.ts`, `src/test/unit/validation.test.ts`
- edit: `src/context/VoyageContext.tsx`, `src/components/voyage/VesselPanel.tsx`, `src/components/voyage/SequenceTable.tsx`, `src/components/voyage/CargoSection.tsx`, `src/components/voyage/VoyageSummary.tsx`, `src/components/voyage/JsonImportSection.tsx`, `src/pages/Index.tsx`
