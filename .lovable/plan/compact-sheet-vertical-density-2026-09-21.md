# Compact Sheet Vertical Density

## Goal
Reduce the voyage sheet’s vertical footprint by about 20–25% while preserving every field, action, calculation, and current horizontal arrangement.

## Changes
- Tighten shared section headers, form controls, labels, unit suffixes, subsection rows, and action controls vertically.
- Reduce internal vertical padding and gaps in Vessel, Sequence, Cargo, Bunker, Miscellaneous, Notes, the sheet workspace, and summary areas.
- Keep all existing column widths, wrapping breakpoints, field order, and horizontal overflow behavior unchanged.
- Preserve usable mobile controls where compact desktop sizing would otherwise make touch interaction difficult.

## Validation
- Check the sheet at laptop and mobile viewport sizes for clipping, overlap, unexpected wrapping, or new scrolling.
- Run focused voyage UI tests to confirm behavior and calculations remain unchanged.

## Technical details
The change will primarily use shared density rules in the existing design system, with narrowly scoped class adjustments only where local spacing bypasses those shared rules. No state, formulas, APIs, persistence, or data structures will change.
