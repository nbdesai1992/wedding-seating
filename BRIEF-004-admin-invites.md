# Brief 004: Admin role + in-app invite UI (wedding-seating)

## Objective
Give the app a real admin: nbdesai1992@gmail.com holds an `admin` role (database-backed)
and can invite, block, and remove members from a styled in-app guest-list panel — no
factory session needed, no email sending yet.

## What it does
An admin signing in sees a quiet "Guest list" entry the ordinary member never sees.
Inside: the member list (role/status), an invite-by-email field, and block/remove
actions. Inviting whitelists the email instantly — the panel tells the admin "invited —
ask them to sign in with Google," and that person gets straight in on first sign-in.
Uninvited people can create a bare identity but land on the gracious invitation-only
page. Privileges live in the app's own database, per app, effective immediately.

## Acceptance criteria (verified on the LIVE url — all automatable, no human-only checks)
- The seeded admin (nbdesai1992@gmail.com) gets the guest-list panel and admin API; a
  plain member gets neither (panel hidden AND API 403) — proven with test identities.
- Admin invites an email via the panel → that identity signs in and reaches the app
  immediately, no redeploy; provenance (who invited, when) is recorded.
- An uninvited identity that signs itself up gets the invitation-only page and zero data.
- Block and remove take effect immediately; the last remaining admin cannot be demoted,
  blocked, or removed; an admin cannot block themself.
- Identity signup is enabled on the org auth instance and verified live (self-signup →
  identity exists → still 403 without membership).
- Automated e2e + live tests cover: member vs admin enforcement, invite→access,
  block/remove, last-admin protection, uninvited self-signup path.
- Visual gate: panel styled to the app's warm-elegant direction, graded at desktop AND
  phone width (390px — the admin's primary device), plus panel-hidden-for-member frame.
- Factory generalization: the factory-auth skill gains the pattern (role column +
  admin middleware + invite-panel template + one-step invite runbook superseding the
  two-step identity pre-creation) and its registry/status reflect the signup-model
  change.

## Constraints
- Existing Render service + database only; no new resources; free tiers.
- NO privileged auth keys (service/secret) in the app — the invite is a member-list
  write in the app's own DB; identity creation happens via the now-open signup.
- Per-app member lists remain the hard isolation rule.
- No email sending in this version — the panel states the invite plainly; a future
  email service plugs into the same endpoint.
- Existing members, events, and data intact; Brief-003 gate behavior unchanged for
  non-admins.
- Deliberate decision (supersedes Brief 003's platform-level no-signup constraint, per
  owner 2026-07-04): identity signup OPEN, access invite-only via member lists.

## Execution: in-session

## Done / Stop
- Done when all acceptance criteria pass on the live URL.
- Stop and flag only on a genuine human gate (spend, secrets, destructive action), with
  everything shipped so far. Owner's personal phone-UX opinion of the panel is welcome
  feedback afterward — deliberately NOT an acceptance criterion.
