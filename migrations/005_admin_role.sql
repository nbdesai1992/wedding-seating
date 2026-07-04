-- 005 — admin role (SPEC-004): seed the owner as admin + invite provenance.
-- invited_at exists since 004; this adds invited_by only (NULL = founding member).
-- Idempotent guards; schema_migrations remains the apply-once strategy.

ALTER TABLE app_members ADD COLUMN IF NOT EXISTS invited_by text;

UPDATE app_members SET role = 'admin' WHERE email = 'nbdesai1992@gmail.com';
