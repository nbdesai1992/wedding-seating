---
id: 001-frontend-only-planner-palette
title: "Frontend-Only Conversion + Planner Palette"
created: "2026-08-02T00:40:00Z"
updated: "2026-08-02T01:00:00Z"
completion: 1/7
outcome: needs-human
pending_replan: false
turn_cap: 31
---

# Frontend-Only Conversion + Planner Palette

## Overview

This app (`wedding-seating`) is the base: a beautifully styled, hand-crafted wedding seating planner (vanilla HTML/CSS/JS in `public/`, currently backed by an Express + Postgres server with a Supabase auth gate). The mission is to make it a **fully frontend-only, open-to-the-world static app**: all persistence moves to the browser (localStorage), the login gate goes dormant, the Express/Postgres layer is retired from the serving path, and it deploys as a **free Render static site** in the `nealdes.ai` workspace.

Simultaneously, its palette swaps to the superior one from the original planner app: **rose / cream / gold / warm-gray with Playfair Display + Inter**. Everything else about the styling — the editorial layout, ornaments, pills, gradients, empty states, micro-motion — is already excellent and must be preserved exactly. This is a palette-and-type swap, not a redesign.

## Scope

### In Scope
- Replace every server API call in `public/app.js` with a localStorage persistence layer (full CRUD parity for rooms/layouts, tables, seats, guests, assignments)
- Client-side CSV import (FileReader parsing replaces the multer upload endpoint)
- Remove the auth gate from the user path (no login required; auth pages left dormant on disk)
- Palette + heading-font swap to the planner tokens (mapping below)
- Unit tests for the new storage layer + browser smoke verification
- `render.yaml` rewritten for a static site; deploy + live verification in `nealdes.ai`

### Out of Scope
- Any layout/structure/copy redesign (the styling techniques stay exactly as they are)
- New features of any kind
- Maintaining or deleting the Express server, migrations, or old server tests (`src/`, `migrations/`, `test/` stay on disk, dormant)
- Re-adding authentication (deferred by the human — later brief)
- The dead `wedding-seating-ymzs` service and its database (orphans in another workspace — never touch)

## Requirements

### Functional Requirements
- [ ] **FR-1**: Browser persistence. A localStorage-backed store module replaces every `/api/*` call in `public/app.js` — rooms/layout, tables, seats, guests, and seat assignments all create/read/update/delete with no server. Data survives a page reload.
  - Acceptance: `grep -n "fetch(" public/*.js` shows zero calls to app/api endpoints (Google Fonts/CDN assets excepted); dev-browser flow — add guest → assign to seat → reload → assignment intact — captured in screenshots.
- [ ] **FR-2**: Open to the world. `index.html` loads the planner directly with no login redirect; `login.html` / `invited-only.html` remain on disk but nothing routes to them.
  - Acceptance: dev-browser opens the app cold (no cookies) and lands on the working planner; grep shows no auth-redirect logic in the active path.
- [ ] **FR-3**: Palette + heading-type swap to the planner system, applied ONLY at the token level (`design/tokens.css` + the `:root` block and font references in `public/styles.css` + Google Fonts link in HTML). Mapping in Technical Constraints. All editorial techniques (ornaments, pills, hairline rules, radial-gradient body, frosted cards, empty states, motion) remain byte-identical in structure.
  - Acceptance: computed-style probes show the new token values; visual diff of screenshots shows identical layout with the new palette; no blush `#e7c9c4`/`#d99a92` or sage `#7d8c72`/`#5f6d55` values remain in CSS.
- [ ] **FR-4**: Feature parity, serverless. Room templates + ghost empty state, table shapes with seat dots, pointer drag-and-drop guest assignment (ghost pill, seat hover grow, toasts), guest rail with filters/progress, and CSV import (client-side parse: same column semantics as before) all work.
  - Acceptance: dev-browser screenshots of each interaction; CSV import demonstrated with a sample file.
