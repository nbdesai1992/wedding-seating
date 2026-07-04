# Brief: Gate wedding-seating behind org login

## Objective
Put the live wedding-seating app fully behind the org's invite-only Google sign-in,
using the factory-auth skill (the org auth instance is already provisioned and live).

## What it does
Visitors to the wedding-seating URL see only a sign-in page. Invited members sign in
with Google and use the full app exactly as before. Uninvited accounts are politely
refused. Members are managed per the factory-auth runbook (invite/remove/block for this
app only).

## Acceptance criteria (verified on the LIVE url)
- Unauthenticated: every page redirects to sign-in; every API route returns 401; no
  event/guest data reachable.
- nbdesai1992@gmail.com signs in with Google and uses the full app; all pre-existing
  events, tables, and guest data intact.
- An uninvited signed-in Google account gets a clear "access is by invitation" message.
- Inviting a new member (factory-auth runbook) grants access without a redeploy.
- The daily keep-alive for the org auth instance is scheduled, has one verified run,
  and is recorded in the factory-auth skill registry.
- An automated test (test-member technique from the skill's app-integration reference)
  confirms: unauthenticated rejected → member reaches data → non-member rejected.

## Constraints
- Use the existing org auth instance (factory-auth registry: NBD Insights) — do NOT
  provision anything new on Supabase; no new Render resources; existing service + DB only.
- Per-app member list in the app's own DB (hard rule); members table via numbered
  migration per factory convention.
- This build is also the factory-auth PILOT: feed any integration-template fixes back
  into `~/.claude/skills/factory-auth/`.

## Execution: in-session

## Done / Stop
- Done when all acceptance criteria pass on the live URL.
- Stop and flag only on a genuine human gate, with everything shipped so far.

## Resolution (2026-07-03, recorded per owner direction)

All acceptance criteria were verified passing on the live URL by automated checks
(unauth 302/401 matrix; member access with pre-existing data intact via the
test-member technique, which exercises the same live login pipeline; non-member 403;
invite/revoke without redeploy; keep-alive scheduled + one green run; automated test
suite). The single remaining criterion — the owner personally signing in with Google
in their own browser — was explicitly DEFERRED by the owner ("Can't check right now",
followed by direction to unset the goal). It is recorded as an accepted exception owed
post-hoc, not an open build defect: the owner will report the result of their sign-in
whenever they check, and any failure will be treated as a new iteration. With that
owner-accepted exception, this brief is CLOSED — shipped and live-verified.
