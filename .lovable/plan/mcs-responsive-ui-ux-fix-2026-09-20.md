# MCS responsive UI/UX fix

## Goal
Make the existing MCS workbook dashboard and voyage editor fully usable at 400×879, 1366×768, 1440×900, and 1920×1080 without changing calculations, APIs, persistence, ownership rules, or workflows.

## Implementation

### 1. Mobile editor and read-only behavior
- Add a dedicated mobile Calculator/Summary view switch in the editor shell. Summary will occupy the full available content area; the calculator will be unmounted from view rather than compressed beside it, and the same control will return to the calculator.
- Keep the desktop summary sidebar and its collapse control unchanged in purpose, while making the mobile switch available in editable and read-only sheets.
- Replace blanket read-only pointer blocking with scoped edit protection: data-entry fields and mutating actions remain unavailable, while sheet tabs, scrolling, section collapse/fullscreen, summary switching, information controls, and navigation remain usable.
- Keep existing save events, sheet hydration, validation, calculations, and context state intact.

### 2. Mobile navigation, header, and footer
- Split sheet tabs from global sheet actions on narrow screens: tabs get their own horizontal scroll strip, while Copy, New Sheet, Intake Calculator, Save, and the read-only status remain in an accessible action row/menu.
- Increase touch areas for tab close, section controls, sequence actions, pagination, and icon-only buttons; add accessible names and visible keyboard focus states.
- Reflow the editor header actions without clipping and simplify the mobile footer so it does not consume unnecessary calculator height on laptops.
- Make Copy/Compare dialogs adapt to a single-column mobile layout while retaining their current selection workflow.

### 3. Workbook dashboard
- Render workbooks as mobile cards with readable metadata and always-visible Open/Delete actions; keep Copy/Compare available in the mobile dashboard action area.
- Retain the desktop table and reserve a fixed action slot so Open aligns identically whether Delete is available or not.
- Stack New Workbook inputs/actions on phones, prevent title/action overflow, and improve pagination labels and touch targets.
- Preserve current ownership, opening, copying, deletion, searching, and pagination behavior.

### 4. Field sizing and table architecture
- Introduce shared responsive field-size and unit classes in the design system rather than isolated per-screen shrink rules.
- Apply numeric minimum capacities to Vessel, Sequence, Cargo, Bunker, Misc, and regulatory inputs, including 8-digit DA, 6-character coefficient, 6-digit quantity/rate, 7-digit demurrage/despatch, and 9-digit Gross BB values with decimal/sign/unit space.
- Right-align numeric inputs and outputs; center string/select inputs consistently. Keep empty inputs large enough to tap.
- Increase Sequence’s intrinsic minimum width from the sum of readable column minima and allow horizontal scrolling whenever that width does not fit. Keep compact rows and make Type/Port identity columns sticky where practical.
- Preserve row/header alignment and every existing handler, dialog, dropdown, validation state, and calculation path.

### 5. Ports and units
- Add a small developer/data rule sheet documenting original name, normalized primary name, character count, and recommended compact/mobile display, including the 49-character Dalian reference and alternate-name stripping example.
- Display primary port names with intelligent ellipsis, preserve meaningful identification width, and expose full names through a touch-accessible interaction in addition to desktop title text; do not alter stored/API port data.
- Unify `$ / mt`, `$ / t`, `mt`, `%`, and related suffixes with the existing secondary unit treatment, including Rate, EU ETS, and UK ETS.
- Compact the Rate/Lumpsum selector to `$ / mt` and `Lump ($)` while retaining a readable minimum rate input.

## Verification
- Run focused type/tests after presentation-only edits.
- Exercise dashboard and editor flows with Playwright at 400×879, 1366×768, 1440×900, and 1920×1080.
- Verify editable and read-only Summary open/close, sheet switching, horizontal scrolling, dropdowns, fullscreen, Save, Copy, New Sheet, workbook actions, port full-name access, DA/coeff display capacity, touch targets, and absence of clipped controls.
- Confirm no calculation, formula, API, database, ownership, or persistence files were changed; report any remaining limitations in a short QA summary.
