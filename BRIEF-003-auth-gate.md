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
