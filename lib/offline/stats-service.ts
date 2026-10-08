"use client";

import type { ArchiveGameRow } from "@/components/stats/gameArchiveModel";
import { apiFetch } from "@/lib/api/client";
import {
  displayName,
  resolveUser,
  type ChannelMember,
} from "@/lib/channel/members";
import type { ThrowInput } from "@/lib/darts/rules";
import { isOnline } from "@/lib/game/sync/client";
import { listLocalGames } from "@/lib/game/local/store";
import type { LocalGameRecord } from "@/lib/game/local/types";
import { isMultiplayerGame } from "@/lib/game/multiplayer";
import { resolveStoredPhotoUrl } from "@/lib/user-photo";
import type { ArchivedTournament } from "@/lib/tournament/archive";
import {
  computeStatsFromLocalRecords,
  isFinishedMultiplayerLocal,
  localThrowsByGameForUser,
  mergeArchiveGames,
  mergePlayerStats,
} from "@/lib/stats/local-from-record";
import type { PlayerStatsResult } from "@/lib/stats/player-stats";
import { readCachedMembers } from "./members-store";
import { isProbablyOfflineError } from "./session-cache";
import {
  archiveGamesCacheKey,
  leaderboardCacheKey,
  playerStatsCacheKey,
  readStatsCache,
  tournamentsCacheKey,
  writeStatsCache,
} from "./stats-cache";

export type LeaderboardEntry = {
  userId: number;
  name: string;
  photoUrl: string | null;
  gamesPlayed: number;
  wins: number;
  avgPpr: number;
  legsWon: number;
  avgWinRound: number | null;
};

export type PlayerStatsPayload = {
  stats: PlayerStatsResult;
  profile: { name: string; photoUrl: string | null };
  allThrows: ThrowInput[];
  throwsByGame: Record<string, ThrowInput[]>;
};

function unsyncedFinished(records: LocalGameRecord[]): LocalGameRecord[] {
  return records.filter(
    (r) => isFinishedMultiplayerLocal(r) && r.syncStatus !== "synced"
  );
}

function profileFromMembers(
  members: ChannelMember[],
  userId: number
): { name: string; photoUrl: string | null } {
  const member = members.find((m) => m.user_id === userId);
  const user = member ? resolveUser(member) : null;
  return {
    name: displayName(user, userId),
    photoUrl: resolveStoredPhotoUrl(userId, user?.photo_url ?? null),
  };
}

function mergeThrows(
  base: Record<string, ThrowInput[]>,
  local: Record<string, ThrowInput[]>
): Record<string, ThrowInput[]> {
  return { ...base, ...local };
}

