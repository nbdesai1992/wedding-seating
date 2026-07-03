# Seat & Celebrate — Wedding Seating Planner

An elegant, bride-focused web app for planning wedding seating. Create events, arrange
tables on a drag-and-drop floor plan, import your guest list from CSV, drag guests into
seats, and export the finished chart as CSV.

> No accounts yet — every event is global and visible to anyone with the link (an
> admin-style view). User auth is a planned later phase.

## Features
- **Events** — create and list wedding events; everything persists server-side.
- **Floor plan** — add round or long tables with a seat count; drag to arrange the room. Positions persist.
- **Guest import** — upload a CSV (a `name` column is required; `email`/`notes` optional; common headers tolerated).
- **Seating** — drag guests from the unassigned panel onto seats; reassign or unseat; one guest per seat.
- **Export** — download a CSV mapping each guest to their table and seat (unassigned guests included).

## Stack
- Node + Express, PostgreSQL (`pg`), `multer` for CSV upload.
- Vanilla HTML/CSS/JS front end with pointer-based drag-and-drop (no build step).

## Run locally
Requires a PostgreSQL database.

```bash
npm ci
export DATABASE_URL=postgres://user:pass@localhost:5432/wedding_seating
npm run migrate     # apply migrations/*.sql
npm start           # http://localhost:3000
```

No local Postgres? Run the app against an in-process database for a UI smoke test:

```bash
node scripts/dev-mem.js   # uses pg-mem; data is not persisted
```

## Test
An end-to-end test drives the real HTTP API against an in-process `pg-mem` Postgres —
create event → add tables → import guests → assign → export — with no external database:

```bash
npm test
```

## Migrations
Numbered SQL files in `migrations/`, tracked in a `schema_migrations` table and applied in
order by `src/migrate.js`. On Render this runs automatically via `preDeployCommand`.

## Deploy (Render)
`render.yaml` defines a free Node web service plus a Postgres database. Migrations run as
the pre-deploy step; the service starts with `node src/server.js`.
