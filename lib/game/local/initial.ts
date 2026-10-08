import { defaultSettings, type GameSettings } from "@/lib/darts/rules";
import type { GameSnapshot } from "@/lib/game/optimistic";
import type { GameTournamentContext } from "@/lib/tournament/game-context";
import { resolveStoredPhotoUrl } from "@/lib/user-photo";
import type { LocalGameMeta, LocalPlayerMeta } from "./types";

export function buildPlayerMetas(
  playerIds: number[],
  members: Array<{
    user_id: number;
    users?:
      | { first_name: string; username: string | null; photo_url?: string | null }
      | { first_name: string; username: string | null; photo_url?: string | null }[]
      | null;
  }>
): LocalPlayerMeta[] {
  return playerIds.map((userId) => {
    const member = members.find((m) => m.user_id === userId);
    const raw = member?.users;
    const user = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
    return {
      userId,
      firstName: user?.first_name ?? String(userId),
      username: user?.username ?? null,
      photoUrl: resolveStoredPhotoUrl(userId, user?.photo_url),
    };
  });
}

export function buildInitialSnapshot(
  gameId: string,
  meta: LocalGameMeta,
  tournamentContext: GameTournamentContext | null
): GameSnapshot {
  const settings: GameSettings = {
    ...defaultSettings(meta.mode),
    ...meta.settings,
  };

  const players = meta.players.map((p, order_index) => ({
    id: `${gameId}-p${order_index}`,
    user_id: p.userId,
    order_index,
    remaining_score: settings.startingScore,
    visit_score: 0,
    darts_thrown: 0,
    score_at_visit_start: settings.startingScore,
    awaiting_visit_end: false,
    legs_won: 0,
    users: {
      first_name: p.firstName,
      username: p.username,
    },
  }));

  return {
    game: {
      id: gameId,
      channel_id: meta.channelId,
      mode: meta.mode,
      status: "active",
      current_player_index: 0,
      current_round: 1,
      current_leg: 1,
      settings: {
        startingScore: settings.startingScore,
        maxRounds: settings.maxRounds,
        legsToWin: settings.legsToWin,
        doubleOut: settings.doubleOut,
      },
    },
    players,
    activeVisitThrows: [],
    tournamentContext,
  };
}
