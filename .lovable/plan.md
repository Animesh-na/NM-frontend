# Compact Sequence layout

## Goal
Fit every Sequence (ECO) field within a 1280px laptop viewport without horizontal scrolling or changing voyage calculations.

## Changes
- Replace the wide fixed-width table sizing with a shared responsive grid template using compact `minmax()` and fractional columns.
- Group Distance with ECA, Sea days with WD/sea margin, and Qty with mt/d (or tanker laytime) inside stacked compact cells.
- Give Cargo its own narrow column while keeping Type, Port, Fuel, Terms, Coeff, Turn, Extra, Draft, DA, and row actions visible.
- Make all cells and controls shrink safely with `min-width: 0`; truncate port names with an ellipsis and preserve the full name in its tooltip.
- Automatically start the right summary panel collapsed at laptop widths while retaining its manual expand/collapse control and normal desktop width.
- Preserve existing calculations, validation, menus, dialogs, row actions, and large-screen styling.

## Verification
- Check the voyage sheet at 1280×768 and 1191×639 with no horizontal scrollbar in Sequence.
- Confirm every field remains editable and port names truncate instead of overflowing.
- Check a wide desktop viewport to ensure the layout remains balanced.
