import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  applyVisit,
  calculatePpr,
  defaultSettings,
  throwPoints,
  type GameSettings,
  type ThrowInput,
} from "@/lib/darts/rules";
import { segmentFromDb, segmentToDb } from "@/lib/game/throws-from-db";
import { getActiveVisitIndex } from "@/lib/darts/visit-index";
import { getTournamentContextForMatch } from "@/lib/tournament/game-context";
import { isPairKnockoutFormat } from "@/lib/tournament/pair-draw";
import { isMultiplayerGame } from "@/lib/game/multiplayer";
import {
  FINISHED_GAME_STATUSES,
  isFinishedGameStatus,
} from "@/lib/game/status";

export { isFinishedGameStatus, FINISHED_GAME_STATUSES };

export type GameRow = {
  id: string;
  channel_id: string;
  mode: "301" | "501";
  status: string;
  settings: GameSettings;
  current_player_index: number;
  current_leg: number;
  current_round: number;
  tournament_match_id: string | null;
};

export type GamePlayerRow = {
  id: string;
  game_id: string;
  user_id: number;
  order_index: number;
  remaining_score: number;
  legs_won: number;
  visit_score: number;
  darts_thrown: number;
  score_at_visit_start: number;
  awaiting_visit_end: boolean;
  users?: {
    first_name: string;
    username: string | null;
    photo_url: string | null;
  };
};

function parseSettings(mode: "301" | "501", raw: unknown): GameSettings {
  if (raw && typeof raw === "object") {
    return { ...defaultSettings(mode), ...(raw as GameSettings) };
  }
  return defaultSettings(mode);
}

