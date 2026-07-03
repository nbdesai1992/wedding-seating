# Intake — Wedding Seating Planner

## Goal (one sentence)
Ship an elegant, bride-focused web app to create wedding events, lay out tables on a drag-and-drop floor plan, import a guest CSV, assign guests to seats, and export assignments as CSV — live on Render.

## Lane
Software (full-stack web app with persistence).

## Canonical home
`~/projects/wedding-seating/` (new repo; GitHub push via `gh` auto-approved). Brief at `BRIEF.md`.

## Service shape (first guess)
**Web service + database.** Events, tables (position + seat count), guests, and seat assignments must persist across reloads and be visible to any visitor → server + Postgres. Frontend is a drag-and-drop canvas (single-page). Finalized in spec-and-plan.

## Acceptance contract — done = live & verified
On the live Render URL:
1. Landing view lists all events and lets anyone create one; events persist and are visible to any visitor.
2. Inside an event: add tables and freely place/move them on a 2D canvas; positions + seat counts persist across reload.
3. Import a guest list via CSV upload; imported guests appear in an unassigned panel.
4. Assign guests to tables/seats by drag-and-drop; reassign and unassign; assignments persist across reload.
5. Export current table assignments as a downloadable CSV.
6. Automated test covers end-to-end: create event → add tables → import guests → assign → export reflects assignments.

## Human gates likely to fire
- **DB provisioning:** one dedicated `wedding-seating-db` on `basic_256mb` — pre-approved, not a gate.
- **New private repo GitHub-App access:** possible one-time grant if repo is private and Render can't see it. Will default the repo to **public** to avoid the gate unless told otherwise.
- No secrets, custom domains, external messaging, or destructive actions expected.

## Open decisions needing Neal
None blocking. Recorded defaults:
- No auth; all events global/visible (per brief — explicitly a later phase).
- Repo visibility: **public** (avoids Render GitHub-App gate).
- CSV import guest columns: default to a `name` column (+ optional `email`, `notes`); tolerate common headers. Finalized in design/spec.

## Recommended next action
Proceed to **design-brief** (has a UI/product surface; "joyful, elegant, bride-focused" is a first-class requirement).
