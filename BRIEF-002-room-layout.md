# Brief 002: Room Layout — Table Rotation & Named Fixtures

## Objective
Make the floor plan a true room planner: rectangular tables can be oriented horizontal or vertical, and the bride can add named, non-seating fixtures (DJ booth, buffet, bar, dance floor, stage, cake table, …) to organize the room.

## What it adds (user-facing)
Rectangular tables (banquet and head) gain a rotate control — flip between horizontal and vertical and place them anywhere around the room; seats re-flow along the long sides and the head table keeps its seats-on-one-side character. A new "Add to room" ability places **fixtures**: preset shapes (DJ booth, buffet, bar, dance floor, stage, cake table, gift table) or a custom-named shape. Fixtures are draggable, renamable, rotatable (rectangular ones), and deletable — and are visibly *not* seating: styled like the approved design's dashed dance-floor zone, with no seats and no effect on guest counts. Room templates place a dance floor the way the approved design always showed one.

## Acceptance criteria (verified on the LIVE url)
- A banquet or head table can be toggled horizontal ↔ vertical; its seats re-arrange along the long sides (head table: still one side); orientation persists across reload; existing guest seat assignments survive rotation.
- A fixture can be added from presets or with a custom name; it renders on the canvas visually distinct from seating tables (zone styling, no seats).
- Fixtures can be dragged, renamed, rotated (rectangular ones), and deleted; all of it persists across reload.
- Fixtures never affect capacity math (open-seats warning, progress counts) and never appear in the seating CSV export.
- Guests cannot be seated on a fixture (no droppable seats).
- The automated e2e test covers: rotate-persists (with assignments intact) and fixture create → rename → move → delete → persists.

## Visual acceptance rubric (ui-verify, graded from screenshots)
- A rotated (vertical) banquet table renders with seats along its long sides and an upright, legible label — nothing rotated into unreadability.
- A room containing a dance floor, DJ booth, and buffet alongside seated tables reads as an organized wedding room at a glance; fixtures are instantly distinguishable from tables (approved frame 03's zone styling is the reference).
- The add-to-room control makes tables vs fixtures a clear choice, in the approved design language.
- No overlap/clipping regressions in default placements or templates at populated scale (160 guests).

## Constraints
- This is an increment on the live app: no regressions to existing criteria (BRIEF.md + DESIGN_BRIEF.md rubric still hold); migrations must be additive and safe on existing production data.
- Keep the approved design language (`design/approved/` + `design/tokens.css`); the fixture aesthetic extends the approved dance-floor zone from frame 03 — **no new canvas-approval round required** (design oracle already covers it); the final report's screenshots are the review surface.
- Free Render plan; no auth (unchanged); no secrets.

## Execution: in-session

## Done / Stop
- Done when all acceptance criteria above pass on the live URL **and** the visual gate (local + live ui-verify pass, design-critic blockers/majors resolved) is green, with screenshots in the report.
- Stop and flag only on a genuine human gate (spend, secrets, destructive action), with everything shipped so far.
