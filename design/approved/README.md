# Approved design — grading oracle

Source: Claude Design project **wedding-seating-design** (`f4b333a2-8ef5-4011-90ea-362ebf92972b`),
screens `01_home`, `02_first_run_canvas`, `03_floor_plan_working`.

Approval: reviewed by Neal via rendered screenshots in chat (2026-07-03, mobile —
Claude Design canvas is desktop-only). Change requests, if any, iterate through the
design-loop skill and re-sync here.

**`frames/*.png` are the ui-verify grading oracle**: the shipped app's corresponding
states must match these frames in layout, hierarchy, palette, and spacing intent
(not pixel-identity). `../tokens.css` carries the canonical design tokens; the app's
stylesheet must consume the same values.

Key design commitments the build must honor:
- Home: editorial hero + celebration cards with seating-progress bars + dashed
  "New celebration" card.
- First-run room: ghost table outlines + "Your room awaits" card with template
  starts (Classic rounds / Banquet rows / Mixed room) + guest CSV import panel.
- Floor plan: tables visually sized by capacity (12-round > 8-round > sweetheart-2),
  banquet + head-table (blush gradient) variants, seats as dots with guest initials,
  sage "full" ring, dance-floor zone, zoom controls, legend pill.
- Guest panel: progress bar, search, To place / Seated / All filters, party cards
  with "Seat together →", singles as draggable chips.
