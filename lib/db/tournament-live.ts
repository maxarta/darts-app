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

/**
 * Atomically patch settings.tvLive so concurrent settings writes
 * (tvCode, etc.) cannot wipe the live board.
 */
export async function setTournamentTvLive(
  tournamentId: string,
  live: TvLivePayload | null
): Promise<TvLivePayload | null> {
  const db = getSupabaseAdmin();
  const { error } = await db.rpc("set_tournament_tv_live", {
    p_tournament_id: tournamentId,
    p_live: live,
  });
  if (error) {
    // Fallback for environments without the RPC yet.
    console.warn("[tv-live] rpc failed, fallback merge", error.message);
    return setTournamentTvLiveFallback(tournamentId, live);
  }
  return live;
}

async function setTournamentTvLiveFallback(
  tournamentId: string,
  live: TvLivePayload | null
): Promise<TvLivePayload | null> {
  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
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
    if (!error) return live;
    if (attempt === 2) throw error;
  }
  return live;
}
