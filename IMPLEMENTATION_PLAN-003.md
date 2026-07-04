# IMPLEMENTATION_PLAN-003 — auth gate

## 1. Bounded steps (each ends in a commit + check)

S1. **Migration + deps** — `migrations/004_app_members.sql` (schema below, seeds
    nbdesai1992@gmail.com); add `jose` + `cookie-parser`. Check: `npm run migrate`
    against pg-mem/test DB applies cleanly; e2e still green.
S2. **Auth module** (`src/auth.js`, per factory-auth `references/app-integration.md`):
    PKCE login/callback/logout routes, `requireMember(db)` middleware (JWKS ES256
    verify, one refresh attempt, `app_members` active check, lowercase email match).
    Test hook: `AUTH_BYPASS=1` only honored when `NODE_ENV=test`. Check: unit-ish tests
    for 401/403/200 paths using pg-mem + a stubbed verifier.
S3. **Wire the gate in `src/app.js`** — order: healthz → auth routes + login assets →
    `requireMember` → `/api/*` + static. Login page `public/login.html` + 403 page
    `public/invited-only.html`, styled with existing `styles.css`. Check: local run,
    manual curl matrix (R1), pages render styled.
S4. **Tests** — extend `test/e2e.test.js` (gated: 401 matrix, member 200, non-member
    403) + new `test/live_auth_test.sh` (live URL: unauth 401/redirect → create test
    member via supabase-api.sh → password-grant token → 200 with real data → remove
    member → 403 → delete test identity). Check: `npm test` green locally.
S5. **Keep-alive** — `.github/workflows/keepalive.yml`: daily cron hitting the auth
    health endpoint with the publishable key (client-safe; stored as a repo Actions
    variable, not a secret). Check: `gh workflow run` once, verify success.
S6. **Deploy** — set 3 env vars on the existing service via render-cli API, push,
    deploy, verify per §3. Update factory-auth SKILL.md registry row (keep-alive
    scheduled) + EVIDENCE.md + STATUS.md.

## 2. Data / Persistence / Migration decision

Existing Postgres, existing numbered-SQL runner (`src/migrate.js`, runs at startup on
free tier — established repo convention, kept). New migration `004_app_members.sql`:

```sql
CREATE TABLE app_members (
  email      text PRIMARY KEY,
  role       text NOT NULL DEFAULT 'member',
  status     text NOT NULL DEFAULT 'active',   -- active | blocked
  invited_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_members (email) VALUES ('nbdesai1992@gmail.com');
```

Seed = the initial member (idempotent via schema_migrations guard). Rollback posture:
membership is additive; disabling the gate = revert the S3 commit and redeploy (data
untouched). No backfill. Local generated DB files: none (pg-mem in tests).

## 3. Verification plan

**API/functional** — local: e2e suite (S4) incl. 401/403/200 matrix. Live (wake-aware,
retry-through-spin-up): `test/live_auth_test.sh` covers R1/R2(automated)/R3/R4/R6;
data-intact check = `/api/events` row count as test member equals pre-gate count
(recorded before deploy). R5: one green `gh run` of keepalive.yml + registry updated.
**Human (end of run):** Neal signs in with Google on the live URL — the only
non-automatable criterion (R2 human half). Flag as final gate, not a build blocker.

**Visual (ui-verify)** — local preflight + live confirmation. Frames: login page
(desktop 1440 + mobile 390), 403 page (signed-in non-member state, desktop), plus one
authenticated app frame to prove no styling regression behind the gate. Rubric: design
brief §9 additions (styled, single obvious Google action, no unstyled flash).

## 4. Human-gate trigger checklist

- non-free plan / disk / autoscaling / paid region — **clear** (no resource changes)
- paid DB / free-DB window — **clear** (existing DB, unchanged)
- `sync:false` secrets — **clear** (all three env vars are non-secret; publishable key
  is client-safe by design; no service-role key ever touches this app)
- custom domain — **clear**
- external messaging / public launch — **clear**
- destructive deletion — **clear** (additive migration only)
- strategy commitment — **clear** (decided in brief)
- Render GitHub App access — **clear** (existing connected repo)
- org auth instance provisioned — **clear** (NBD Insights live, registry row exists)
- **fires (end of run only):** owner's live Google sign-in check — needs Neal's browser.

No build-blocking gate → plan auto-approved, builder proceeds.
