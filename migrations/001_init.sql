-- 001_init.sql — core schema for the wedding seating planner.
-- UUIDs are generated in application code (crypto.randomUUID), so no pgcrypto needed.

CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  event_date  DATE,
  venue       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tables (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  shape       TEXT NOT NULL CHECK (shape IN ('round','long')),
  seats       INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 20),
  x           DOUBLE PRECISION NOT NULL DEFAULT 120,
  y           DOUBLE PRECISION NOT NULL DEFAULT 120,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE guests (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT,
  notes       TEXT,
  table_id    TEXT REFERENCES tables(id) ON DELETE SET NULL,
  seat_index  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tables_event ON tables(event_id);
CREATE INDEX idx_guests_event ON guests(event_id);

-- One guest per physical seat: unique (table_id, seat_index) among assigned guests.
CREATE UNIQUE INDEX uniq_seat_per_table
  ON guests(table_id, seat_index)
  WHERE table_id IS NOT NULL AND seat_index IS NOT NULL;
