import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { TvLivePayload } from "@/lib/tournament/tv-live";

export async function getTournamentTvLive(
  tournamentId: string
): Promise<TvLivePayload | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("tournaments")
    .select("settings")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw error;
  const settings = data?.settings;
  if (!settings || typeof settings !== "object") return null;
  const live = (settings as { tvLive?: unknown }).tvLive;
  if (!live || typeof live !== "object") return null;
  return live as TvLivePayload;
}

export async function setTournamentTvLive(
  tournamentId: string,
  live: TvLivePayload | null
): Promise<TvLivePayload | null> {
  const db = getSupabaseAdmin();
  const { data: row, error: readErr } = await db
    .from("tournaments")
    .select("settings")
    .eq("id", tournamentId)
    .single();
  if (readErr) throw readErr;

  const prev =
    row.settings && typeof row.settings === "object"
      ? { ...(row.settings as Record<string, unknown>) }
      : {};

  if (live == null) {
    delete prev.tvLive;
  } else {
    prev.tvLive = live;
  }

  const { error } = await db
    .from("tournaments")
    .update({ settings: prev })
    .eq("id", tournamentId);
  if (error) throw error;
  return live;
}
