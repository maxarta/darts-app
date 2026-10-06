-- Atomic TV live board updates (avoid wiping tvCode / other settings keys).
CREATE OR REPLACE FUNCTION public.set_tournament_tv_live(
  p_tournament_id uuid,
  p_live jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tournaments
  SET settings = CASE
    WHEN p_live IS NULL THEN COALESCE(settings, '{}'::jsonb) - 'tvLive'
    ELSE jsonb_set(COALESCE(settings, '{}'::jsonb), '{tvLive}', p_live, true)
  END
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tournament_tv_live(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tournament_tv_live(uuid, jsonb) TO service_role;
