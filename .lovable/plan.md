# Distance handling edge cases

Three related rules to add to the sequence distance layer.

## 1. Mandatory distance when open port ≠ first operational port

When the Open port and the first following port (load / bunker / pssg / discharge / repos) resolve to different `portUnloc` codes, the distance for that leg must be > 0. If the leg's `distance + ecaDistance = 0`, the leg is invalid.

- Add a validation entry in `src/utils/validation.ts` (or wherever sequence validation lives) that flags the first non-open leg when its total distance is 0 while the ports differ.
- Surface the error inline in `SequenceTable.tsx`: red border on the distance input (V and L cells) and an error tooltip "Distance is required between {openPort} and {firstPort}".
- Also block save via the existing `hasErrors` gate in `Index.tsx`.

## 2. Back-to-back same ports → distance forced to 0

When two consecutive rows share the same `portUnloc` (or identical coordinates when unloc is empty), the leg distance and ECA distance are 0 by definition — no API call, no fallback.

- In `VoyageContext.recalculateDistances()`, add a pre-check inside the leg loop: if `prevRow.portUnloc === currRow.portUnloc` (and both non-empty), set `{ distance: 0, ecaDistance: 0, weatherDelayHours: 0 }` and `continue` before the API call.
- Also update `legKey` so cache correctly identifies this "same port" state and doesn't re-trigger.
- Ensure `calculateSeaTime` returns 0 leg time for this case (already true since distance is 0).

## 3. Editable sea margin when distance/weather-delay API fails

Currently the sea-margin cell in `SequenceTable.tsx` becomes read-only whenever `autoDistanceEnabled` is true (it displays `weatherDelayHours` from the API). When the API fails and we fall back to searoute-js, no weather delay is available — but the cell stays locked, so the user can't compensate.

- Track per-leg fallback state: when the searoute-js fallback path runs (or when `weatherDelayHours` is `undefined` after a completed recalc), mark the row with `weatherDelayFailed: true` in the distance result and merged sequence state.
- In `SequenceTable.tsx`, change the sea-margin cell condition from `autoDistanceEnabled ? readonly : input` to:
  - Show editable `seaMargin %` input when `!autoDistanceEnabled` OR `row.weatherDelayFailed === true` OR `row.weatherDelayHours === undefined`.
  - Show read-only weather delay hours only when API returned a valid `weatherDelayHours` value.
- In `calculateSeaTime` (`VoyageContext.tsx`), when `useWeatherDelay` is true but `weatherDelayHours` is undefined for a leg, fall back to applying the manual `seaMargin %` for that leg. This keeps totals sane during partial failures.
- No checkbox change — the fallback is automatic and transparent per leg.

## Files to change

- `src/context/VoyageContext.tsx` — same-port short-circuit in `recalculateDistances`; add `weatherDelayFailed` flag on fallback path; adjust `calculateSeaTime` weather-delay branch.
- `src/components/voyage/SequenceTable.tsx` — sea-margin cell renders editable input when API/weather delay unavailable; add red-border error state on distance cell for the mandatory-distance case.
- `src/utils/validation.ts` — add "distance required between open and first port" validation rule.

## Out of scope

- Changing the auto-distance checkbox UX.
- Changing how the Marine API proxy is called (already covered by prior searoute-js fallback).
- Historical sheets: existing saved rows without the `weatherDelayFailed` flag default to false, so behavior is backward-compatible.
