ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS awaiting_visit_end BOOLEAN NOT NULL DEFAULT false;