function leaderboardFromLocal(
  members: ChannelMember[],
  records: LocalGameRecord[]
): LeaderboardEntry[] {
  return members
    .map((m) => {
      const user = resolveUser(m);
      const stats = computeStatsFromLocalRecords(m.user_id, records);
      return {
        userId: m.user_id,
        name: displayName(user, m.user_id),
        photoUrl: resolveStoredPhotoUrl(m.user_id, user?.photo_url ?? null),
        ...stats,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.avgPpr - a.avgPpr);
}

function mergeLeaderboardWithLocal(
  base: LeaderboardEntry[],
  members: ChannelMember[],
  unsynced: LocalGameRecord[]
): LeaderboardEntry[] {
  if (unsynced.length === 0) return base;
  const byId = new Map(base.map((e) => [e.userId, { ...e }]));

  for (const member of members) {
    if (!byId.has(member.user_id)) {
      const user = resolveUser(member);
      byId.set(member.user_id, {
        userId: member.user_id,
        name: displayName(user, member.user_id),
        photoUrl: resolveStoredPhotoUrl(
          member.user_id,
          user?.photo_url ?? null
        ),
        gamesPlayed: 0,
        wins: 0,
        avgPpr: 0,
        legsWon: 0,
        avgWinRound: null,
      });
    }
  }

  for (const [userId, entry] of byId) {
    const extra = computeStatsFromLocalRecords(userId, unsynced);
    if (extra.gamesPlayed === 0) continue;
    const merged = mergePlayerStats(entry, extra);
    byId.set(userId, { ...entry, ...merged });
  }

  return [...byId.values()].sort(
    (a, b) => b.wins - a.wins || b.avgPpr - a.avgPpr
  );
}

export async function loadPlayerStatsOfflineFirst(
  channelId: string,
  userId: number
): Promise<PlayerStatsPayload> {
  const localAll = await listLocalGames(channelId);
  const localFinished = localAll.filter(isFinishedMultiplayerLocal);
  const localThrows = localThrowsByGameForUser(localFinished, userId);
  const members = await readCachedMembers(channelId);
  const localProfile = profileFromMembers(members, userId);

  const buildLocalOnly = (): PlayerStatsPayload => {
    const stats = computeStatsFromLocalRecords(userId, localFinished);
    const allThrows = Object.values(localThrows).flat();
    return {
      stats,
      profile: localProfile,
      allThrows,
      throwsByGame: localThrows,
    };
  };

  const mergeCached = (cached: PlayerStatsPayload): PlayerStatsPayload => {
    const unsynced = unsyncedFinished(localAll);
    const extraStats = computeStatsFromLocalRecords(userId, unsynced);
    const throwsByGame = mergeThrows(cached.throwsByGame ?? {}, localThrows);
    return {
      stats:
        extraStats.gamesPlayed > 0
          ? mergePlayerStats(cached.stats, extraStats)
          : cached.stats,
      profile: cached.profile?.name ? cached.profile : localProfile,
      allThrows: Object.values(throwsByGame).flat(),
      throwsByGame,
    };
  };

  if (isOnline()) {
    try {
      const data = await apiFetch<{
        stats: PlayerStatsResult;
        profile?: { name: string; photoUrl: string | null };
        allThrows?: ThrowInput[];
        throwsByGame?: Record<string, ThrowInput[]>;
      }>(`/api/stats/player?channelId=${channelId}&userId=${userId}`);
      const payload: PlayerStatsPayload = {
        stats: data.stats,
        profile: data.profile ?? localProfile,
        allThrows: data.allThrows ?? [],
        throwsByGame: data.throwsByGame ?? {},
      };
      await writeStatsCache(playerStatsCacheKey(channelId, userId), payload);
      return mergeCached(payload);
    } catch (err) {
      if (!isProbablyOfflineError(err)) throw err;
    }
  }

  const cached = await readStatsCache<PlayerStatsPayload>(
    playerStatsCacheKey(channelId, userId)
  );
  if (cached) return mergeCached(cached);
  return buildLocalOnly();
}

export async function loadLeaderboardOfflineFirst(
  channelId: string
): Promise<LeaderboardEntry[]> {
  const localAll = await listLocalGames(channelId);
  const members = await readCachedMembers(channelId);
  const unsynced = unsyncedFinished(localAll);

  if (isOnline()) {
    try {
      const data = await apiFetch<{ leaderboard: LeaderboardEntry[] }>(
        `/api/stats/leaderboard?channelId=${channelId}`
      );
      const list = data.leaderboard ?? [];
      await writeStatsCache(leaderboardCacheKey(channelId), list);
      return mergeLeaderboardWithLocal(list, members, unsynced);
    } catch (err) {
      if (!isProbablyOfflineError(err)) throw err;
    }
  }

  const cached = await readStatsCache<LeaderboardEntry[]>(
    leaderboardCacheKey(channelId)
  );
  if (cached) return mergeLeaderboardWithLocal(cached, members, unsynced);

  const finished = localAll.filter(isFinishedMultiplayerLocal);
  if (members.length > 0) return leaderboardFromLocal(members, finished);
  return leaderboardFromLocal(
    // Derive pseudo-members from local games when roster cache is empty.
    uniquePlayersAsMembers(finished),
    finished
  );
}

function uniquePlayersAsMembers(records: LocalGameRecord[]): ChannelMember[] {
  const map = new Map<number, ChannelMember>();
  for (const record of records) {
    for (const p of record.meta.players) {
      if (map.has(p.userId)) continue;
      map.set(p.userId, {
        user_id: p.userId,
        users: {
          first_name: p.firstName,
          username: p.username,
          photo_url: p.photoUrl ?? null,
        },
      });
    }
  }
  return [...map.values()];
}

export async function loadArchiveGamesOfflineFirst(
  channelId: string
): Promise<{
  games: ArchiveGameRow[];
  tournaments: ArchivedTournament[];
}> {
  const localAll = await listLocalGames(channelId);

  if (isOnline()) {
    try {
      const [gamesRes, tournamentsRes] = await Promise.all([
        apiFetch<{ games: ArchiveGameRow[] }>(
          `/api/channels/${encodeURIComponent(channelId)}/games`
        ),
        apiFetch<{ tournaments: ArchivedTournament[] }>(
          `/api/channels/${encodeURIComponent(channelId)}/tournaments`
        ),
      ]);
      const remoteGames = (gamesRes.games ?? []).filter((g) =>
        isMultiplayerGame(g.game_players)
      );
      const tournaments = tournamentsRes.tournaments ?? [];
      await writeStatsCache(archiveGamesCacheKey(channelId), remoteGames);
      await writeStatsCache(tournamentsCacheKey(channelId), tournaments);
      return {
        games: mergeArchiveGames(remoteGames, localAll),
        tournaments,
      };
    } catch (err) {
      if (!isProbablyOfflineError(err)) throw err;
    }
  }

  const cachedGames =
    (await readStatsCache<ArchiveGameRow[]>(
      archiveGamesCacheKey(channelId)
    )) ?? [];
  const cachedTournaments =
    (await readStatsCache<ArchivedTournament[]>(
      tournamentsCacheKey(channelId)
    )) ?? [];

  return {
    games: mergeArchiveGames(cachedGames, localAll),
    tournaments: cachedTournaments,
  };
}

export async function loadPlayerHistoryOfflineFirst(
  channelId: string,
  userId: number
): Promise<{
  stats: PlayerStatsResult;
  profile: { name: string; photoUrl: string | null };
  games: ArchiveGameRow[];
  throwsByGame: Record<string, ThrowInput[]>;
}> {
  const [player, archive] = await Promise.all([
    loadPlayerStatsOfflineFirst(channelId, userId),
    loadArchiveGamesOfflineFirst(channelId),
  ]);

  const games = archive.games.filter(
    (g) =>
      isMultiplayerGame(g.game_players) &&
      g.game_players.some((p) => p.user_id === userId)
  );

  return {
    stats: player.stats,
    profile: player.profile,
    games,
    throwsByGame: player.throwsByGame,
  };
}
