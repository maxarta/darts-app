import { throwPoints, type ThrowInput } from "@/lib/darts/rules";
import { getActiveVisitIndex } from "@/lib/darts/visit-index";
import {
  optimisticEndVisit,
  optimisticThrow,
  type GameSnapshot,
} from "@/lib/game/optimistic";
import { buildInitialSnapshot } from "@/lib/game/local/initial";
import type { LocalGameRecord } from "@/lib/game/local/types";

const MISS_THROW: ThrowInput = { segment: "miss", multiplier: 1 };

/** All darts per player from the local event log. */
export function buildThrowsByUserId(
  record: LocalGameRecord
): Map<number, ThrowInput[]> {
  const initial = buildInitialSnapshot(
    record.id,
    record.meta,
    record.tournamentContext
  );
  const byUser = new Map<number, ThrowInput[]>();
  for (const p of record.meta.players) {
    byUser.set(p.userId, []);
  }

  let snapshot: GameSnapshot = initial;

  for (const event of record.events) {
    if (event.type === "throw") {
      const active = snapshot.players.find(
        (p) => p.order_index === snapshot.game.current_player_index
      );
      if (!active) break;
      byUser.get(active.user_id)?.push(event.input);
      const next = optimisticThrow(snapshot, event.input);
      if (!next) break;
      snapshot = next;
    } else {
      const before = snapshot;
      const padded: ThrowInput[] = [...before.activeVisitThrows];
      while (padded.length < 3) {
        padded.push(MISS_THROW);
      }
      const active = before.players.find(
        (p) => p.order_index === before.game.current_player_index
      );
      if (!active) break;
      const list = byUser.get(active.user_id);
      for (const t of padded.slice(before.activeVisitThrows.length)) {
        list?.push(t);
      }
      const next = optimisticEndVisit(before);
      if (!next) break;
      snapshot = next;
    }
  }

  return byUser;
}

export function throwsForPlayer(
  record: LocalGameRecord,
  userId: number
): ThrowInput[] {
  return buildThrowsByUserId(record).get(userId) ?? [];
}
