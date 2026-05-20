import { getSupabaseAdmin } from "@/lib/supabase/server";
import { resolveStoredPhotoUrl } from "@/lib/telegram/user-photo";
import { type ThrowInput } from "@/lib/darts/rules";
import {
  gameIdsWithMinPlayers,
  isMultiplayerGame,
} from "@/lib/game/multiplayer";
import { segmentFromDb } from "@/lib/game/throws-from-db";
import {
  computePlayerStats,
  type FinishedGameForStats,
} from "@/lib/stats/player-stats";

async function getMultiplayerGameIdSet(
  gameIds: string[]
): Promise<Set<string>> {
  if (gameIds.length === 0) return new Set();
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("game_players")
    .select("game_id")
    .in("game_id", gameIds);
  if (error) throw error;
  return gameIdsWithMinPlayers(data ?? []);
}

function gameIdFromRow(row: { games: unknown }): string {
  const raw = row.games;
  const g = (Array.isArray(raw) ? raw[0] : raw) as { id: string };
  return g.id;
}

async function getChannelFinishedGamesForStats(
  channelId: string
): Promise<FinishedGameForStats[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("games")
    .select(
      `
      id, mode, settings, current_round,
      game_players (user_id, legs_won, remaining_score, darts_thrown)
    `
    )
    .eq("channel_id", channelId)
    .eq("status", "finished");

  if (error) throw error;

  return (data ?? []).filter((g) =>
    isMultiplayerGame(g.game_players)
  ) as FinishedGameForStats[];
}

export async function getPlayerStats(channelId: string, userId: number) {
  const games = await getChannelFinishedGamesForStats(channelId);
  return computePlayerStats(userId, games);
}

export async function getChannelLeaderboard(channelId: string) {
  const db = getSupabaseAdmin();
  const { data: members, error: membersErr } = await db
    .from("channel_members")
    .select("user_id, users(first_name, username, photo_url)")
    .eq("channel_id", channelId);

  if (membersErr) throw membersErr;

  const leaderboard = [];
  for (const m of members ?? []) {
    const stats = await getPlayerStats(channelId, m.user_id);
    const u = m.users as unknown as {
      first_name: string;
      username: string | null;
      photo_url: string | null;
    };
    leaderboard.push({
      userId: m.user_id,
      name: u?.first_name ?? u?.username ?? String(m.user_id),
      photoUrl: resolveStoredPhotoUrl(m.user_id, u?.photo_url),
      ...stats,
    });
  }

  return leaderboard.sort((a, b) => b.wins - a.wins || b.avgPpr - a.avgPpr);
}

export async function getPlayerGameHistory(
  channelId: string,
  userId: number,
  limit = 100
) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("game_players")
    .select(
      `
      legs_won, remaining_score, darts_thrown,
      games!inner (id, mode, status, created_at, finished_at, channel_id)
    `
    )
    .eq("user_id", userId)
    .eq("games.channel_id", channelId)
    .eq("games.status", "finished")
    .order("created_at", { ascending: false, foreignTable: "games" })
    .limit(limit);

  if (error) throw error;

  const rows = data ?? [];
  const gameIds = [...new Set(rows.map(gameIdFromRow))];
  const multiplayerIds = await getMultiplayerGameIdSet(gameIds);

  return rows.filter((row) => multiplayerIds.has(gameIdFromRow(row)));
}

export type PlayerGameThrows = {
  gameId: string;
  finishedAt: string | null;
  createdAt: string;
  throws: ThrowInput[];
};

type EligiblePlayerRow = {
  id: string;
  game_id: string;
  games: unknown;
};

function gameMetaFromPlayerRow(row: EligiblePlayerRow): {
  finishedAt: string | null;
  createdAt: string;
} {
  const gRaw = row.games;
  const g = (Array.isArray(gRaw) ? gRaw[0] : gRaw) as {
    finished_at: string | null;
    created_at: string;
  };
  return {
    finishedAt: g?.finished_at ?? null,
    createdAt: g?.created_at ?? "",
  };
}

async function getEligiblePlayerRows(
  channelId: string,
  userId: number,
  gameId?: string
): Promise<EligiblePlayerRow[]> {
  const db = getSupabaseAdmin();
  let query = db
    .from("game_players")
    .select(
      `
      id, game_id,
      games!inner (id, channel_id, status, finished_at, created_at)
    `
    )
    .eq("user_id", userId)
    .eq("games.channel_id", channelId)
    .eq("games.status", "finished");

  if (gameId) {
    query = query.eq("games.id", gameId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as EligiblePlayerRow[];
  const gameIds = [...new Set(rows.map((r) => r.game_id))];
  const multiplayerIds = await getMultiplayerGameIdSet(gameIds);
  return rows.filter((r) => multiplayerIds.has(r.game_id));
}

export async function getPlayerThrowsByGame(
  channelId: string,
  userId: number
): Promise<PlayerGameThrows[]> {
  const eligible = await getEligiblePlayerRows(channelId, userId);
  if (eligible.length === 0) return [];

  const gamePlayerIds = eligible.map((r) => r.id);
  const gameMeta = new Map(
    eligible.map((r) => [r.game_id, gameMetaFromPlayerRow(r)])
  );

  const db = getSupabaseAdmin();
  const { data: throwRows, error: throwErr } = await db
    .from("throws")
    .select(
      "segment, multiplier, visit_index, dart_index, game_id, game_player_id"
    )
    .in("game_player_id", gamePlayerIds)
    .order("visit_index")
    .order("dart_index");

  if (throwErr) throw throwErr;

  const grouped = new Map<string, ThrowInput[]>();
  for (const t of throwRows ?? []) {
    const list = grouped.get(t.game_id) ?? [];
    list.push(segmentFromDb(t.segment, t.multiplier));
    grouped.set(t.game_id, list);
  }

  return [...grouped.entries()]
    .map(([gameId, throws]) => {
      const meta = gameMeta.get(gameId)!;
      return {
        gameId,
        finishedAt: meta.finishedAt,
        createdAt: meta.createdAt,
        throws,
      };
    })
    .sort((a, b) => {
      const aTime = a.finishedAt ?? a.createdAt;
      const bTime = b.finishedAt ?? b.createdAt;
      return bTime.localeCompare(aTime);
    });
}

export async function getPlayerThrowsInChannel(
  channelId: string,
  userId: number,
  gameId?: string
): Promise<ThrowInput[]> {
  const byGame = await getPlayerThrowsByGame(channelId, userId);
  if (gameId) {
    return byGame.find((g) => g.gameId === gameId)?.throws ?? [];
  }
  return byGame.flatMap((g) => g.throws);
}
