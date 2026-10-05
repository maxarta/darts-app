"use client";

import { listLocalGames } from "@/lib/game/local/store";
import type { LocalGameRecord } from "@/lib/game/local/types";
import { getGameWinnerIds } from "@/lib/stats/player-stats";

export type LocalMatchOccupancy = {
  matchId: string;
  localGameId: string;
  status: "active" | "finished" | "cancelled";
  syncStatus: LocalGameRecord["syncStatus"];
  serverId: string | null;
  localWinnerId: number | null;
};

function localWinnerId(record: LocalGameRecord): number | null {
  if (record.snapshot.game.status !== "finished") return null;
  const mode = record.meta.mode === "301" ? "301" : "501";
  const winners = getGameWinnerIds({
    id: record.id,
    mode,
    settings: record.meta.settings,
    current_round: record.snapshot.game.current_round,
    game_players: record.snapshot.players.map((p) => ({
      user_id: p.user_id,
      legs_won: p.legs_won,
      remaining_score: p.remaining_score,
      darts_thrown: p.darts_thrown,
    })),
  });
  return winners.size === 1 ? [...winners][0]! : null;
}

/** Prefer the newest non-cancelled game for a match; finished beats active. */
export function pickOccupancyForMatch(
  records: LocalGameRecord[],
  matchId: string
): LocalMatchOccupancy | null {
  const related = records
    .filter((r) => r.meta.tournamentMatchId === matchId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (related.length === 0) return null;

  const finished = related.find((r) => r.snapshot.game.status === "finished");
  const active = related.find((r) => r.snapshot.game.status === "active");
  const chosen = finished ?? active ?? related[0]!;
  const status = chosen.snapshot.game.status;
  if (status !== "active" && status !== "finished" && status !== "cancelled") {
    return null;
  }

  return {
    matchId,
    localGameId: chosen.id,
    status,
    syncStatus: chosen.syncStatus,
    serverId: chosen.serverId,
    localWinnerId: localWinnerId(chosen),
  };
}

export async function loadTournamentLocalOccupancy(
  tournamentId: string
): Promise<Map<string, LocalMatchOccupancy>> {
  const all = await listLocalGames();
  const forTournament = all.filter(
    (r) => r.tournamentContext?.tournamentId === tournamentId
  );
  const matchIds = new Set(
    forTournament
      .map((r) => r.meta.tournamentMatchId)
      .filter((id): id is string => Boolean(id))
  );
  const map = new Map<string, LocalMatchOccupancy>();
  for (const matchId of matchIds) {
    const occ = pickOccupancyForMatch(forTournament, matchId);
    if (occ && occ.status !== "cancelled") {
      map.set(matchId, occ);
    }
  }
  return map;
}

export function matchPlayControls(
  opts: {
    serverPlayed: boolean;
    serverGameId: string | null;
    serverWinnerId?: number | null;
    local?: LocalMatchOccupancy | null;
  }
): {
  canPlay: boolean;
  continueGameId: string | null;
  showLocalFinished: boolean;
  effectiveWinnerId: number | null;
} {
  const serverDone =
    opts.serverPlayed || opts.serverWinnerId != null;
  const local = opts.local ?? null;
  const localFinished = local?.status === "finished";
  const localActive = local?.status === "active";

  if (serverDone) {
    return {
      canPlay: false,
      continueGameId: null,
      showLocalFinished: false,
      effectiveWinnerId: opts.serverWinnerId ?? null,
    };
  }

  if (localFinished) {
    return {
      canPlay: false,
      continueGameId: null,
      showLocalFinished: true,
      effectiveWinnerId: local.localWinnerId,
    };
  }

  if (localActive) {
    return {
      canPlay: false,
      continueGameId: local.localGameId,
      showLocalFinished: false,
      effectiveWinnerId: null,
    };
  }

  if (opts.serverGameId) {
    return {
      canPlay: false,
      continueGameId: opts.serverGameId,
      showLocalFinished: false,
      effectiveWinnerId: null,
    };
  }

  return {
    canPlay: true,
    continueGameId: null,
    showLocalFinished: false,
    effectiveWinnerId: null,
  };
}
