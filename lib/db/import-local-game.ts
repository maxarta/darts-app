import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  defaultSettings,
  type GameSettings,
} from "@/lib/darts/rules";
import { getGame } from "@/lib/db/games";
import { isPairKnockoutFormat } from "@/lib/tournament/pair-draw";

export type ImportLocalGameParams = {
  localId: string;
  channelId: string;
  mode: "301" | "501";
  settings: GameSettings;
  playerIds: number[];
  createdBy: number;
  tournamentMatchId: string | null;
  tournamentMatchType: "rr" | "playoff" | null;
  status: "active" | "finished" | "cancelled";
  currentPlayerIndex: number;
  currentLeg: number;
  currentRound: number;
  players: Array<{
    orderIndex: number;
    userId: number;
    remainingScore: number;
    legsWon: number;
    visitScore: number;
    dartsThrown: number;
    scoreAtVisitStart: number;
    awaitingVisitEnd: boolean;
  }>;
  throws: Array<{
    orderIndex: number;
    visitIndex: number;
    dartIndex: number;
    segment: string;
    multiplier: number;
    points: number;
  }>;
};

export function findFinishedGameWinner(
  params: ImportLocalGameParams
): number | null {
  const settings = {
    ...defaultSettings(params.mode),
    ...params.settings,
  };
  const legsToWin = settings.legsToWin ?? 1;
  const byLegs = params.players.find((p) => p.legsWon >= legsToWin);
  if (byLegs) return byLegs.userId;

  if (params.status !== "finished") return null;

  const atZero = params.players.filter((p) => p.remainingScore === 0);
  if (atZero.length === 1) return atZero[0]!.userId;

  return null;
}

async function handleTournamentMatchWin(
  matchRef: string,
  winnerId: number
) {
  const db = getSupabaseAdmin();

  const { data: rr } = await db
    .from("round_robin_matches")
    .select("*")
    .eq("id", matchRef)
    .maybeSingle();

  if (rr) {
    if (rr.played) return;
    const p1Win = rr.player1_id === winnerId;
    await db
      .from("round_robin_matches")
      .update({
        played: true,
        points_p1: p1Win ? 2 : 0,
        points_p2: p1Win ? 0 : 2,
      })
      .eq("id", matchRef);
    return;
  }

  const { data: po } = await db
    .from("playoff_matches")
    .select("*")
    .eq("id", matchRef)
    .maybeSingle();

  if (po) {
    if (po.winner_id) return;
    await db
      .from("playoff_matches")
      .update({ winner_id: winnerId })
      .eq("id", matchRef);

    const { data: tournament } = await db
      .from("tournaments")
      .select("settings")
      .eq("id", po.tournament_id)
      .maybeSingle();

    if (isPairKnockoutFormat(tournament?.settings)) {
      const { maybeAdvancePairKnockout } = await import("@/lib/db/tournaments");
      await maybeAdvancePairKnockout(po.tournament_id);
      return;
    }

    const { data: nextRound } = await db
      .from("playoff_matches")
      .select("*")
      .eq("tournament_id", po.tournament_id)
      .eq("round", po.round + 1)
      .eq("slot", Math.floor(po.slot / 2))
      .maybeSingle();

    if (nextRound) {
      const field = po.slot % 2 === 0 ? "player1_id" : "player2_id";
      // Don't overwrite a slot that already has a player.
      if (nextRound[field] == null) {
        await db
          .from("playoff_matches")
          .update({ [field]: winnerId })
          .eq("id", nextRound.id);
      }
    }
  }
}

async function linkTournamentMatchGame(
  matchId: string,
  matchType: "rr" | "playoff",
  gameId: string
) {
  const db = getSupabaseAdmin();
  const table =
    matchType === "rr" ? "round_robin_matches" : "playoff_matches";
  await db.from(table).update({ game_id: gameId }).eq("id", matchId);
}

