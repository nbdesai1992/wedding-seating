# Design Brief — Wedding Seating Planner

## 1. Problem & outcome
Planning a wedding seating chart is stressful and fiddly: brides juggle a spreadsheet of guests, a mental floor plan, and constant "who sits where" changes. This app makes it visual, forgiving, and genuinely pleasant — drag tables onto a floor plan, drag guests onto seats, done. **Success:** a bride can go from a raw guest CSV to a complete, exportable seating chart in one sitting, and it felt easy — even nice.

## 2. Target user & context
Primarily the **bride** (or a close planner/family member), non-technical, design-sensitive. Mostly on a **laptop/desktop** (drag-and-drop layout work wants screen space), often at a kitchen table at night with a glass of wine. Occasional phone glance to review — not for heavy editing. No login; she opens a link and works.

## 3. Core flows
**A — Create & lay out an event**
1. Land on a warm home screen listing existing events; click **New event** (name, optional date/venue).
2. Enter the event's floor plan (an open canvas).
3. Add tables — pick round or long, set seat count; each table drops onto the canvas.
4. Drag tables to arrange them like the real room; positions save automatically.

**B — Import guests & seat them**
1. Click **Import guests**, upload a CSV; guests appear in an **Unassigned** side panel with a live count.
2. Drag a guest from the panel onto an open seat at a table; the seat fills, the count drops.
3. Reassign by dragging to another seat/table; remove by dragging back to the panel. Everything persists.

**C — Export**
1. Click **Export CSV**; download a file mapping each guest to their table (and seat), including still-unassigned guests.

## 4. Scope (v1)
- Home: list all events, create event.
- Floor-plan canvas: add round/long tables with seat counts, drag to position, rename/delete table.
- Guest CSV import into an unassigned panel (tolerant of common headers; `name` required).
- Drag-and-drop seat assignment / reassignment / unassignment, with per-table fill indicators.
- Auto-persist all state (events, table positions, seat counts, assignments) server-side; visible to anyone with the link.
- Export CSV of assignments.
- One automated e2e test covering create → tables → import → assign → export.

## 5. Non-goals (v1)
- No user accounts / auth / per-user privacy (events are global — explicit later phase).
- No RSVP tracking, meal choices, invitations, or emailing.
- No true-to-scale room dimensions, walls, dance floor, or print/PDF layout.
- No real-time multi-cursor collaboration (just shared persisted state).
- No mobile drag-editing polish (view/light-edit only on phones).

## 6. Visual direction
**Editorial-romantic, not "wedding clip-art."** Think a fine stationery suite: airy whitespace, a soft blush-and-ivory palette with a deep sage or dusty-rose accent, one elegant serif display face (e.g. Cormorant / Playfair) paired with a clean humanist sans (e.g. Inter) for UI. Gentle rounded cards, soft shadows, hairline dividers, generous spacing — calm and confident, never busy.
- **Tables** render as tasteful shapes (circles / rounded rectangles) with seats as small dots around the rim; filled seats show initials or a first name. Assigned tables feel "complete" with a subtle accent ring.
- **Micro-delight:** smooth drag with a slight lift/shadow, a soft snap when a guest lands in a seat, a quiet success cue when a table fills. Motion is subtle, never bouncy-cartoonish.
- **Tone of copy:** warm and reassuring ("Let's seat your guests"), first-person-plural, no jargon.
- **Density:** low. Big touch targets, clear primary actions. Empty states are inviting, not blank.
- **Responsive:** laptop-first; on phones the canvas is pannable and readable, editing gracefully de-emphasized.

## 6b. Approved design (the visual oracle)
The approved design lives in `design/approved/` (synced from Claude Design project
`wedding-seating-design`; approved by Neal via rendered screenshots, 2026-07-03).
**`design/approved/frames/*.png` are the grading oracle** — the shipped app must match
their layout, hierarchy, palette, and spirit. Tokens: `design/tokens.css`.

## 6c. Visual acceptance rubric (graded by ui-verify from screenshots)
1. Home: editorial hero + celebration cards with seating-progress + dashed new-celebration card (per frame 01).
2. First-run room invites action: ghost tables, "Your room awaits", template starts, guest-import panel — never a bare canvas (per frame 02).
3. With a populated room, table types read at a glance: rounds sized by capacity, banquets, blush-gradient head table, sweetheart-for-2 (per frame 03).
4. With 160 imported guests, the panel stays workable: search, To place/Seated filters, party cards with "Seat together", progress bar.
5. No table overlaps or canvas-edge clipping at populated scale.
6. The bride is told when unplaced guests exceed open seats (capacity note).
7. Interactions visibly take effect (seat/reseat/unseat, seat-party) in the after-state.
8. Mobile (390px) home renders cleanly — wordmark intact, cards stacked.

## 7. Acceptance criteria (the "works" contract — verified on the LIVE url)
1. Home lists all events and a **New event** action creates one; after reload the event still appears (persisted, visible to any visitor).
2. Inside an event, adding a table (round or long, with a seat count) places it on the canvas; dragging it changes its position, and both position and seat count survive a reload.
3. Uploading a guest CSV populates an **Unassigned** panel with those guests (name required; common headers tolerated).
4. Dragging a guest onto a seat assigns them; reassigning and unassigning work; all assignments survive a reload.
5. **Export CSV** downloads a file mapping guests to their table (and unassigned guests marked as such), reflecting the current state.
6. An automated test exercises create → add tables → import guests → assign → export, asserting the export reflects assignments.
7. The live UI visibly reflects the elegant direction (serif display + soft palette + card layout) — not default unstyled HTML.

## 8. Risks / unknowns
- **Drag-and-drop reliability** across browsers (HTML5 DnD vs pointer-based lib) — pick a robust approach in spec; must not drop assignments.
- **CSV variance** — messy headers/encodings; be tolerant, require only `name`, surface a clear error on a bad file.
- **Persistence race** — rapid drags must not lose writes; debounce/position-save must be reliable and survive reload (core to criteria 2 & 4).
- **Free-tier cold start** — first live hit may be slow; verification must retry through wake.
- **Global shared state** — concurrent visitors edit the same events; acceptable for v1, note it in UI copy.
