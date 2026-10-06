-- Allow session-scoped TV boards (free games across rematches).
ALTER TABLE public.tv_boards
  DROP CONSTRAINT IF EXISTS tv_boards_kind_check;

ALTER TABLE public.tv_boards
  ADD CONSTRAINT tv_boards_kind_check
  CHECK (kind IN ('tournament', 'game', 'channel'));

CREATE INDEX IF NOT EXISTS tv_boards_channel_id_idx
  ON public.tv_boards (channel_id)
  WHERE channel_id IS NOT NULL;
