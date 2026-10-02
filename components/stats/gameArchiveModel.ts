import {
  getFinishedGameWinnerIds,
  sortPlayersWinnerFirst,
} from "@/lib/stats/game-winners";
import { isFinishedGameStatus } from "@/lib/game/status";
import { getGameWinnerIds } from "@/lib/stats/player-stats";
import { resolveStoredPhotoUrl } from "@/lib/telegram/user-photo";
import type { StatsGamePlayer } from "@/components/stats/StatsGameLink";

type GameUserRow = {
  first_name: string;
  photo_url: string | null;
};

export type ArchiveGameRow = {
  id: string;
  mode: string;
  status: string;
  settings?: unknown;
  created_at: string;
  current_round?: number;
  game_players: Array<{
    user_id: number;
    legs_won: number;
    users: GameUserRow | GameUserRow[] | null;
  }>;
};

function resolveGameUser(
  users: GameUserRow | GameUserRow[] | null | undefined
): GameUserRow | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0] ?? null) : users;
}

export function gameArchiveHref(id: string, channelId: string) {
  const q = channelId ? `?channelId=${encodeURIComponent(channelId)}` : "";
  return `/game/${id}${q}`;
}

export function formatGameDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru");
}

export function buildArchivePlayers(g: ArchiveGameRow): StatsGamePlayer[] {
  const finished = isFinishedGameStatus(g.status);
  const mode = g.mode === "301" ? "301" : "501";
  const winnerIds = finished
    ? getGameWinnerIds({
        id: g.id,
        mode,
        settings: g.settings ?? {},
        current_round: g.current_round ?? 1,
        game_players: (g.game_players ?? []).map((p) => ({
          user_id: p.user_id,
          legs_won: p.legs_won,
          remaining_score: 0,
          darts_thrown: 0,
        })),
      })
    : getFinishedGameWinnerIds(g.game_players ?? [], finished);
  const ordered = sortPlayersWinnerFirst(g.game_players ?? [], finished);

  return ordered.map((p) => {
    const user = resolveGameUser(p.users);
    const isWinner = winnerIds.has(p.user_id);
    return {
      name: user?.first_name ?? String(p.user_id),
      legsWon: p.legs_won,
      isWinner,
      photoUrl: resolveStoredPhotoUrl(p.user_id, user?.photo_url),
    };
  });
}
