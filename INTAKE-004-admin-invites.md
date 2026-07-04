# Intake 004 — Admin role + in-app invite UI

**Goal:** Make nbdesai1992@gmail.com a database-backed admin of wedding-seating with a
styled in-app guest-list panel (invite/block/remove, one-step invites, no email send),
switching the org auth instance to open identity signup with access enforced solely by
per-app member lists.

**Lane:** software — iteration on the live, auth-gated app (Brief 003 foundation).

**Canonical home:** `~/projects/wedding-seating` (existing). Brief:
`BRIEF-004-admin-invites.md` (committed dbd6eef).

**Service shape:** unchanged — existing web service + existing Postgres. Auth instance
config change via API (enable signup) is the only external mutation. No new resources.

**Acceptance contract:** per BRIEF-004 — all criteria automatable with test identities
(admin panel/API enforcement, invite→immediate access, uninvited self-signup → 403 page,
block/remove immediacy, last-admin protection, visual gate at desktop + 390px, skill
generalization).

**Human gates likely to fire:** none expected. Signup-model change is pre-decided in the
brief by the owner (recorded 2026-07-04, supersedes 003 constraint). No secrets, no new
resources, no deletion of real data. Human-only checks deliberately excluded from
acceptance.

**Defaults chosen:** panel lives inside the existing app shell behind the admin role
(no separate route/app); invite copy tells the admin to relay "sign in with Google";
provenance = invited_by/invited_at columns; design direction extends DESIGN_BRIEF §6/§9
(a §10 rubric will be added — no design-loop canvas round, utility surface consistent
with the established look).

**Next:** design-brief §10 appendix → spec-and-plan (SPEC-004/PLAN-004) → build.
