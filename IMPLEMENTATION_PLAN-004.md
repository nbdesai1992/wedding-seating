# IMPLEMENTATION_PLAN-004 — admin role + invite panel

## 1. Bounded steps

S1. **Migration 005** — `migrations/005_admin_role.sql`: `UPDATE app_members SET
    role='admin' WHERE email='nbdesai1992@gmail.com';` + `ALTER TABLE app_members ADD
    COLUMN IF NOT EXISTS invited_by text, ADD COLUMN IF NOT EXISTS ...` (invited_at
    already exists; add invited_by only). Idempotent. Check: migrate clean on pg-mem;
    existing tests green.
S2. **Admin middleware + API** — `requireAdmin` (after requireMember; 403 JSON if
    role!=='admin'); routes: GET /api/admin/members; POST /api/admin/members
    {email, role?} (validate w/ conservative email regex, lowercase, INSERT with
    invited_by=req.user.email, ON CONFLICT → 409); PATCH /api/admin/members/:email
    {role?|status?}; DELETE /api/admin/members/:email. Server-side rails per SPEC R3
    (count active admins in the same transaction). Check: unit/e2e matrix.
S3. **Panel UI** — home shell only: "Guest list" link next to whoami (rendered only if
    /api/me returns role admin — extend /api/me to include role); panel as an in-page
    card section (no separate route): rows w/ role chip + status, invite field + button,
    post-invite message, quiet block/remove, disabled last-admin control with one-line
    explanation. 390px first-class. Check: local browser matrix via test hook.
S4. **Tests** — e2e: member 403 on admin API + no-panel flag in /api/me; admin full
    CRUD; invite→ new member (bypass identity) accesses; block immediate; last-admin
    demote/remove/block → 4xx w/ clear error; self-block → 4xx. live_auth_test.sh
    extension (or live_admin_test.sh): with signup open — throwaway email signs UP via
    /auth/v1/signup (password), gets 403 page; admin token (password-grant admin test
    identity? NO — admin is Neal's Google) → use AUTH_BYPASS? Not live. Live admin
    calls use a TEST ADMIN: script inserts test-admin@factory.local w/ role=admin via
    migration? No — via the app's own admin API using... bootstrap: live test creates
    test admin row directly in DB (render-sql, as 003 did), then exercises the API as
    that admin via password-grant token, then cleans up. Check: script passes locally
    against pg-mem server (credential-free path) and fully on live.
S5. **Instance config + docs** — PATCH auth config `disable_signup:false` (supabase-api
    wrapper); update factory-auth SKILL.md (registry status + member-runbook: one-step
    invite; identity pre-creation now only needed for password-grant TEST identities),
    app-integration.md (role/admin pattern §; signup-model note), provisioning.md
    (signup decision per org). Check: config GET shows false; skill files updated.
S6. **Deploy + verify** — push, deploy, live tests (S4 script), ui-verify local +
    live frames, EVIDENCE/STATUS/registry updates.

## 2. Data / Persistence / Migration decision

Existing Postgres + existing numbered-SQL startup runner. Migration
`005_admin_role.sql`: role seed for owner + `invited_by text` column (provenance;
`invited_at` exists since 004). Rollback: role is data — revert with one UPDATE;
column additive. No backfill (existing rows invited_by NULL = "founding members").

## 3. Verification plan

**Functional** — local e2e matrix per S4. Live: unauth/member/admin/API matrix via
test identities incl. real self-signup path (proves R6 end-to-end); admin CRUD via
test-admin row; last-admin rail exercised against test data only (never against
nbdesai1992@gmail.com's row).
**Visual (ui-verify)** — frames: panel at 390px (primary) + desktop; panel-absent
member home; post-invite message state at 390px; last-admin disabled state. Graded vs
DESIGN_BRIEF §10 rubric + design-critic pass. Scale: seed ~8 members so rows read as a
list, not a specimen.

## 4. Human-gate trigger checklist

All **clear**: no plan/resource changes; no secrets (admin API uses session auth; no
new env vars); no domain/messaging; no destructive deletion (test rows only, cleaned);
strategy decision (signup model) pre-made by owner in BRIEF-004; org instance already
provisioned. → Auto-approved, builder proceeds.
