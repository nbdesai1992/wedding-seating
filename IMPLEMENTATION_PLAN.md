# IMPLEMENTATION PLAN — Wedding Seating Planner

## Data / Persistence / Migration Decision (authoritative)
**Persistence:** PostgreSQL (`wedding-seating-db`, `basic_256mb`), accessed via `pg` pool using `DATABASE_URL` (SSL in prod).

**Schema** (migration `001_init.sql`):
- `events` — `id UUID PK default gen_random_uuid()`, `name TEXT NOT NULL`, `event_date DATE NULL`, `venue TEXT NULL`, `created_at TIMESTAMPTZ default now()`
- `tables` — `id UUID PK`, `event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE`, `label TEXT NOT NULL`, `shape TEXT NOT NULL CHECK (shape IN ('round','long'))`, `seats INT NOT NULL CHECK (seats BETWEEN 1 AND 20)`, `x DOUBLE PRECISION NOT NULL default 100`, `y DOUBLE PRECISION NOT NULL default 100`, `created_at TIMESTAMPTZ default now()`
- `guests` — `id UUID PK`, `event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `email TEXT NULL`, `notes TEXT NULL`, `table_id UUID NULL REFERENCES tables(id) ON DELETE SET NULL`, `seat_index INT NULL`, `created_at TIMESTAMPTZ default now()`
- Assignment is stored inline on `guests` (`table_id` + `seat_index`); unassigned = both NULL. Partial unique index `(table_id, seat_index) WHERE table_id IS NOT NULL` prevents two guests in one seat.

**Migration mechanism:** numbered SQL files in `migrations/` + a `schema_migrations(version TEXT PK, applied_at TIMESTAMPTZ)` tracking table + a runner `src/migrate.js` that applies unapplied files in order inside a transaction. Wired to Render via `preDeployCommand: node src/migrate.js`. `gen_random_uuid()` needs `pgcrypto` → migration `001` does `CREATE EXTENSION IF NOT EXISTS pgcrypto` first. No `CREATE TABLE IF NOT EXISTS`-on-boot.

**Seed/backfill:** none. **Rollback posture:** forward-only (no down migrations; scope is small). **Verification:** `migrate.js` is idempotent — re-running applies nothing; asserted in the e2e by hitting a fresh DB then re-running.

Generated/local DB artifacts are never committed. `.ship/` and `node_modules/` gitignored.

## Bounded steps (each ends in a commit + a check)
1. **Scaffold** — `package.json` (Node 20, deps: express, pg, multer), `.gitignore`, `render.yaml`, `/healthz`. Check: `npm ci` + server boots, `/healthz` 200.
2. **Migrations** — `migrations/001_init.sql`, `src/migrate.js` runner + `schema_migrations`. Check: run against local Postgres (or skip w/ clear log if none) → tables exist, re-run idempotent.
3. **API: events** — `GET /api/events`, `POST /api/events`, `GET /api/events/:id` (with tables+guests). Check: curl create→list round-trips.
4. **API: tables** — `POST /api/events/:id/tables`, `PATCH /api/tables/:id` (x/y/label/seats), `DELETE /api/tables/:id`. Check: create + move persists.
5. **API: guests + CSV import** — `POST /api/events/:id/guests/import` (multipart CSV; tolerant headers, require `name`), `GET` list via event. Check: upload sample CSV → guests created.
6. **API: assignment** — `PATCH /api/guests/:id` (set/clear `table_id`,`seat_index`; reject seat collision). Check: assign→reassign→unassign persists.
7. **API: CSV export** — `GET /api/events/:id/export.csv` → guest,table,seat,unassigned. Check: header + rows reflect state.
8. **Frontend** — single-page app: home (list/create events), event canvas (pointer-drag tables, add/edit/delete), unassigned panel, drag guests to seats, import/export buttons; elegant styling (serif display, blush/ivory/sage, cards). Check: manual click-through locally.
9. **E2E test** — `test/e2e.mjs`: boot server on test DB, create event → add tables → import guests CSV → assign → GET export.csv, assert mapping. Wire `npm test`. Check: `npm test` green.
10. **Docs** — `README.md` (run, env, migrate, test). Commit.

## Verification plan
- **Local preflight:** `npm ci`; run migrations against a local/ephemeral Postgres; `npm test` (e2e) green; manual UI click-through of all 5 flows.
- **Live (on Render URL):** after deploy, verify deployed commit SHA; then exercise: create event (reload shows it) [AC1]; add+move table (reload persists) [AC2]; import CSV (panel populates) [AC3]; assign/reassign/unassign (reload persists) [AC4]; download export.csv and confirm mapping [AC5]; confirm styled UI renders [AC7]. AC6 satisfied by `npm test` in build.

## Human-gate trigger checklist
- Non-free service plan / disk / autoscaling / paid region — **clear** (free web service).
- Paid database / keep free DB past window — **clear** (dedicated `basic_256mb` is pre-approved; not a gate).
- `sync: false` secrets / env values — **clear** (only `DATABASE_URL` from the DB; no secrets).
- Custom domain — **clear**.
- External messaging / public launch — **clear**.
- Destructive deletion — **clear**.
- Strategy/positioning commitment — **clear**.
- One-time Render GitHub-App access to a new private repo — **clear** (repo will be **public**).

**No gate fires → plan auto-approved; builder proceeds.**
