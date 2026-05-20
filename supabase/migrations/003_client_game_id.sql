ALTER TABLE games
  ADD COLUMN IF NOT EXISTS client_game_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS games_client_game_id_idx ON games (client_game_id)
  WHERE client_game_id IS NOT NULL;