- [x] **FR-5**: Tests. Unit tests for the storage module run via the existing `npm test` runner (`node --test`); old server tests are excluded from the default test run rather than left failing.
  - Acceptance: `npm test` exits 0 with the storage tests listed in output.
- [ ] **FR-6**: UI integrity after the swap: no overlapping elements, no clipped text, no horizontal page scroll at 1440px and 375px.
  - Acceptance: screenshots at both widths of the main planner view (populated + empty states), visually checked; defects fixed and re-shot.

### Non-Functional Requirements
- [ ] **NFR-1**: Deployed as a **free Render static site** named `wedding-seating` in the `nealdes.ai` workspace ONLY (guard-enforced): `render.yaml` rewritten to document the static-site config (`runtime: static`, `staticPublishPath: ./public`), and the live URL `https://wedding-seating-uccb.onrender.com` renders the converted app correctly.
  - Acceptance: live URL screenshot passing the same checks as FR-6; `render services -o json` shows the static site in the pinned workspace; `personal_homepage` and `personal_site` untouched.

## Technical Constraints

- **Palette mapping (old → new).** Preserve each token's ROLE; swap only its value:
  - `--ivory #fbf7f2` → cream-50 `#FFFCF8` · `--paper #fffdfb` → `#FFFDFB` (keep) · `--ink #3d3733` → warm-gray-800 `#3D3535` · `--muted #8c8177` → warm-gray-500 `#7A6C6C` · `--line #e8ddd2` → cream-300 `#EDE5DD`
  - Blush family → rose family: `--blush #e7c9c4` → rose-400 `#E8B4B8` · `--blush-deep #d99a92` → rose-600 `#C4848A` · `--blush-tint #f7e9e6` → rose-50 `#FDF2F2`
  - Sage family (primary buttons, "complete" states) → deep rose + gold: `--sage #7d8c72` → rose-500 `#D4949A` · `--sage-deep #5f6d55` → rose-700 `#A86A70` · `--sage-tint #eef0e8` → cream-100 `#FFF8F0`; table-complete ring tint from gold `rgba(212,165,116,.18)`
  - `--gold #c9a96a` → gold-400 `#D4A574` (ornaments only, as now)
  - Shadows stay warm and barely-there; retune the `rgba(90,70,60,…)` shadow hue toward warm-gray if needed, same opacities.
- **Type swap**: `Cormorant Garamond` → `Playfair Display` (same restrained weights 500/600 + italic for the ampersand); Inter stays. Update the Google Fonts link accordingly. Do not change any font-size/letter-spacing values.
- **Storage layer**: one new module (e.g. `public/store.js`) exposing the same shapes `app.js` already consumes from the API, so `app.js` edits are mechanical call-site swaps, not logic rewrites. Namespaced localStorage key with a schema-version field.
- **Static serving locally**: `npx serve public -l 3000` (no Express). The dormant `src/` server must not be needed for anything.
- **Render**: the static site ALREADY EXISTS — human-authorized and created via API on 2026-08-02: `wedding-seating` (`srv-d9nbqfvqj5pc73ej1090`), URL `https://wedding-seating-uccb.onrender.com`, free plan, publishPath `public`, auto-deploy on push to main. No Blueprint step exists. The infra worker's job is verification + rewriting `render.yaml` to document the static-site reality (runtime: static, staticPublishPath: ./public, service name/notes). The workspace also hosts `personal_homepage` (srv-d787ms3uibrs73bhot2g) and `personal_site` (srv-d0tmjlm3jp1c73ep7rag) — a DIFFERENT project; never touch them. The old `wedding-seating-ymzs` node service + `wedding-seating-db` live elsewhere and are dead — never resume, modify, or delete.
- **Push authorization (HUMAN, 2026-08-02):** the runner MAY run `git push` to main itself once work is committed and acceptance-verified — no push blocker needed. Pushing triggers the static site's auto-deploy; after pushing, verify the live URL per NFR-1.
- **Reference for palette provenance** (read-only): `wedding-seating-planner` repo — `frontend/tailwind.config.ts` and `frontend/app/globals.css`.

