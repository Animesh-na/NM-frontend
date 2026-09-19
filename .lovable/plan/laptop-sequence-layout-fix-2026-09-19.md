# Laptop sequence layout fix

## Goal
Keep sequence port names and entered numeric values readable on common 13–14 inch laptop screens without changing voyage calculations.

## Changes
- Give the sequence table a stable minimum width with a clear horizontal scrollbar instead of compressing fields until values are clipped.
- Widen the Port column and keep the port search field usable alongside the cargo selector.
- Adjust compact numeric inputs so their text area remains visible, including select-arrow and icon spacing.
- Reduce the open summary panel width at laptop breakpoints to return more space to the sequence section while preserving the existing desktop width.
- Keep the current full-screen section option for users who need the complete table at once.

## Verification
- Check the sheet at 1190×639 and a standard 1366×768 laptop viewport.
- Confirm long port names remain readable, entered values are not clipped, and the sequence scrolls horizontally without overlapping fields.
- Confirm wide desktop behavior remains unchanged.
