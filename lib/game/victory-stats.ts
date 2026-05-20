import type { ThrowInput } from "@/lib/darts/rules";
import type { GameSnapshot } from "@/lib/game/optimistic";
import type { LocalGameRecord } from "@/lib/game/local/types";
import { throwsForPlayer } from "@/lib/game/victory-throws";
import { resolveStoredPhotoUrl } from "@/lib/telegram/user-photo";

export type VictoryPlayerStat = {
  userId: number;
  name: string;
  photoUrl: string | null;
  isWinner: boolean;
  remainingScore: number;
  ppr: number;
  legsWon: number;
  dartsThrown: number;
  throws: ThrowInput[];
};

export function getVictoryWinnerIndex(snapshot: GameSnapshot): number {
  if (snapshot.game.status !== "finished") {
    return snapshot.game.current_player_index;
  }
  const byLegs = [...snapshot.players].sort(
    (a, b) => b.legs_won - a.legs_won || a.order_index - b.order_index
  );
  return byLegs[0]?.order_index ?? snapshot.game.current_player_index;
}

export function buildVictoryStats(
  snapshot: GameSnapshot,
  record?: LocalGameRecord | null
): VictoryPlayerStat[] {
  const winnerIndex = getVictoryWinnerIndex(snapshot);
  const photoByUser = new Map(
    (record?.meta.players ?? []).map((m) => [m.userId, m.photoUrl ?? null])
  );

  return [...snapshot.players]
    .sort((a, b) => a.order_index - b.order_index)
    .map((p) => {
      const raw = p.users?.username ?? p.users?.first_name ?? "Игрок";
      return {
        userId: p.user_id,
        name: raw.toUpperCase().slice(0, 20),
        photoUrl: resolveStoredPhotoUrl(
          p.user_id,
          photoByUser.get(p.user_id)
        ),
        isWinner: p.order_index === winnerIndex,
        remainingScore: p.remaining_score,
        ppr: p.ppr ?? 0,
        legsWon: p.legs_won,
        dartsThrown: p.darts_thrown,
        throws: record ? throwsForPlayer(record, p.user_id) : [],
      };
    });
}
