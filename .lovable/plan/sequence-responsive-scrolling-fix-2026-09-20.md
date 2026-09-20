# Sequence responsive scrolling fix

## Goal
Make the Sequence table fill available space without showing a horizontal scrollbar when its readable column minimums fit, while preserving horizontal scrolling whenever they do not. No calculation, data, API, or workflow logic will change.

## Changes
- Replace the oversized fixed table minimum with a single content-based grid width derived from the real readable minimum of each Sequence column.
- Let flexible columns, especially Port, absorb spare width while preventing numeric and composite fields from shrinking below their required readable sizes.
- Remove sticky positioning from Type and Port so the header and every row scroll together as one table.
- Keep exactly one horizontal overflow container using `overflow-x: auto`; remove the permanent scrollbar gutter and extra scrollbar spacing that currently suggests overflow even when the table fits.
- Preserve the existing visible scrollbar styling only for genuine overflow.
- Ensure the flex layout naturally recalculates the table viewport whenever Voyage Summary opens or closes, without JavaScript width calculations.

## Technical details
- Keep the current Sequence event handlers, state updates, dialogs, validation, tanker/dry-bulk conditions, and calculations unchanged.
- Use matching CSS Grid templates for headers and rows, with `minmax(minimum, flexible-share)` tracks and a table `min-width` equal to the sum of those minimums.
- Keep the Sequence section and its parent containers at `min-width: 0` so the scroll boundary remains local to the table.
- Remove all `sticky`, `left-*`, and sticky z-index/background classes from Type and Port cells.

## Verification
- Check 400×879, 1366×768, 1440×900, and 1920×1080.
- At each desktop width, test Summary open and closed; confirm the scrollbar appears only when the column minimums exceed available width.
- Confirm Type, Port, Cargo, Quantity, Rate/DA-related row content, and actions move together during horizontal scrolling.
- Confirm maximum-capacity values remain readable and Sequence controls still work.
- Run the focused Sequence tests and the project’s existing automated checks.
