# Sequence maximum-value fit

## Goal
Keep every Sequence input readable at its allowed maximum while fitting the full dry-bulk and tanker row without horizontal scrolling at 1366×768. Below that width, one scrollbar will appear only when the compact minimum tracks no longer fit.

## Changes
- Recalculate each Sequence column from its longest valid value, control affordances, and cell padding rather than broad generic minimums.
- Reduce the shared dry-bulk and tanker grid tracks to those measured minimums, prioritizing Port and paired Distance/ECA fields while keeping every input on one line.
- Tighten only Sequence input/select spacing and paired-field proportions where needed; retain right-aligned tabular numbers and full-value visibility.
- Keep a single `overflow-x: auto` wrapper and set the table minimum width to the exact sum of the compact tracks, so 1366×768 fits and narrower screens scroll as soon as values would otherwise clip.
- Preserve all calculations, validation limits, data handling, dialogs, row controls, and dry-bulk/tanker behavior.

## Verification
- Check dry-bulk and tanker Sequence layouts at 1366×768 with the Summary collapsed: no horizontal scrollbar and maximum values fully visible.
- Check just below the minimum width: one horizontal scrollbar appears and the whole table, including Port, scrolls together.
- Confirm representative maxima for Distance/ECA, Quantity, Coefficient, Turn/Extra, Draft, and DA remain readable.
- Run the focused Sequence tests.
