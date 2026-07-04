-- 005 — admin role (SPEC-004): seed the owner as admin, invite provenance,
-- and joined_at (NULL = invited but never signed in; stamped by the app on a
-- member's first authenticated request). invited_at exists since 004;
-- invited_by NULL = founding member.
-- Idempotent guards; schema_migrations remains the apply-once strategy.

ALTER TABLE app_members ADD COLUMN IF NOT EXISTS invited_by text;
ALTER TABLE app_members ADD COLUMN IF NOT EXISTS joined_at timestamptz;

UPDATE app_members SET role = 'admin', joined_at = now()
  WHERE email = 'nbdesai1992@gmail.com';
