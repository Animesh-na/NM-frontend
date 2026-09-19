# Reorganize Voyage Editor Sections

## Changes
- Place Vessel and Miscellaneous together in the first row, with Vessel using 75% and Miscellaneous 25% of the available width.
- Keep Sequence as the next full-width section.
- Place Cargo on its own full-width row after Sequence.
- Place Bunker on its own full-width row after Cargo.
- Compact the Vessel particulars row so its initial search and vessel-detail controls remain on one line within the wider Vessel area.

## Technical details
- Change presentation layout classes only in the voyage editor and Vessel panel.
- Preserve every existing field, interaction, calculation, validation rule, state update, and API call.
- Allow safe horizontal overflow inside the Vessel particulars only if the viewport becomes too narrow, rather than hiding controls.
- Verify the revised layout and controls in the running preview.
