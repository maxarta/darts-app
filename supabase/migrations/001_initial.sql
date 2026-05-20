-- Darts Telegram Mini App schema

CREATE TYPE game_mode AS ENUM ('301', '501');
CREATE TYPE game_status AS ENUM ('active', 'finished', 'cancelled');
CREATE TYPE tournament_status AS ENUM ('draft', 'round_robin', 'playoff', 'finished');

CREATE TABLE users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id BIGINT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE channel_members (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  mode game_mode NOT NULL DEFAULT '501',
  status game_status NOT NULL DEFAULT 'active',
  settings JSONB NOT NULL DEFAULT '{}',
  current_player_index INT NOT NULL DEFAULT 0,
  current_leg INT NOT NULL DEFAULT 1,
  current_round INT NOT NULL DEFAULT 1,
  tournament_match_id UUID,
  created_by BIGINT NOT NULL REFERENCES users(telegram_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id),
  order_index INT NOT NULL,
  remaining_score INT NOT NULL,
  legs_won INT NOT NULL DEFAULT 0,
  visit_score INT NOT NULL DEFAULT 0,
  darts_thrown INT NOT NULL DEFAULT 0,
  score_at_visit_start INT NOT NULL,
  UNIQUE (game_id, user_id),
  UNIQUE (game_id, order_index)
);

CREATE TABLE throws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  game_player_id UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  visit_index INT NOT NULL,
  dart_index INT NOT NULL CHECK (dart_index BETWEEN 1 AND 3),
  segment TEXT NOT NULL,
  multiplier INT NOT NULL CHECK (multiplier IN (0, 1, 2, 3)),
  points INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status tournament_status NOT NULL DEFAULT 'draft',
  mode game_mode NOT NULL DEFAULT '501',
  playoff_size INT NOT NULL DEFAULT 4 CHECK (playoff_size IN (4, 8)),
  settings JSONB NOT NULL DEFAULT '{}',
  created_by BIGINT NOT NULL REFERENCES users(telegram_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tournament_participants (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id),
  seed INT,
  rr_points INT NOT NULL DEFAULT 0,
  rr_legs_diff INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE round_robin_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player1_id BIGINT NOT NULL REFERENCES users(telegram_id),
  player2_id BIGINT NOT NULL REFERENCES users(telegram_id),
  game_id UUID REFERENCES games(id),
  points_p1 INT,
  points_p2 INT,
  played BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE playoff_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INT NOT NULL,
  slot INT NOT NULL,
  player1_id BIGINT REFERENCES users(telegram_id),
  player2_id BIGINT REFERENCES users(telegram_id),
  game_id UUID REFERENCES games(id),
  winner_id BIGINT REFERENCES users(telegram_id),
  UNIQUE (tournament_id, round, slot)
);

CREATE INDEX idx_games_channel ON games(channel_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_throws_game ON throws(game_id);
CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);
