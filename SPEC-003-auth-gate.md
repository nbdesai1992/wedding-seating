# SPEC-003 — Gate wedding-seating behind org login

## 1. Requirements (each traces to BRIEF-003 acceptance criteria)

R1. Unauthenticated page requests redirect to `/login`; unauthenticated `/api/*` return
    401 JSON. `/healthz`, `/login`, `/auth/callback`, and login-page assets stay open.
R2. An org-authenticated ACTIVE member of THIS app passes through; all existing app
    behavior unchanged; existing data intact.
R3. An org-authenticated NON-member (or `status='blocked'`) gets the styled 403
    invitation-only page (or 403 JSON on APIs); zero data exposure.
R4. Membership changes take effect without redeploy (DB row = the source of truth,
    checked per request).
R5. Daily keep-alive for the org auth instance (GitHub Actions cron in this repo) with
    one verified run.
R6. Automated live test via the factory-auth test-member technique (password grant) —
    Google is for humans; tests use an admin-created member.

## 1b. Intent coverage table

| Intent (brief's words) | Criterion | Verified by |
|---|---|---|
| "every page redirects to sign-in; every API route returns 401" | R1 | e2e + live curl matrix |
| "signs in with Google and uses the full app; data intact" | R2 | Neal live check (Google); test-member automated equivalent; data row-count before/after |
| "access is by invitation" message for uninvited | R3 | live test-member(non-member) + ui-verify 403 frame |
| "invite grants access without a redeploy" | R4 | live: add test member → 200, remove → 403, no deploy between |
| "keep-alive scheduled, one verified run, recorded" | R5 | `gh run` result + factory-auth registry row updated |
| "automated test confirms" full path | R6 | `test/live_auth_test.sh` |
| styled login/403, single obvious Google action (design §9) | rubric | ui-verify frames |

## 1c. Access decision

**GATED** behind org login (factory-auth; org = NBD Insights, instance ref
`pvmmiqzmcfhylpyfqerd`, ES256/JWKS verified — no auth secrets in this app).
Member list: `app_members` table **in this app's own Postgres** (per-app hard rule).
Initial members: `nbdesai1992@gmail.com`. Test members are created/removed by tests only.

## 2. Architecture

Unchanged: existing Node/Express web service + existing `wedding-seating-db` Postgres.
No new resources (brief constraint). Auth adds: 2 deps (`jose`, `cookie-parser`), 1
migration, 1 middleware module, 2 static pages, 3 env vars, 1 workflow file.

## 3. render.yaml delta

Env vars added to the existing service (non-secret; set via API, documented in yaml):
`SUPABASE_URL=https://pvmmiqzmcfhylpyfqerd.supabase.co`,
`SUPABASE_PUBLISHABLE_KEY=<publishable>`, `APP_URL=https://wedding-seating-ymzs.onrender.com`.
No service shape/plan changes. No `ANTHROPIC_API_KEY`.

## 4. Non-goals & constraints

- No roles/permissions beyond member/blocked (single-role app for now).
- No open signup ever; no password UI (password grant exists only for test members).
- Multi-visitor concurrent editing semantics unchanged (all members share all events —
  same as today, just gated).
- Existing e2e test must keep passing (runs against pg-mem with auth bypassed via
  explicit test hook, plus new gated-path tests).
