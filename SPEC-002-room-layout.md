# Decision record — Brief 002 (rotation + fixtures)

Increment on the live app; full SPEC not needed. Requirements trace to
`BRIEF-002-room-layout.md` (rotation, fixtures, exclusions, no-regression).

## Data / Persistence / Migration decision (authoritative)
Migration `003_room_layout.sql` (additive; safe on live data):
- `tables` + `orientation TEXT NOT NULL DEFAULT 'horizontal'` CHECK in ('horizontal','vertical').
  Existing rows default horizontal — zero behavior change until a user rotates.
- New `fixtures` table: `id TEXT PK`, `event_id` FK CASCADE, `label TEXT NOT NULL`,
  `ftype TEXT NOT NULL DEFAULT 'custom'`, `shape` CHECK ('rect','round'),
  `w/h/x/y DOUBLE PRECISION` (explicit size → rect rotation = swap w/h; future resize free),
  `created_at`. Index on event_id.
- Runner: existing numbered-SQL mechanism at startup. Forward-only. No seed/backfill.
- Seat assignments live on `guests(table_id,seat_index)` — rotation changes only rendered
  seat *positions*, never indices → assignments survive rotation by construction (asserted in e2e).

## API
- `PATCH /api/tables/:id` accepts `orientation`.
- Fixtures CRUD: `POST /api/events/:id/fixtures` (ftype preset or custom label),
  `PATCH /api/fixtures/:id` (label/x/y/w/h), `DELETE /api/fixtures/:id`.
  `GET /api/events/:id` includes `fixtures`. Export/capacity code paths untouched
  (fixtures are a separate table → excluded by construction).

## Frontend
- Rotate control (⟳) on long/head tables: toggles orientation; vertical = seat points
  rotated 90° (head keeps one-sided seating); labels always upright.
- Add-menu becomes "Add to room": Tables | Fixtures (presets: DJ booth 140×70, Buffet
  220×70, Bar 180×70, Dance floor 260×160, Stage 240×100, Cake table 90ø, Gift table
  110×70, Custom…). Fixture nodes reuse the approved dance-floor zone styling (dashed,
  tinted, uppercase label); drag/rename/rotate/delete tools; no seats → un-seatable.
- Templates place a Dance floor (mixed also adds DJ booth), scaled to canvas.

## Verification
- e2e additions: rotate persists + assignments intact; fixture create→rename→move→delete
  persists; export contains no fixture rows.
- ui-verify: new frames — vertical banquet w/ upright label; organized room (dance floor
  + DJ booth + buffet + seated tables) at 160-guest scale; add-to-room menu. Local gate →
  push → live confirmation pass. design-critic on new frames.

## Human gates
None fire (free plan unchanged, no secrets, additive migration, no deletion of data).
