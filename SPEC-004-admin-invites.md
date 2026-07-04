# SPEC-004 — Admin role + in-app invite UI

## 1. Requirements (trace to BRIEF-004)

R1. Role-based privilege from the app's own DB: `app_members.role` ∈ {admin, member};
    nbdesai1992@gmail.com seeded admin by migration. Role read per request (no redeploy
    for changes).
R2. Admin API under `/api/admin/*` (requireAdmin): list members; invite (validate +
    lowercase + insert with provenance); set role; block/unblock; remove.
R3. Safety rails server-side: last remaining active admin cannot be demoted, blocked,
    or removed; an admin cannot block/remove themself; invalid emails rejected 400.
R4. Guest-list panel in the app shell: admin-only entry near the header identity;
    member rows (email, role chip, status) + invite field + quiet block/remove;
    post-invite message "Invited — ask them to sign in with Google." 390px first-class.
R5. Plain members: no panel entry AND 403 on all `/api/admin/*`.
R6. Org auth instance: `disable_signup: false` (owner-decided 2026-07-04). Uninvited
    self-signup → identity created → app still 403 invitation page. Invited email →
    access immediately after first sign-in, no redeploy.
R7. Tests: e2e (role enforcement, invite→access, block/remove, last-admin, self-block)
    + live test extension covering self-signup path with throwaway identities.
R8. Factory generalization: factory-auth skill gains role/admin-panel pattern +
    one-step invite runbook; registry reflects signup-model change.

## 1b. Intent coverage

| Intent (owner's words) | Criterion | Verified by |
|---|---|---|
| "my email is the admin… admin role" | R1 | migration + e2e admin path |
| "maintain privileges under that… via database" | R1/R3 | e2e role checks; SQL-recoverable |
| "a UI to invite" | R4 | ui-verify frames (390 + desktop) + e2e |
| "doesn't have to send an email yet" | R4 copy | panel message frame |
| "whitelist that email and allow it to sign up" | R6 | live test: invite → signup → access |
| panel hidden from members (brief) | R5 | e2e 403 + panel-absent frame |
| last-admin protection (brief) | R3 | e2e + graceful disabled-state frame |
| skill generalization (brief) | R8 | skill diff + registry row |

## 1c. Access decision

GATED (unchanged, factory-auth). Member list: `app_members` in this app's DB (hard
rule). CHANGE: instance-level signup OPEN — invite-only now enforced solely by per-app
member lists (owner decision recorded in BRIEF-004; supersedes 003's platform-level
constraint). Admin of this app = role column; no org-level admin concept exists.

## 2. Architecture

Unchanged: existing Node/Express service + existing Postgres. Adds: migration 005,
`requireAdmin` in src/auth.js (or src/admin.js), admin routes in src/app.js, panel UI in
public/ (existing vanilla JS app.js pattern). No privileged auth keys — invite is a DB
INSERT; identity creation happens via the instance's open signup. No new deps expected.

## 3. render.yaml delta

None (no env/plan/service changes).

## 4. Non-goals & constraints

- No email delivery, no invite links/tokens — copy instructs verbal relay. Future email
  service plugs into POST /api/admin/members.
- No org-wide admin, no multi-role hierarchy beyond admin/member.
- No change to seating features or Brief-003 gate behavior for non-admins.
- Event-view header untouched (crowded); panel entry lives in the home shell only.
