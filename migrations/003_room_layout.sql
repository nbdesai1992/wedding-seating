-- 003 — room layout: rectangular-table orientation + named non-seating fixtures.

ALTER TABLE tables ADD COLUMN orientation TEXT NOT NULL DEFAULT 'horizontal';
ALTER TABLE tables ADD CONSTRAINT chk_tables_orientation CHECK (orientation IN ('horizontal','vertical'));

CREATE TABLE fixtures (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  ftype       TEXT NOT NULL DEFAULT 'custom',
  shape       TEXT NOT NULL DEFAULT 'rect' CHECK (shape IN ('rect','round')),
  w           DOUBLE PRECISION NOT NULL DEFAULT 140,
  h           DOUBLE PRECISION NOT NULL DEFAULT 90,
  x           DOUBLE PRECISION NOT NULL DEFAULT 200,
  y           DOUBLE PRECISION NOT NULL DEFAULT 200,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixtures_event ON fixtures(event_id);
