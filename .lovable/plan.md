# Cargo Section Overhaul — Implementation Plan

## 1. Terminology & Daily Hire removal (Cargo Section UI)
**File:** `src/components/voyage/CargoSection.tsx`
- Rename label "NTC" → keep, and rename existing "GTC" tooltip to remove "Daily Hire" reference.
- **Remove** the "Daily Hire" input field entirely.
- "NTC" becomes the single editable daily-rate field (replaces what Daily Hire was driving).
- Wiring: `hireRate` in `VoyageContext` is renamed conceptually to "NTC" — same state variable, different label and semantics:
  - User edits NTC → sets `hireRate` directly (NTC === daily hire mathematically).
  - GTC stays as derived/editable field: `GTC = NTC / (1 - tcComm%)`, editing GTC back-calculates NTC.
- Update tooltip strings: replace any "Daily Hire" copy with "NTC".

## 2. Cargo → Route Mapping (new data model)
**File:** `src/context/VoyageContext.tsx`
- Add to each loading/discharging `SequenceRowUI`:
  ```ts
  assignedCargoIds: number[]; // cargo.id values assigned to this port
  ```
- Defaults: when a port is added, `assignedCargoIds = []` (UI shows a selector to assign).
- Helper: `getCargoLoadPorts(cargoId)` / `getCargoDischargePorts(cargoId)` derived selectors.

**File:** `src/components/voyage/SequenceTable.tsx`
- Add a small multi-select chip control "Cgo Map" next to the existing cargo/port cell (loading + discharging rows only). Shows chips `#1`, `#2`… Clicking toggles assignment.
- Max 5 cargos already enforced by add-cargo cap.

## 3. Strict cargo quantity validation
**New file:** `src/utils/cargoValidation.ts`
- `validateCargoAssignments(cargos, sequence)` returns `{ errors: { cargoId, message }[] }`.
- Rules per cargo:
  - Sum of `quantity` from all loading rows where `assignedCargoIds` includes this cargo === Sum of discharge quantities for same cargo.
  - No mismatch / over / under discharge.
  - At least one load port and one discharge port if cargo has rate > 0.
- Display: inline red banner in CargoSection per cargo + small inline warning icon on offending sequence rows.
- Block `results` recompute path? No — keep computing but expose `cargoValidationErrors` in context; VoyageSummary shows blocking banner when errors exist.

## 4. Per-cargo Gross Rate (split allocation)
**File:** `src/hooks/useVoyageCalculation.ts`
- For each cargo, compute `cargoLoadedQty` = sum of loads assigned.
- `cargoGrossFreight = rate * cargoLoadedQty` (or lumpsum).
- `totalGrossFreight = Σ cargoGrossFreight`.
- New result: `perCargoBreakdown: { cargoId, qty, grossFreight, share, allocatedVoyageCost, allocatedBunker, allocatedPortCosts, grossRate }[]`.
- `share = cargoGrossFreight / totalGrossFreight` (fallback to qty share when all lumpsum / zero).

## 5. Route-bounded bunker & port-cost allocation
**File:** `src/hooks/useVoyageCalculation.ts`
- For each cargo, identify the contiguous route window: from first assigned load port to last assigned discharge port (in sequence order).
- Sum bunker fuel days + port DA only for sequence legs **within** that window.
- Repositioning legs (`type === "repos"`) and any leg outside any cargo's window are accumulated into a separate `repositioningCost` bucket and **excluded** from per-cargo allocation.
- Overlapping windows (multi-cargo on same legs): split proportionally by cargo qty on that overlap.

## 6. Backward compatibility
- If `assignedCargoIds` is missing/empty on a port: fall back to current behaviour (qty split equally across cargos, no route bounding) — existing sheets keep working.
- Validation only fires when at least one cargo has explicit assignments.

## 7. Tests
- Extend `src/test/unit/cargoEconomics.test.ts`:
  - Multi-cargo split proportional to qty.
  - Route window excludes repos legs from per-cargo cost.
  - Validation: load 50k, discharge 30k → error.
- Add `src/test/unit/cargoMapping.test.ts` for `validateCargoAssignments` and allocation math.

## Out of scope
- No DB schema change (assignments live in sheet JSON which already persists `sequence` and `cargos` whole).
- No Excel export update in this pass (flagged as follow-up).

---

### Technical notes
- `hireRate` state variable name kept (avoid migration); only label/UX changes.
- Allocation algorithm uses leg-indexed share map keyed by cargoId to keep `useVoyageCalculation` deterministic.
- All validation runs in a derived `useMemo` in `VoyageContext`, exposed as `cargoValidationErrors`.
