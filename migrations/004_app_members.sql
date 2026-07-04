-- 004 — app members: per-app allow-list for the org-login gate (SPEC-003).
-- Membership is checked per request against this table; row = source of truth.

CREATE TABLE app_members (
  email      text PRIMARY KEY,
  role       text NOT NULL DEFAULT 'member',
  status     text NOT NULL DEFAULT 'active',   -- active | blocked
  invited_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_members (email) VALUES ('nbdesai1992@gmail.com');
