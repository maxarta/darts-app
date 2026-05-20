-- Tournament variant: standard | kenny (admin-only create)
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS tournaments_variant_check;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_variant_check
  CHECK (variant IN ('standard', 'kenny'));
