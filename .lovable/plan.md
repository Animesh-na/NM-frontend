# Compact one-row Sequence layout

## Goal
Make every Sequence record a single dense 28–30px row that fits without horizontal scrolling at 1280px, while preserving every field, interaction, calculation, validation, and stored value.

## UI changes
- Replace the current stacked composite cells with one-line, non-wrapping inline groups:
  - Distance / ECA: speed-context control + distance, separator, speed-context control + ECA distance.
  - Time / WD: `SEA` value, separator, `WD` hours or the existing editable sea-margin value.
  - Quantity: `QTY` input, separator, productivity or tanker laytime input.
- Keep Type, Port, Cargo, Port Fuel, Terms, Coeff, Turn, Extra, Draft, DA, and row actions on that same row.
- Use a responsive CSS Grid track definition with `minmax(0, …fr)` priorities instead of percentage table columns, allowing Port and composite fields to retain more space while small controls compress first.
- Keep rows at approximately 28–30px with compact 11px controls, minimal gaps and padding, right-aligned numeric values, and no wrapping.
- Ellipsize long port names in-place and retain the full value in the existing title tooltip.
- Preserve the wider desktop feel by allowing flexible tracks to expand at 1440px and 1600px.
- Keep the right summary collapsed automatically below 1440px so it cannot squeeze the Sequence area; users can still reopen it.

## Scope safeguards
- Do not change event handlers, field values, voyage state, calculations, API calls, validation, conditional dry-bulk/tanker behavior, dialogs, or action controls.
- Preserve Add, Repos, Delete, port/cargo selection, distance refresh, automatic distance, departure date, fuel selection, DA behavior, and the existing Sequence summary.

## Verification
- Run the existing TypeScript check.
- Inspect the rendered Sequence at 1280px, 1366px, 1440px, and 1600px.
- At each width, confirm rows remain single-line and all controls remain reachable; at 1280px specifically confirm the Sequence container has no horizontal overflow.
- Confirm long port values ellipsize without changing their stored text and representative long numeric values remain intact and available in their inputs/tooltips.