export async function createGame(params: {
  channelId: string;
  mode: "301" | "501";
  playerIds: number[];
  createdBy: number;
  settings?: Partial<GameSettings>;
  tournamentMatchId?: string;
}) {
  const db = getSupabaseAdmin();
  const settings = {
    ...defaultSettings(params.mode),
    ...params.settings,
  };

  const { data: game, error } = await db
    .from("games")
    .insert({
      channel_id: params.channelId,
      mode: params.mode,
      settings,
      created_by: params.createdBy,
      tournament_match_id: params.tournamentMatchId ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  const players = params.playerIds.map((userId, order_index) => ({
    game_id: game.id,
    user_id: userId,
    order_index,
    remaining_score: settings.startingScore,
    score_at_visit_start: settings.startingScore,
    legs_won: 0,
    visit_score: 0,
    darts_thrown: 0,
    awaiting_visit_end: false,
  }));

  const { error: pErr } = await db.from("game_players").insert(players);
  if (pErr) throw pErr;

  return getGame(game.id);
}

export async function getGame(gameId: string) {
  const db = getSupabaseAdmin();
  const { data: game, error } = await db
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();
  if (error) throw error;

  const { data: players } = await db
    .from("game_players")
    .select("*, users(first_name, username, photo_url)")
    .eq("game_id", gameId)
    .order("order_index");

  const settings = parseSettings(game.mode, game.settings);

  const enriched = (players ?? []).map((p) => ({
    ...p,
    ppr: calculatePpr(settings.startingScore, p.remaining_score, p.darts_thrown),
  }));

  const active = enriched.find(
    (p) => p.order_index === game.current_player_index
  );
  let activeVisitThrows: ThrowInput[] = [];
  if (active && game.status === "active") {
    activeVisitThrows = await getCurrentVisitThrows(gameId, active.id);
  }

  const tournamentContext = game.tournament_match_id
    ? await getTournamentContextForMatch(game.tournament_match_id)
    : null;

  return {
    game: { ...game, settings },
    players: enriched,
    activeVisitThrows,
    tournamentContext,
  };
}

export async function recordThrow(
  gameId: string,
  input: ThrowInput
): Promise<{ game: GameRow; players: GamePlayerRow[]; bust?: boolean }> {
  const db = getSupabaseAdmin();
  const { game, players } = await getGame(gameId);
  if (game.status !== "active") throw new Error("GAME_NOT_ACTIVE");

  const settings = parseSettings(game.mode, game.settings);
  const active = players.find(
    (p) => p.order_index === game.current_player_index
  );
  if (!active) throw new Error("NO_ACTIVE_PLAYER");
  if (active.awaiting_visit_end) throw new Error("VISIT_FULL");

  const visitThrows = await getCurrentVisitThrows(gameId, active.id);
  if (visitThrows.length >= 3) throw new Error("VISIT_FULL");

  const points = throwPoints(input);
  const dartIndex = visitThrows.length + 1;
  const visitIndex = getActiveVisitIndex(
    active.darts_thrown,
    active.visit_score,
    active.awaiting_visit_end
  );

  await db.from("throws").insert({
    game_id: gameId,
    game_player_id: active.id,
    visit_index: visitIndex,
    dart_index: dartIndex,
    segment: segmentToDb(input.segment),
    multiplier: input.multiplier,
    points,
  });

  const newVisitThrows = [...visitThrows, input];
  const visitTotal = newVisitThrows.reduce((s, t) => s + throwPoints(t), 0);
  const bust = applyVisit(
    active.score_at_visit_start,
    newVisitThrows,
    settings
  ).bust;

  const newDartsThrown = active.darts_thrown + 1;

  await db
    .from("game_players")
    .update({
      visit_score: bust ? 0 : visitTotal,
      darts_thrown: newDartsThrown,
      remaining_score: bust
        ? active.score_at_visit_start
        : active.score_at_visit_start - visitTotal,
      awaiting_visit_end: newDartsThrown % 3 === 0,
    })
    .eq("id", active.id);

  return getGame(gameId);
}

async function getVisitThrows(
  gameId: string,
  gamePlayerId: string,
  visitIndex: number
): Promise<ThrowInput[]> {
  const db = getSupabaseAdmin();
  const { data: throws } = await db
    .from("throws")
    .select("*")
    .eq("game_id", gameId)
    .eq("game_player_id", gamePlayerId)
    .eq("visit_index", visitIndex)
    .order("dart_index");

  return (throws ?? []).map((t) =>
    segmentFromDb(t.segment, t.multiplier)
  );
}

async function getCurrentVisitThrows(
  gameId: string,
  gamePlayerId: string
): Promise<ThrowInput[]> {
  const db = getSupabaseAdmin();
  const { data: player } = await db
    .from("game_players")
    .select("darts_thrown, visit_score, awaiting_visit_end")
    .eq("id", gamePlayerId)
    .single();

  const visitIndex = getActiveVisitIndex(
    player?.darts_thrown ?? 0,
    player?.visit_score ?? 0,
    player?.awaiting_visit_end ?? false
  );

  return getVisitThrows(gameId, gamePlayerId, visitIndex);
}

/** Отменяет бросок или возврат после случайного «следующий игрок» */
export async function undoLastThrow(gameId: string) {
  const db = getSupabaseAdmin();
  const { game, players } = await getGame(gameId);
  const active = players.find(
    (p) => p.order_index === game.current_player_index
  );
  if (!active) throw new Error("NO_ACTIVE_PLAYER");

  const activeThrows = await getCurrentVisitThrows(gameId, active.id);
  if (activeThrows.length > 0) {
    const visitIndex = getActiveVisitIndex(
      active.darts_thrown,
      active.visit_score,
      active.awaiting_visit_end
    );
    const { data: lastThrow } = await db
      .from("throws")
      .select("*")
      .eq("game_id", gameId)
      .eq("game_player_id", active.id)
      .eq("visit_index", visitIndex)
      .order("dart_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastThrow) throw new Error("NOTHING_TO_UNDO");

    await db.from("throws").delete().eq("id", lastThrow.id);

    const visitThrows = await getCurrentVisitThrows(gameId, active.id);
    const visitTotal = visitThrows.reduce((s, t) => s + throwPoints(t), 0);
    const bust =
      visitThrows.length > 0 &&
      applyVisit(
        active.score_at_visit_start,
        visitThrows,
        parseSettings(game.mode, game.settings)
      ).bust;

    const newDartsThrown = Math.max(0, active.darts_thrown - 1);

    await db
      .from("game_players")
      .update({
        visit_score: bust ? 0 : visitTotal,
        darts_thrown: newDartsThrown,
        remaining_score: bust
          ? active.score_at_visit_start
          : active.score_at_visit_start - visitTotal,
        awaiting_visit_end: newDartsThrown > 0 && newDartsThrown % 3 === 0,
      })
      .eq("id", active.id);

    return getGame(gameId);
  }

  const reverted = await revertLastEndVisit(gameId, game, players, active);
  if (!reverted) throw new Error("NOTHING_TO_UNDO");

  return getGame(gameId);
}

async function revertLastEndVisit(
  gameId: string,
  game: GameRow,
  players: GamePlayerRow[],
  active: GamePlayerRow
): Promise<boolean> {
  const db = getSupabaseAdmin();
  const settings = parseSettings(game.mode, game.settings);
  const playerCount = players.length;
  const prevIndex =
    (game.current_player_index - 1 + playerCount) % playerCount;
  const prev = players.find((p) => p.order_index === prevIndex);
  if (!prev || prev.darts_thrown === 0 || prev.darts_thrown % 3 !== 0) {
    return false;
  }

  const activeVisitIndex = getActiveVisitIndex(
    active.darts_thrown,
    active.visit_score,
    active.awaiting_visit_end
  );
  const activeThrows = await getVisitThrows(
    gameId,
    active.id,
    activeVisitIndex
  );
  if (activeThrows.length > 0) return false;

  const prevVisitIndex = prev.darts_thrown / 3 - 1;
  const prevThrows = await getVisitThrows(gameId, prev.id, prevVisitIndex);
  if (prevThrows.length === 0) return false;

  const visitTotal = prevThrows.reduce((s, t) => s + throwPoints(t), 0);
  let visitStartScore = prev.remaining_score + visitTotal;
  const result = applyVisit(visitStartScore, prevThrows, settings);

  if (result.legWon) return false;

  if (result.bust) {
    visitStartScore = prev.remaining_score;
  }

  await db
    .from("game_players")
    .update({
      remaining_score: result.bust
        ? visitStartScore
        : visitStartScore - visitTotal,
      visit_score: result.bust ? 0 : visitTotal,
      score_at_visit_start: visitStartScore,
      darts_thrown: prevVisitIndex * 3 + 3,
      awaiting_visit_end: true,
    })
    .eq("id", prev.id);

  let nextRound = game.current_round;
  if ((prevIndex + 1) % playerCount === 0) {
    nextRound = Math.max(1, nextRound - 1);
  }

  await db
    .from("games")
    .update({
      current_player_index: prevIndex,
      current_round: nextRound,
    })
    .eq("id", gameId);

  return true;
}

export async function endVisit(gameId: string) {
  const db = getSupabaseAdmin();
  const { game, players } = await getGame(gameId);
  const settings = parseSettings(game.mode, game.settings);
  const active = players.find(
    (p) => p.order_index === game.current_player_index
  );
  if (!active) throw new Error("NO_ACTIVE_PLAYER");

  const visitIndex = getActiveVisitIndex(
    active.darts_thrown,
    active.visit_score,
    active.awaiting_visit_end
  );
  let visitThrows = await getVisitThrows(gameId, active.id, visitIndex);

  while (visitThrows.length < 3) {
    const dartIndex = visitThrows.length + 1;
    await db.from("throws").insert({
      game_id: gameId,
      game_player_id: active.id,
      visit_index: visitIndex,
      dart_index: dartIndex,
      segment: "miss",
      multiplier: 1,
      points: 0,
    });
    visitThrows = [...visitThrows, { segment: "miss", multiplier: 1 }];
  }

  const visitStartDarts = visitIndex * 3;
  const visitTotal = visitThrows.reduce((s, t) => s + throwPoints(t), 0);

  await db
    .from("game_players")
    .update({
      visit_score: visitTotal,
      darts_thrown: visitStartDarts + 3,
      remaining_score: active.score_at_visit_start - visitTotal,
    })
    .eq("id", active.id);

  const result = applyVisit(
    active.score_at_visit_start,
    visitThrows,
    settings
  );

  let legsWon = active.legs_won;
  let remaining = result.bust
    ? active.score_at_visit_start
    : result.remaining;

  if (result.legWon) {
    legsWon += 1;
    remaining = settings.startingScore;
  }

  await db
    .from("game_players")
    .update({
      remaining_score: remaining,
      legs_won: legsWon,
      visit_score: 0,
      score_at_visit_start: remaining,
      awaiting_visit_end: false,
    })
    .eq("id", active.id);

  let gameFinished = false;
  let nextPlayerIndex =
    (game.current_player_index + 1) % players.length;
  let nextLeg = game.current_leg;
  let nextRound = game.current_round;

  if (result.legWon && legsWon >= settings.legsToWin) {
    gameFinished = true;
    await db
      .from("games")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
      })
      .eq("id", gameId);

    if (game.tournament_match_id) {
      await handleTournamentMatchWin(
        game.tournament_match_id,
        active.user_id
      );
    }
  } else {
    if (nextPlayerIndex === 0) {
      nextRound += 1;
    }
    if (result.legWon) {
      nextLeg += 1;
      nextRound = 1;
      for (const p of players) {
        if (p.id !== active.id) {
          await db
            .from("game_players")
            .update({
              remaining_score: settings.startingScore,
              score_at_visit_start: settings.startingScore,
              visit_score: 0,
              awaiting_visit_end: false,
            })
            .eq("id", p.id);
        }
      }
    }

    await db
      .from("games")
      .update({
        current_player_index: nextPlayerIndex,
        current_leg: nextLeg,
        current_round: nextRound,
      })
      .eq("id", gameId);
  }

  return getGame(gameId);
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
      await db
        .from("playoff_matches")
        .update({ [field]: winnerId })
        .eq("id", nextRound.id);
    }
  }
}

