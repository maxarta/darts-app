import type { ArchiveGameRow } from "@/components/stats/gameArchiveModel";
import type { ThrowInput } from "@/lib/darts/rules";
import { isMultiplayerGame } from "@/lib/game/multiplayer";
import type { LocalGameRecord } from "@/lib/game/local/types";
import { throwsForPlayer } from "@/lib/game/victory-throws";
import type {
  FinishedGameForStats,
  PlayerStatsResult,
} from "@/lib/stats/player-stats";
import { computePlayerStats } from "@/lib/stats/player-stats";

export function isFinishedMultiplayerLocal(
  record: LocalGameRecord
): boolean {
  return (
    record.snapshot.game.status === "finished" &&
    isMultiplayerGame(record.snapshot.players)
  );
}

export function localRecordToFinishedGame(
  record: LocalGameRecord
): FinishedGameForStats | null {
  if (!isFinishedMultiplayerLocal(record)) return null;
  const mode = record.meta.mode === "301" ? "301" : "501";
  return {
    id: record.serverId ?? record.id,
    mode,
    settings: record.meta.settings,
    current_round: record.snapshot.game.current_round,
    game_players: record.snapshot.players.map((p) => ({
      user_id: p.user_id,
      legs_won: p.legs_won,
      remaining_score: p.remaining_score,
      darts_thrown: p.darts_thrown,
    })),
  };
}

export function localRecordToArchiveRow(record: LocalGameRecord): ArchiveGameRow {
  const mode = record.meta.mode === "301" ? "301" : "501";
  const byId = new Map(record.meta.players.map((p) => [p.userId, p]));
  return {
    id: record.id,
    mode,
    status: record.snapshot.game.status,
    settings: record.meta.settings,
    created_at: new Date(record.createdAt).toISOString(),
    current_round: record.snapshot.game.current_round,
    game_players: record.snapshot.players.map((p) => {
      const meta = byId.get(p.user_id);
      return {
        user_id: p.user_id,
        legs_won: p.legs_won,
        users: {
          first_name: meta?.firstName ?? String(p.user_id),
          photo_url: meta?.photoUrl ?? null,
        },
      };
    }),
  };
}

export function localThrowsByGameForUser(
  records: LocalGameRecord[],
  userId: number
): Record<string, ThrowInput[]> {
  const out: Record<string, ThrowInput[]> = {};
  for (const record of records) {
    if (!isFinishedMultiplayerLocal(record)) continue;
    if (!record.meta.playerIds.includes(userId)) continue;
    out[record.id] = throwsForPlayer(record, userId);
    if (record.serverId) {
      out[record.serverId] = out[record.id];
    }
  }
  return out;
}

export function computeStatsFromLocalRecords(
  userId: number,
  records: LocalGameRecord[]
): PlayerStatsResult {
  const games = records
    .map(localRecordToFinishedGame)
    .filter((g): g is FinishedGameForStats => g != null);
  return computePlayerStats(userId, games);
}

export function mergePlayerStats(
  base: PlayerStatsResult,
  extra: PlayerStatsResult
): PlayerStatsResult {
  const gamesPlayed = base.gamesPlayed + extra.gamesPlayed;
  const legsWon = base.legsWon + extra.legsWon;
  const wins = base.wins + extra.wins;

  let avgPpr = 0;
  if (gamesPlayed > 0) {
    avgPpr =
      Math.round(
        ((base.avgPpr * base.gamesPlayed + extra.avgPpr * extra.gamesPlayed) /
          gamesPlayed) *
          10
      ) / 10;
  }

  let avgWinRound: number | null = null;
  if (wins > 0) {
    const sum =
      (base.avgWinRound ?? 0) * base.wins +
      (extra.avgWinRound ?? 0) * extra.wins;
    avgWinRound = Math.round((sum / wins) * 10) / 10;
  }

  return { gamesPlayed, legsWon, avgPpr, wins, avgWinRound };
}

export function mergeArchiveGames(
  remote: ArchiveGameRow[],
  localRecords: LocalGameRecord[]
): ArchiveGameRow[] {
  const finishedLocal = localRecords.filter(isFinishedMultiplayerLocal);
  const localByServerId = new Map(
    finishedLocal
      .filter((r) => r.serverId)
      .map((r) => [r.serverId as string, r])
  );
  const usedLocalIds = new Set<string>();
  const merged: ArchiveGameRow[] = [];

  for (const game of remote) {
    const local = localByServerId.get(game.id);
    if (local) {
      // Keep server created_at for stable archive ordering.
      merged.push({
        ...localRecordToArchiveRow(local),
        created_at: game.created_at,
      });
      usedLocalIds.add(local.id);
    } else {
      merged.push(game);
    }
  }

  for (const local of finishedLocal) {
    if (usedLocalIds.has(local.id)) continue;
    if (local.serverId && localByServerId.has(local.serverId)) {
      // Already represented via remote match above, or skipped if remote missing.
      if (remote.some((g) => g.id === local.serverId)) continue;
    }
    merged.push(localRecordToArchiveRow(local));
  }

  return merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
