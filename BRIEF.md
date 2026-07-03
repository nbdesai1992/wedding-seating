# Brief: Wedding Seating Planner

## Objective
Ship an elegant, bride-friendly web app for planning wedding seating — create events, lay out tables spatially, import a guest list, and assign guests to seats by drag-and-drop.

## What it does
Anyone with the link lands on a shared admin view listing all events (no auth yet — global for now). They create a new event, then open a drag-and-drop floor-plan canvas to place tables (round/long, with seat counts) anywhere on the layout. They import a guest list via CSV, drag guests from a side panel onto table seats, and export a CSV of the final table assignments. The look and feel is warm, elegant, and a joy to use — designed to delight the bride.

## Acceptance criteria (verified on the LIVE url)
- The landing view lists all existing events and lets anyone create a new event; events persist and are visible to any visitor.
- Inside an event, tables can be added and freely placed/moved on a 2D canvas via drag-and-drop; positions and seat counts persist across reload.
- A guest list can be imported by uploading a CSV; imported guests appear in an unassigned panel.
- Guests can be assigned to a table/seat by drag-and-drop, reassigned, and unassigned; assignments persist across reload.
- The current table assignments can be exported as a downloadable CSV.
- An automated test confirms the end-to-end path: create event → add tables → import guests CSV → assign guests → export CSV reflects the assignments.

## Constraints
- Free Render plans only.
- No user authentication yet — all events are global and visible to anyone with the link (admin-style view). Auth is a later phase.
- No secrets required.

## Execution: in-session

## Done / Stop
- Done when all acceptance criteria pass on the live URL.
- Stop and flag only on a genuine human gate (spend, secrets, destructive action, or a one-time repo-access grant), with everything shipped so far.