export async function restartGame(gameId: string) {
  const db = getSupabaseAdmin();
  const { game, players } = await getGame(gameId);
  const settings = parseSettings(game.mode, game.settings);

  await db.from("throws").delete().eq("game_id", gameId);

  await db
    .from("games")
    .update({
      status: "active",
      current_player_index: 0,
      current_leg: 1,
      current_round: 1,
      finished_at: null,
    })
    .eq("id", gameId);

  for (const p of players) {
    await db
      .from("game_players")
      .update({
        remaining_score: settings.startingScore,
        score_at_visit_start: settings.startingScore,
        legs_won: 0,
        visit_score: 0,
        darts_thrown: 0,
        awaiting_visit_end: false,
      })
      .eq("id", p.id);
  }

  return getGame(gameId);
}

export async function cancelGame(gameId: string) {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("games")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("id", gameId);

  if (error) throw error;
  return getGame(gameId);
}

export async function listChannelGames(channelId: string, limit = 50) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("games")
    .select(
      `
      id, mode, status, settings, created_at, finished_at, current_round,
      game_players (
        user_id, legs_won, remaining_score,
        users (first_name, username, photo_url)
      )
    `
    )
    .eq("channel_id", channelId)
    .eq("status", "finished")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).filter((g) => isMultiplayerGame(g.game_players));
}

export async function listChannelActiveGames(channelId: string, limit = 50) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("games")
    .select(
      `
      id, mode, status, settings, created_at, finished_at, current_round,
      game_players (
        user_id, legs_won, remaining_score,
        users (first_name, username, photo_url)
      )
    `
    )
    .eq("channel_id", channelId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).filter((g) => isMultiplayerGame(g.game_players));
}
