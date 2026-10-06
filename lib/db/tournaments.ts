import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  generatePlayoffBracket,
  generateRoundRobinPairings,
  shuffleInPlace,
  sortStandings,
  type Standing,
} from "@/lib/tournament/bracket";
import { drawRandomPairs, isPairKnockoutFormat } from "@/lib/tournament/pair-draw";
import { getPlayoffRoundCount } from "@/lib/tournament/playoff-display";
import { generateTournamentName } from "@/lib/tournament/name";
import {
  isMissingVariantColumnError,
  normalizeTournamentVariant,
  variantFromTournamentRow,
  type TournamentVariant,
} from "@/lib/tournament/variant";
import { createGame } from "@/lib/db/games";
import {
  DEFAULT_TOURNAMENT_LEGS_TO_WIN,
  gameSettingsForTournament,
  parseTournamentSettings,
  type TournamentLegsToWin,
} from "@/lib/tournament/settings";

export function normalizeTournamentParticipantIds(ids: number[]): number[] {
  return [...new Set(ids)];
}

export async function assertChannelTournamentParticipants(
  channelId: string,
  participantIds: number[]
) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", channelId)
    .in("user_id", participantIds);

  if (error) throw error;

  const registered = new Set((data ?? []).map((m) => m.user_id));
  const missing = participantIds.filter((id) => !registered.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Игроки не в реестре канала: ${missing.join(", ")}. Пусть откроют мини-апп из канала.`
    );
  }
}

export async function createTournament(params: {
  channelId: string;
  name?: string;
  mode?: "301" | "501";
  variant?: TournamentVariant;
  participantIds: number[];
  /** Ignored for pair_ko; kept for API compat. */
  playoffSize?: 4 | 8;
  legsToWin?: TournamentLegsToWin;
  createdBy: number;
}) {
  const db = getSupabaseAdmin();
  const participantIds = normalizeTournamentParticipantIds(params.participantIds);

  if (participantIds.length < 3) {
    throw new Error("At least 3 participants required");
  }

  const name = params.name?.trim() || generateTournamentName();
  const mode = params.mode === "301" ? "301" : "501";

  const legsToWin = DEFAULT_TOURNAMENT_LEGS_TO_WIN;
  const variant = normalizeTournamentVariant(params.variant);
  const settings = { legsToWin, variant, format: "pair_ko" as const };

  // DB still requires 4|8 — unused for pair_ko advancement.
  const playoffSize =
    participantIds.length >= 8 ? 8 : 4;

  const baseRow = {
    channel_id: params.channelId,
    name,
    mode,
    playoff_size: playoffSize,
    settings,
    status: "round_robin" as const,
    created_by: params.createdBy,
  };

  let { data: tournament, error } = await db
    .from("tournaments")
    .insert({ ...baseRow, variant })
    .select()
    .single();

  if (error && isMissingVariantColumnError(error)) {
    ({ data: tournament, error } = await db
      .from("tournaments")
      .insert(baseRow)
      .select()
      .single());
  }

  if (error) throw error;
  if (!tournament) throw new Error("Tournament insert failed");

  try {
    const participants = participantIds.map((userId) => ({
      tournament_id: tournament.id,
      user_id: userId,
    }));
    const { error: participantsError } = await db
      .from("tournament_participants")
      .insert(participants);
    if (participantsError) throw participantsError;
  } catch (e) {
    await db.from("tournaments").delete().eq("id", tournament.id);
    throw e;
  }

  return getTournament(tournament.id);
}

/** Insert a knockout round: random pairs + bye rows (already won). */
async function insertPairKnockoutRound(
  tournamentId: string,
  round: number,
  playerIds: number[]
) {
  const db = getSupabaseAdmin();
  const { pairs, byes } = drawRandomPairs(playerIds);

  const rows = [
    ...pairs.map(([p1, p2], slot) => ({
      tournament_id: tournamentId,
      round,
      slot,
      player1_id: p1,
      player2_id: p2,
      winner_id: null as number | null,
    })),
    ...byes.map((byeId, i) => ({
      tournament_id: tournamentId,
      round,
      slot: pairs.length + i,
      player1_id: byeId,
      player2_id: null as number | null,
      winner_id: byeId,
    })),
  ];

  if (rows.length === 0) {
    throw new Error("Недостаточно игроков для раунда");
  }

  const { error } = await db.from("playoff_matches").insert(rows);
  if (error) throw error;
}

/**
 * First draw for pair_ko: random pairs, skip round-robin, enter playoff.
 * Legacy tournaments still get classic RR pairings.
 */
export async function drawRoundRobin(tournamentId: string) {
  const db = getSupabaseAdmin();
  const { tournament, participants, roundRobinMatches, playoffMatches } =
    await getTournament(tournamentId);

  if (tournament.status !== "round_robin") {
    throw new Error("Tournament is not in round robin stage");
  }

  const participantIds = participants.map((p) => p.user_id);
  if (participantIds.length < 3) {
    throw new Error("At least 3 participants required");
  }

  if (isPairKnockoutFormat(tournament.settings)) {
    if (playoffMatches.length > 0) {
      throw new Error("Жеребьёвка уже проведена");
    }
    await insertPairKnockoutRound(tournamentId, 1, participantIds);
    await db
      .from("tournaments")
      .update({ status: "playoff" })
      .eq("id", tournamentId);
    return getTournament(tournamentId);
  }

  if (roundRobinMatches.length > 0) {
    throw new Error("Round robin draw already completed");
  }

  const pairings = shuffleInPlace(
    generateRoundRobinPairings(participantIds)
  );
  const matches = pairings.map(([p1, p2]) => ({
    tournament_id: tournamentId,
    player1_id: p1,
    player2_id: p2,
  }));

  const { data: inserted, error } = await db
    .from("round_robin_matches")
    .insert(matches)
    .select();

  if (error) throw error;

  return {
    tournament,
    roundRobinMatches: inserted ?? [],
  };
}

/** After all pairs in a round have winners, re-draw survivors into the next round. */
export async function maybeAdvancePairKnockout(tournamentId: string) {
  const db = getSupabaseAdmin();
  const { tournament, playoffMatches } = await getTournament(tournamentId);
  if (!isPairKnockoutFormat(tournament.settings)) return;
  if (tournament.status !== "playoff") return;
  if (playoffMatches.length === 0) return;

  const maxRound = Math.max(...playoffMatches.map((m) => m.round));
  const current = playoffMatches.filter((m) => m.round === maxRound);
  if (!current.every((m) => m.winner_id != null)) return;

  const winners = current
    .map((m) => m.winner_id as number)
    .filter((id) => Number.isFinite(id));

  if (winners.length <= 1) {
    // Champion decided — leave status playoff until finishTournament.
    return;
  }

  const nextExists = playoffMatches.some((m) => m.round === maxRound + 1);
  if (nextExists) return;

  await insertPairKnockoutRound(tournamentId, maxRound + 1, winners);
}


export async function getTournament(tournamentId: string) {
  const db = getSupabaseAdmin();
  const { data: tournament, error: tournamentError } = await db
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();

  if (tournamentError || !tournament) {
    throw new Error("Tournament not found");
  }

  const tournamentWithVariant = {
    ...tournament,
    variant: variantFromTournamentRow(tournament),
  };

  const { data: participants } = await db
    .from("tournament_participants")
    .select("*, users(first_name, username, photo_url)")
    .eq("tournament_id", tournamentId);

  const { data: rrMatches } = await db
    .from("round_robin_matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("id");

  const { data: playoffMatches } = await db
    .from("playoff_matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("round")
    .order("slot");

  const standings = buildStandings(participants ?? [], rrMatches ?? []);

  return {
    tournament: tournamentWithVariant,
    participants: participants ?? [],
    roundRobinMatches: rrMatches ?? [],
    playoffMatches: playoffMatches ?? [],
    standings,
  };
}

function buildStandings(
  participants: Array<{
    user_id: number;
    rr_points: number;
    rr_legs_diff: number;
    users?: { first_name: string; username: string | null };
  }>,
  matches: Array<{
    player1_id: number;
    player2_id: number;
    points_p1: number | null;
    points_p2: number | null;
    played: boolean;
  }>
): Standing[] {
  const map = new Map<number, Standing>();

  for (const p of participants) {
    map.set(p.user_id, {
      userId: p.user_id,
      points: p.rr_points,
      legsDiff: p.rr_legs_diff,
      name:
        p.users?.first_name ??
        p.users?.username ??
        String(p.user_id),
    });
  }

  for (const m of matches) {
    if (!m.played || m.points_p1 == null) continue;
    const s1 = map.get(m.player1_id);
    const s2 = map.get(m.player2_id);
    if (s1) s1.points += m.points_p1;
    if (s2 && m.points_p2 != null) s2.points += m.points_p2;
  }

  return sortStandings([...map.values()]);
}

export async function startPlayoff(tournamentId: string) {
  const db = getSupabaseAdmin();
  const { tournament, standings } = await getTournament(tournamentId);
  const qualified = standings
    .slice(0, tournament.playoff_size)
    .map((s) => s.userId);

  const seeds = generatePlayoffBracket(qualified, tournament.playoff_size as 4 | 8);
  await db.from("playoff_matches").insert(
    seeds.map((s) => ({
      tournament_id: tournamentId,
      round: s.round,
      slot: s.slot,
      player1_id: s.player1Id,
      player2_id: s.player2Id,
    }))
  );

  await db
    .from("tournaments")
    .update({ status: "playoff" })
    .eq("id", tournamentId);

  return getTournament(tournamentId);
}

export async function createMatchGame(
  tournamentId: string,
  matchId: string,
  matchType: "rr" | "playoff",
  channelId: string,
  createdBy: number
) {
  const db = getSupabaseAdmin();
  const table = matchType === "rr" ? "round_robin_matches" : "playoff_matches";

  const { data: match } = await db
    .from(table)
    .select("*")
    .eq("id", matchId)
    .single();

  if (!match) throw new Error("MATCH_NOT_FOUND");

  const { tournament } = await getTournament(tournamentId);
  const playerIds =
    matchType === "rr"
      ? [match.player1_id, match.player2_id]
      : [match.player1_id, match.player2_id].filter(Boolean);

  if (playerIds.length < 2) throw new Error("PLAYERS_NOT_READY");

  const tournamentSettings = parseTournamentSettings(tournament.settings);
  const isPairKo = isPairKnockoutFormat(tournament.settings);
  const playoffSize = tournament.playoff_size === 8 ? 8 : 4;
  const { playoffMatches } = await getTournament(tournamentId);
  const maxRound =
    playoffMatches.length > 0
      ? Math.max(...playoffMatches.map((m) => m.round))
      : getPlayoffRoundCount(playoffSize);
  const isFinalMatch =
    matchType === "playoff" &&
    (isPairKo
      ? match.round === maxRound
      : match.round === getPlayoffRoundCount(playoffSize));

  const { game } = await createGame({
    channelId,
    mode: tournament.mode,
    playerIds: playerIds as number[],
    createdBy,
    settings: gameSettingsForTournament(tournament.mode, tournamentSettings, {
      final: isFinalMatch || isPairKo,
    }),
    tournamentMatchId: matchId,
  });

  await db.from(table).update({ game_id: game.id }).eq("id", matchId);

  return game;
}

export async function listChannelTournaments(channelId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("tournaments")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function listCreatorActiveTournaments(
  channelId: string,
  createdBy: number
) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("tournaments")
    .select("id, name, status, settings, created_at, created_by")
    .eq("channel_id", channelId)
    .eq("created_by", createdBy)
    .in("status", ["round_robin", "playoff"])
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function listChannelActiveTournaments(channelId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("tournaments")
    .select("id, name, status, settings, created_at")
    .eq("channel_id", channelId)
    .in("status", ["round_robin", "playoff"])
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function listChannelFinishedTournaments(channelId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("tournaments")
    .select("id, name, status, settings, created_at")
    .eq("channel_id", channelId)
    .eq("status", "finished")
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Close tournament for the channel archive (requires a decided final). */
export async function finishTournament(tournamentId: string) {
  const { tournament, playoffMatches } = await getTournament(tournamentId);
  if (tournament.status === "finished") {
    return;
  }
  if (tournament.status !== "playoff") {
    throw new Error("Завершить можно только турнир на стадии плей-офф");
  }
  if (playoffMatches.length === 0) {
    throw new Error("Плей-офф ещё не начат");
  }

  const maxRound = Math.max(...playoffMatches.map((m) => m.round));
  const finals = playoffMatches.filter((m) => m.round === maxRound);
  if (finals.length === 0 || !finals.every((m) => m.winner_id != null)) {
    throw new Error("Сначала нужно определить победителя в финале");
  }

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("tournaments")
    .update({ status: "finished" })
    .eq("id", tournamentId);
  if (error) throw error;
}

export async function deleteTournament(tournamentId: string) {
  const db = getSupabaseAdmin();

  const { data: rr } = await db
    .from("round_robin_matches")
    .select("game_id")
    .eq("tournament_id", tournamentId);
  const { data: po } = await db
    .from("playoff_matches")
    .select("game_id")
    .eq("tournament_id", tournamentId);

  const gameIds = [...(rr ?? []), ...(po ?? [])]
    .map((m) => m.game_id)
    .filter((id): id is string => Boolean(id));

  if (gameIds.length > 0) {
    await db.from("throws").delete().in("game_id", gameIds);
    await db.from("game_players").delete().in("game_id", gameIds);
    await db.from("games").delete().in("id", gameIds);
  }

  const { error } = await db
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);
  if (error) throw error;
}
