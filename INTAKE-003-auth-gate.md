# Intake 003 — Gate wedding-seating behind org login

**Goal (one sentence):** Put the live wedding-seating app fully behind the org's
invite-only Google sign-in (factory-auth), with this app's own member list, without
touching existing data or creating any new resources.

**Lane:** software — iteration on an existing shipped product.

**Canonical home:** `~/projects/wedding-seating` (existing repo,
github.com/nbdesai1992/wedding-seating, live at https://wedding-seating-ymzs.onrender.com).
Brief copied to `BRIEF-003-auth-gate.md`; source brief `~/projects/factory-auth/BRIEF.md`.

**Service shape:** unchanged — existing Node web service + existing Postgres
(`wedding-seating-db`). No new resources (hard constraint from the brief).

**Acceptance contract (done = live & verified):** per BRIEF-003 — unauthenticated
visitors reach only sign-in (pages redirect, APIs 401); nbdesai1992@gmail.com signs in
with Google and finds all existing data intact; uninvited accounts get the
invitation-only message; invite grants access without redeploy; daily keep-alive for the
org auth instance scheduled + one verified run; automated test-member checks pass on the
live URL.

**Human gates likely to fire:**
- End-of-run only: the "owner signs in with Google on the live URL" criterion needs
  Neal's own browser (Google OAuth can't be automated) — final verification step, not a
  build blocker. Everything else (env vars are non-secret, no new resources, no domain,
  no deletion) is autonomous.

**Open decisions needing Neal:** none — access model, member list (nbdesai1992@gmail.com
only), and isolation rules were decided in the brief.

**Defaults chosen (recorded):** keep-alive scheduled as a GitHub Actions daily cron in
this repo (free, survives laptop sleep; uses only the client-safe publishable key);
login/403 pages styled to the app's existing warm-elegant look (rubric added to
DESIGN_BRIEF; full design-loop skipped — utility surface, not design-sensitive value).

**Next action:** spec-and-plan (SPEC-003 + plan), then build.
