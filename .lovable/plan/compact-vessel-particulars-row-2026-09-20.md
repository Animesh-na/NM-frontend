# Compact Vessel particulars row

## Goal
Keep Vessel search, particulars, speed settings, and L=D=I on one row at 1366×768, then allow clean wrapping on narrower screens.

## Changes
- Reduce DWT, GT/GRT, Cubic, Draft, TPC, Scrubber, and Speed Profile widths to match their readable values and labels.
- Keep the row unwrapped at laptop widths where the compact fields fit; restore wrapping below that breakpoint.
- Preserve all vessel values, validation, selectors, calculations, and the consumption matrix.

## Verification
- Confirm the Vessel controls remain in one row at 1366×768.
- Confirm controls wrap without clipping on smaller widths.
- Run the focused Vessel tests.