## Success Criteria

A visitor opens the live static URL cold, with no login, and immediately plans a wedding: picks a room template, sees tables with seat dots, imports guests from CSV, drags them onto seats with the same delightful micro-interactions, reloads and finds everything saved — all wearing the rose/cream/gold planner palette on the existing editorial design, with `npm test` green and the site served free from the `nealdes.ai` workspace.

## Execution Protocol

These rules bind ANY session working this brief. The `/orchestrate` skill is the full runner — invoke it if it is not already loaded.

1. **Single writer.** Only the main (orchestrating) session edits this file or moves it between board folders. Subagents never touch it.
2. **Decompose before building.** If Task Breakdown below is empty, fill it before any implementation. Every requirement must map to at least one subtask.
3. **Delegate, don't implement.** Execute each subtask via the matching subagent (frontend-worker / infra-worker). The main session plans, verifies, records, and routes.
4. **Verify before checking.** A requirement checkbox may only be checked when its acceptance criteria are demonstrably met (test output, screenshot, grep evidence in the transcript). Never weaken, reinterpret, or remove a requirement to make it pass.
5. **Park blockers, keep moving.** When a subtask hits a human blocker: record it under `## Blockers` (question + options + empty `Resolution:` line), mark the subtask blocked, and continue every subtask NOT downstream of the blockage. Max 3 attempts per subtask; the 3rd failure becomes a blocker.
6. **Document every turn.** Append a Progress Log entry each working turn (a Stop hook enforces this).
7. **Route on terminal state — two DISTINCT outcomes:**
   - **COMPLETE**: all requirement checkboxes checked → set `outcome: completed`, write `## Outcome`, `mv` this file to `briefs/4-done/`, announce "BRIEF COMPLETE".
   - **NEEDS HUMAN**: requirements remain AND zero runnable subtasks → set `outcome: needs-human`, write `## Outcome` listing every open question, `mv` this file to `briefs/3-blocked/`, announce "NEEDS HUMAN INTERVENTION" with the questions. Blocked is NOT done — never present it as completion.
8. **Prove board state.** End every turn by running: `ls briefs/2-active/ briefs/3-blocked/ briefs/4-done/`

## Task Breakdown

_Filled just-in-time by the runner when this brief becomes active. Current phase in detail; future phases as placeholder rows._

| ID | Phase | Description | Agent | Requirements | Depends On | Files Owned | Status | Attempts |
|----|-------|-------------|-------|--------------|------------|-------------|--------|----------|
| p1-task-1 | 1 Serverless conversion | Create `public/store.js`: localStorage persistence layer (namespaced key + schema-version) exposing async CRUD for events/tables/fixtures/guests/assignments with the exact response shapes app.js consumes from the API (snake_case: `event_date`, `table_id`, `seat_index`, …); port CSV parse/serialize semantics from `src/csv.js` (name/email/notes/party column aliases) into the store; browser classic-script + Node CommonJS dual export. Write `test/store.test.js` unit tests (`node --test`); repoint `package.json` test script to store tests only so old server tests are excluded, not failing. | frontend-worker | FR-1, FR-5 | — | `public/store.js`, `test/store.test.js`, `package.json` | completed | 1 |
| p1-task-2 | 1 Serverless conversion | Swap every `api()` call site in `public/app.js` to the store module (mechanical swaps); CSV import via FileReader → store parse (same toasts); export chart via client-side CSV Blob download (replace `/api/events/:id/export.csv` href); remove whoami/`/api/me`/logout/admin-members code from the active path; `index.html`: load `store.js` before `app.js`, remove guest-list panel + whoami/gl-link markup. `login.html`/`invited-only.html` stay dormant on disk, nothing routes to them. | frontend-worker | FR-1, FR-2, FR-4 | p1-task-1 | `public/app.js`, `public/index.html` | pending | 0 |
| p2-task-1 | 2 Planner palette | Token-level palette + heading-type swap per the brief mapping (placeholder — detail at phase start). | frontend-worker | FR-3 | phase 1 | `design/tokens.css`, `public/styles.css`, HTML font links | pending | 0 |
| p3-task-1 | 3 Local verification | Dev-browser acceptance pass: persistence flow, cold open, CSV import, drag-drop, 1440/375 screenshots, token probes; fix defects (placeholder). | frontend-worker | FR-1, FR-2, FR-3, FR-4, FR-6 | phase 2 | `public/*` fix pass | pending | 0 |
| p4-task-1 | 4 Static deploy | Rewrite `render.yaml` as static-site documentation + verify existing service in pinned workspace; then live-URL verification after push (placeholder). | infra-worker | NFR-1 | phase 3 | `render.yaml` | pending | 0 |

