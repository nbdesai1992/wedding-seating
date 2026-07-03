# SPEC — Wedding Seating Planner

## 1. Requirements (each traces to a DESIGN_BRIEF acceptance criterion)
| # | Requirement | Traces to |
|---|---|---|
| R1 | List all events; create a new event; persists across reload, visible to all | AC1 |
| R2 | Add round/long tables with seat counts; drag to reposition on a canvas; position + seats persist | AC2 |
| R3 | Import guests via CSV upload into an Unassigned panel (name required, tolerant headers) | AC3 |
| R4 | Drag-assign guests to seats; reassign; unassign; persists | AC4 |
| R5 | Export CSV mapping guests → table/seat (incl. unassigned) | AC5 |
| R6 | Automated e2e test: create → tables → import → assign → export | AC6 |
| R7 | Live UI reflects elegant direction (serif display, soft palette, cards) | AC7 |

## 2. Architecture
**Web service (Node) + dedicated Postgres.** Justification:
- Durable, globally-shared server-side state (events/tables/guests/assignments visible to any visitor) rules out a static site or browser-only storage → needs a server + database.
- No SSR/framework build complexity needed; a small **Express** API serving a **single-page vanilla JS + CSS frontend** (no bundler) keeps the build trivial and robust, and avoids a frontend toolchain as a failure source.
- **Drag-and-drop** implemented with **pointer events** (not fragile HTML5 DnD) for both tables (reposition) and guests (assign) — consistent across browsers, works with absolute-positioned canvas.
- **DB:** one dedicated `wedding-seating-db` on `basic_256mb` (pre-approved), accessed via `pg`.

Stack: Node 20 (pinned), Express, `pg`, `multer` (CSV upload) + a tiny CSV parse, plain HTML/CSS/JS front end. Test: Node's built-in `node:test` + `supertest`-style fetch against a live server, or Playwright-lite via API-level e2e. We use an **API-level e2e** (drives the real HTTP endpoints the UI uses) to keep it deterministic and CI-free.

## 3. render.yaml outline
```yaml
services:
  - type: web
    name: wedding-seating
    runtime: node
    plan: free
    rootDir: .
    buildCommand: npm ci
    startCommand: node src/server.js
    healthCheckPath: /healthz
    preDeployCommand: node src/migrate.js
    envVars:
      - key: DATABASE_URL
        fromDatabase: { name: wedding-seating-db, property: connectionString }
      - key: NODE_VERSION
        value: "20.18.0"
databases:
  - name: wedding-seating-db
    plan: basic_256mb
```
No `general_builder_keys` / `ANTHROPIC_API_KEY` — the app calls no model provider at runtime.

## 4. Non-goals & constraints
- No auth, no per-user privacy (global events — explicit later phase).
- No RSVP/meals/email/invitations, no to-scale room geometry, no PDF/print, no realtime multi-cursor.
- Free service plan; dedicated `basic_256mb` DB (pre-approved). No secrets.
- Node pinned (Render defaults drift); DB schema via migrations, never `CREATE TABLE IF NOT EXISTS` on boot.
