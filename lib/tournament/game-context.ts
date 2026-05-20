import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  getPlayoffRoundCount,
  getPlayoffRoundTitle,
} from "@/lib/tournament/playoff-display";
import {
  variantFromTournamentRow,
  type TournamentVariant,
} from "@/lib/tournament/variant";

export type GameTournamentContext = {
  tournamentId: string;
  name: string;
  stage: string;
  variant?: TournamentVariant;
};

export async function getTournamentContextForMatch(
  matchId: string
): Promise<GameTournamentContext | null> {
  const db = getSupabaseAdmin();

  const { data: rr } = await db
    .from("round_robin_matches")
    .select("tournament_id")
    .eq("id", matchId)
    .maybeSingle();

  if (rr) {
    const { data: tournament } = await db
      .from("tournaments")
      .select("id, name, variant, settings")
      .eq("id", rr.tournament_id)
      .single();
    if (!tournament) return null;
    return {
      tournamentId: tournament.id,
      name: tournament.name,
      stage: "Круговой этап",
      variant: variantFromTournamentRow(tournament),
    };
  }

  const { data: po } = await db
    .from("playoff_matches")
    .select("tournament_id, round")
    .eq("id", matchId)
    .maybeSingle();

  if (!po) return null;

  const { data: tournament } = await db
    .from("tournaments")
    .select("id, name, playoff_size, variant, settings")
    .eq("id", po.tournament_id)
    .single();

  if (!tournament) return null;

  const playoffSize = tournament.playoff_size === 8 ? 8 : 4;
  const totalRounds = getPlayoffRoundCount(playoffSize);

  return {
    tournamentId: tournament.id,
    name: tournament.name,
    stage: getPlayoffRoundTitle(po.round, totalRounds),
    variant: variantFromTournamentRow(tournament),
  };
}

export function formatTournamentMatchCondition(
  mode: 301 | 501 | "301" | "501",
  legsToWin: number
): string {
  return `${mode} · до ${legsToWin} побед`;
}

export function formatTournamentHeaderSubtitle(
  stage: string,
  mode: 301 | 501 | "301" | "501",
  legsToWin: number
): string {
  const wins =
    legsToWin === 1 ? "1 победы" : `${legsToWin} побед`;
  return `${stage} • ${mode} до ${wins}`;
}
