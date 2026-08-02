---
id: 001-frontend-only-planner-palette
title: "Frontend-Only Conversion + Planner Palette"
created: "2026-08-02T00:40:00Z"
updated: "2026-08-02T01:00:00Z"
completion: 0/7
outcome: pending
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
- [ ] **FR-5**: Tests. Unit tests for the storage module run via the existing `npm test` runner (`node --test`); old server tests are excluded from the default test run rather than left failing.
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

## Progress Log

_Append-only. One entry per working turn: timestamp, what happened, what's next._

## Blockers

_None yet. Each blocker gets: title, type, description, context, options, and an empty `Resolution:` line for the human._

## Outcome

_Written when this brief is routed out of 2-active/. States which terminal (completed / needs-human) and why._