/** Idempotent: safe to call again after a dropped HTTP response. */
async function applyFinishedTournamentResult(
  params: ImportLocalGameParams,
  gameId: string
) {
  if (!params.tournamentMatchId || !params.tournamentMatchType) return;
  if (params.status !== "finished") return;

  await linkTournamentMatchGame(
    params.tournamentMatchId,
    params.tournamentMatchType,
    gameId
  );

  const winnerId = findFinishedGameWinner(params);
  if (winnerId) {
    await handleTournamentMatchWin(params.tournamentMatchId, winnerId);
  }
}

export async function importLocalGame(params: ImportLocalGameParams) {
  const db = getSupabaseAdmin();

  const { data: existing } = await db
    .from("games")
    .select("id, status")
    .eq("client_game_id", params.localId)
    .maybeSingle();

  if (existing) {
    // Retry after a lost response: finish tournament advancement if needed.
    if (params.status === "finished") {
      if (existing.status !== "finished") {
        await db
          .from("games")
          .update({
            status: "finished",
            finished_at: new Date().toISOString(),
            current_player_index: params.currentPlayerIndex,
            current_leg: params.currentLeg,
            current_round: params.currentRound,
          })
          .eq("id", existing.id);
      }
      await applyFinishedTournamentResult(params, existing.id);
    }
    return getGame(existing.id);
  }

  const settings = {
    ...defaultSettings(params.mode),
    ...params.settings,
  };

  const finishedAt =
    params.status === "finished" || params.status === "cancelled"
      ? new Date().toISOString()
      : null;

  const { data: game, error: gameErr } = await db
    .from("games")
    .insert({
      channel_id: params.channelId,
      mode: params.mode,
      settings,
      created_by: params.createdBy,
      tournament_match_id: params.tournamentMatchId,
      client_game_id: params.localId,
      status: params.status,
      current_player_index: params.currentPlayerIndex,
      current_leg: params.currentLeg,
      current_round: params.currentRound,
      finished_at: finishedAt,
    })
    .select()
    .single();

  if (gameErr) throw gameErr;

  const playerRows = params.players.map((p) => ({
    game_id: game.id,
    user_id: p.userId,
    order_index: p.orderIndex,
    remaining_score: p.remainingScore,
    legs_won: p.legsWon,
    visit_score: p.visitScore,
    darts_thrown: p.dartsThrown,
    score_at_visit_start: p.scoreAtVisitStart,
    awaiting_visit_end: p.awaitingVisitEnd,
  }));

  const { data: insertedPlayers, error: pErr } = await db
    .from("game_players")
    .insert(playerRows)
    .select();

  if (pErr) throw pErr;

  const playerIdByOrder = new Map(
    (insertedPlayers ?? []).map((p) => [p.order_index, p.id])
  );

  if (params.throws.length > 0) {
    const throwRows = params.throws.map((t) => {
      const gamePlayerId = playerIdByOrder.get(t.orderIndex);
      if (!gamePlayerId) {
        throw new Error("PLAYER_NOT_FOUND_FOR_THROW");
      }
      return {
        game_id: game.id,
        game_player_id: gamePlayerId,
        visit_index: t.visitIndex,
        dart_index: t.dartIndex,
        segment: t.segment,
        multiplier: t.multiplier,
        points: t.points,
      };
    });

    const { error: tErr } = await db.from("throws").insert(throwRows);
    if (tErr) throw tErr;
  }

  // Never claim a tournament slot with a cancelled game — that soft-locks the match.
  if (
    params.status !== "cancelled" &&
    params.tournamentMatchId &&
    params.tournamentMatchType
  ) {
    await linkTournamentMatchGame(
      params.tournamentMatchId,
      params.tournamentMatchType,
      game.id
    );
  }

  if (params.status === "finished" && params.tournamentMatchId) {
    const winnerId = findFinishedGameWinner(params);
    if (winnerId) {
      await handleTournamentMatchWin(params.tournamentMatchId, winnerId);
    }
  }

  return getGame(game.id);
}
