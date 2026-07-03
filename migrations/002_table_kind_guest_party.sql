-- 002 — support the approved design: table variants (head table, sweetheart)
-- and guest parties/households for grouped seating.

ALTER TABLE tables ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE tables ADD CONSTRAINT chk_tables_kind CHECK (kind IN ('standard','head','sweetheart'));

ALTER TABLE guests ADD COLUMN party TEXT;

CREATE INDEX idx_guests_party ON guests(event_id, party);
