-- Shared TV boards for tournaments and free games (code → live payload).
CREATE TABLE IF NOT EXISTS public.tv_boards (
  board_key TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('tournament', 'game')),
  ref_id TEXT NOT NULL,
  channel_id UUID,
  title TEXT NOT NULL DEFAULT '',
  live JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tv_boards_code_idx ON public.tv_boards (code);
CREATE INDEX IF NOT EXISTS tv_boards_updated_at_idx ON public.tv_boards (updated_at DESC);

ALTER TABLE public.tv_boards ENABLE ROW LEVEL SECURITY;