## Progress Log

_Append-only. One entry per working turn: timestamp, what happened, what's next._

### 2026-08-02T03:48Z — Brief activated + decomposed
- Moved 001 from `1-backlog/` to `2-active/`; created `session/001-frontend-only-planner-palette/`.
- Recon: all server I/O in `public/app.js` funnels through one `api()` helper (~25 call sites: events/tables/fixtures/guests CRUD, CSV import, export.csv href, whoami + admin-members panel). CSV column semantics live in `src/csv.js`. Palette literals include rgba-form blush (`rgba(217,154,146,.15)`) and ~10 hardcoded `Cormorant Garamond` font refs. Render service is already static (auto-deploy on push); `render.yaml` is stale node-service docs. `main` in sync with `origin/main` — push-to-deploy is the established path.
- Decomposed Phase 1 (serverless conversion) in detail: p1-task-1 (store.js + tests + test-script repoint), p1-task-2 (app.js call-site swap + de-auth + client CSV/export + index.html). Placeholder rows for phases 2 (palette), 3 (local verification), 4 (static deploy docs + live verify).
- Next: spawn frontend-worker for p1-task-1.

### 2026-08-02T04:02Z — p1-task-1 completed; FR-5 checked
- frontend-worker delivered `public/store.js` (localStorage layer, key `wedding-seating:v1` + schemaVersion, async CRUD for events/tables/fixtures/guests, seat kick/unseat semantics, CSV import/export ported from `src/csv.js`/server routes, dual browser-global + CommonJS export) and `test/store.test.js` (26 tests); `package.json` test script now runs only store tests.
- Runner spot-check: `npm test` (Node 20) exits 0, 26/26 pass listed; zero `fetch(` in store.js. **FR-5 checked** (acceptance verified directly). FR-1 advances but stays open until app.js swap + reload flow evidence.
- Interface contract recorded in worker report (Store.* async methods, snake_case rows, `exportFilename()` helper). Note: default shell node is anaconda v10 — use nvm Node 20 for tests.
- Human added push authorization to Technical Constraints: runner may `git push` to main once verified.
- Next: spawn frontend-worker for p1-task-2 (app.js call-site swap + de-auth + client CSV/export + index.html).

### 2026-08-02T17:30Z — CANCELLED by human clarification (main session)
- Wires uncrossed: this repo was only ever the STYLING REFERENCE. The deliverable is `wedding-seating-planner` ("OLD"), revived fresh in nealdes.ai. This conversion mission is cancelled.
- Salvage: `public/store.js` + `test/store.test.js` (26/26 passing localStorage layer) committed as WIP — reusable if this app ever goes frontend-only for real.
- The `wedding-seating` static site (srv-d9nbqfvqj5pc73ej1090) has been SUSPENDED (free, reversible). Open question below.

## Blockers

### B-1: Mission cancelled — dispose of the scaffolding?
- **Raised:** 2026-08-02T17:30:00Z · **Type:** needs-human-decision
- **Description:** Deliverable moved to wedding-seating-planner. This repo's static site is suspended; the WIP store layer is committed.
- **Options:** 1. Delete the static site + retire this brief 2. Keep both dormant for a future frontend-only revival
- **Resolution:**


## Outcome

_Written when this brief is routed out of 2-active/. States which terminal (completed / needs-human) and why._
