import { defaultSettings, type GameSettings } from "@/lib/darts/rules";
import type { GameSnapshot } from "@/lib/game/optimistic";
import type { GameTournamentContext } from "@/lib/tournament/game-context";
import { resolveStoredPhotoUrl } from "@/lib/user-photo";
import type { LocalGameRecord, LocalPlayerMeta } from "./types";

type ServerUser = {
  first_name?: string;
  username?: string | null;
  photo_url?: string | null;
};

type ServerPlayer = {
  id: string;
  user_id: number;
  order_index: number;
  remaining_score: number;
  visit_score: number;
  darts_thrown: number;
  score_at_visit_start: number;
  awaiting_visit_end: boolean;
  legs_won: number;
  ppr?: number;
  users?: ServerUser | ServerUser[] | null;
};

type ServerGame = {
  id: string;
  channel_id: string;
  mode: "301" | "501";
  status: string;
  current_player_index: number;
  current_round: number;
  current_leg: number;
  settings: Partial<GameSettings> & {
    startingScore?: number;
    maxRounds?: number;
    legsToWin?: number;
    doubleOut?: boolean;
  };
};

export type ServerGamePayload = {
  game: ServerGame;
  players: ServerPlayer[];
  activeVisitThrows?: GameSnapshot["activeVisitThrows"];
  tournamentContext?: GameTournamentContext | null;
};

function resolveUser(users: ServerPlayer["users"]): ServerUser | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0] ?? null) : users;
}

/** Build a read-only local record from GET /api/games/:id (archive / remote). */
export function localRecordFromServer(
  payload: ServerGamePayload
): LocalGameRecord {
  const { game, players, activeVisitThrows = [], tournamentContext = null } =
    payload;
  const mode = game.mode === "301" ? "301" : "501";
  const settings: GameSettings = {
    ...defaultSettings(mode),
    ...game.settings,
    startingScore: (game.settings.startingScore as 301 | 501) ?? defaultSettings(mode).startingScore,
  };

  const sorted = [...players].sort((a, b) => a.order_index - b.order_index);
  const metaPlayers: LocalPlayerMeta[] = sorted.map((p) => {
    const user = resolveUser(p.users);
    return {
      userId: p.user_id,
      firstName: user?.first_name ?? String(p.user_id),
      username: user?.username ?? null,
      photoUrl: resolveStoredPhotoUrl(p.user_id, user?.photo_url),
    };
  });

  const snapshotPlayers = sorted.map((p) => {
    const user = resolveUser(p.users);
    const meta = metaPlayers.find((m) => m.userId === p.user_id);
    return {
      id: p.id,
      user_id: p.user_id,
      order_index: p.order_index,
      remaining_score: p.remaining_score,
      visit_score: p.visit_score,
      darts_thrown: p.darts_thrown,
      score_at_visit_start: p.score_at_visit_start,
      awaiting_visit_end: p.awaiting_visit_end,
      legs_won: p.legs_won,
      ppr: p.ppr,
      users: {
        first_name: meta?.firstName ?? user?.first_name ?? String(p.user_id),
        username: meta?.username ?? user?.username ?? null,
      },
    };
  });

  const now = Date.now();
  return {
    id: game.id,
    serverId: game.id,
    meta: {
      channelId: game.channel_id,
      mode,
      settings,
      playerIds: metaPlayers.map((p) => p.userId),
      players: metaPlayers,
      createdBy: metaPlayers[0]?.userId ?? 0,
      tournamentMatchId: null,
      tournamentMatchType: null,
    },
    events: [],
    snapshot: {
      game: {
        id: game.id,
        channel_id: game.channel_id,
        mode,
        status: game.status,
        current_player_index: game.current_player_index,
        current_round: game.current_round,
        current_leg: game.current_leg,
        settings: {
          startingScore: settings.startingScore,
          maxRounds: settings.maxRounds,
          legsToWin: settings.legsToWin,
          doubleOut: settings.doubleOut,
        },
      },
      players: snapshotPlayers,
      activeVisitThrows,
      tournamentContext,
    },
    tournamentContext,
    syncStatus: "synced",
    syncError: null,
    createdAt: now,
    updatedAt: now,
  };
}
