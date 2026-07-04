# Evidence — Wedding Seating Planner

**Live URL:** https://wedding-seating-ymzs.onrender.com
**Deployed commit (verified live):** `5763b38` — status `live` (Brief 002: rotatable rectangular tables + named room fixtures; visual gate GREEN locally and live — see `.ship/ui/VISUAL_VERDICT.md`)

## Render resources
| Resource | Name | ID | Plan |
|---|---|---|---|
| Web service | wedding-seating | `srv-d93lov4vikkc73aidj00` | free (Node, oregon) |
| Postgres | wedding-seating-db | `dpg-d93loha8qa3s73avmrug-a` | basic_256mb (oregon, pg16) |

DATABASE_URL wired at service-create from the DB internal connection string (same region). Migrations run at startup via `src/migrate.js` (numbered SQL + `schema_migrations`).

## Acceptance criteria — verified on the LIVE URL
| # | Criterion | Result |
|---|---|---|
| health | `GET /healthz` | `{"ok":true}` ✓ |
| AC1 | List/create events; persist & visible | Created "Emma & James"; appears in `/api/events` ✓ |
| AC2 | Add round/long tables; drag to reposition; persists | table1 moved to (275,330), seats + position survive reload ✓ |
| AC3 | Import guests via CSV (multipart) | 4 guests imported; quoted-comma name `"Curie, Marie"` parsed; land unassigned ✓ |
| AC4 | Assign / reassign / unassign; persists | Assigned, seat-collision displaced occupant, unassign survived reload ✓ |
| AC5 | Export CSV of assignments | `emma-james-seating.csv`, `text/csv`; Marie→Table 1 seat 2, others Unassigned; quoted name escaped ✓ |
| AC6 | Automated e2e test | `npm test` green (create→tables→import→assign→export over pg-mem) ✓ |
| AC7 | Elegant styled UI | Cormorant serif + blush/ivory/sage; `/styles.css` + `/app.js` served ✓ |

## Live export sample
```
Guest,Email,Table,Seat,Notes
"Curie, Marie",marie@x.com,Table 1,2,
Ada Lovelace,ada@x.com,Unassigned,,
Alan Turing,alan@x.com,Unassigned,,
Grace Hopper,grace@x.com,Unassigned,,
```

## Teardown
`~/.claude/skills/render-cli/scripts/render_teardown.sh --manifest .ship/resources.json --confirm`

## Brief 003 — auth gate (2026-07-03)

- Live URL: https://wedding-seating-ymzs.onrender.com — deploy `live`, commit 9ac4ece (verified via deploys list)
- Auth instance: Supabase `pvmmiqzmcfhylpyfqerd` (NBD Insights org) — signup disabled, Google enabled, callback allowlisted
- Live matrix (test/live_auth_test.sh): PASS — unauth / → 302 /login; /api/events → 401; /healthz 200; login page styled; member (password-grant test identity) → 200 with all 3 pre-existing events; non-member → 403 invitation page
- Invite/revoke without redeploy: member row deleted → immediate 403 (verified live)
- Keep-alive: `.github/workflows/keepalive.yml` — run 28693422713 completed success (2026-07-04T03:23Z); daily cron 09:17 UTC
- Member list (live DB, post-cleanup): nbdesai1992@gmail.com only; org pool: nbdesai1992@gmail.com only
- Visual: .ship/ui/VISUAL_VERDICT.md Brief-003 sections — local preflight GREEN (4 frames), live GREEN (L1/L2/L3)
- OPEN (human): owner Google sign-in on the live URL — the one non-automatable criterion
- 2026-07-03 (late): OWNER GOOGLE SIGN-IN CONFIRMED on the live URL by Neal ("Yes login worked!") — final acceptance criterion met. Brief 003 fully verified, no exceptions outstanding.

## Brief 004 — admin role + invite panel (2026-07-04)

- Live: deploy `live`, commit 0e39b81 verified; migration 005 in schema_migrations (checked on live DB); owner row = admin/active/joined.
- Signup model CHANGE (owner decision, supersedes the 003 note above): instance signup OPEN (`disable_signup: false`, verified via config API); access enforced solely by per-app member lists; `mailer_autoconfirm` stays false (anti-takeover: unconfirmed password signups can never obtain a session — asserted live). GoTrue rate limits confirmed active (signup probe drew a 429 after repeated attempts; recorded as abuse protection working). MAU exposure of open signup accepted + recorded.
- test/live_admin_test.sh full path: PASS — unauth 401s; admin list/invite 201; invitee immediate access 200; block → immediate 403; remove 200; stray public signup ungrantable; authenticated non-member → invitation page.
- Concurrency rail: FOR UPDATE row-lock on active-admin count (critic fix) in both PATCH/DELETE transactions.
- Verification window runbook (used + cleaned): temp DB IP allowlist → state pre-checks → test rows/identities → scripts → live frames → full cleanup (member list = owner only; org pool = owner only; allowlist = none).
- Visual: VISUAL_VERDICT.md Brief-004 sections — local GREEN after design-critic round (2 majors fixed), live GREEN (L4/L5).
