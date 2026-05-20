import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTournament } from "@/lib/db/tournaments";

/** Mark tournament finished when the final playoff match has a winner. */
export async function maybeMarkTournamentFinished(tournamentId: string) {
  const { tournament, playoffMatches } = await getTournament(tournamentId);
  if (tournament.status !== "playoff" || playoffMatches.length === 0) {
    return;
  }

  const maxRound = Math.max(...playoffMatches.map((m) => m.round));
  const finals = playoffMatches.filter((m) => m.round === maxRound);
  if (finals.length === 0) return;

  const allDecided = finals.every((m) => m.winner_id != null);
  if (!allDecided) return;

  const db = getSupabaseAdmin();
  await db
    .from("tournaments")
    .update({ status: "finished" })
    .eq("id", tournamentId);
}
