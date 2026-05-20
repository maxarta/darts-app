import { throwPoints, type ThrowInput } from "@/lib/darts/rules";
import { getActiveVisitIndex } from "@/lib/darts/visit-index";
import {
  optimisticEndVisit,
  optimisticThrow,
  type GameSnapshot,
} from "@/lib/game/optimistic";
import { buildInitialSnapshot } from "./initial";
import type { GameEvent, LocalGameRecord } from "./types";

const MISS_THROW: ThrowInput = { segment: "miss", multiplier: 1 };

function segmentToDb(segment: ThrowInput["segment"]): string {
  if (typeof segment === "number") return String(segment);
  return segment;
}

export type SyncThrowRow = {
  orderIndex: number;
  visitIndex: number;
  dartIndex: number;
  segment: string;
  multiplier: number;
  points: number;
};

/** Собирает все броски из журнала событий для загрузки на сервер */
export function buildSyncThrows(record: LocalGameRecord): SyncThrowRow[] {
  const initial = buildInitialSnapshot(
    record.id,
    record.meta,
    record.tournamentContext
  );
  const rows: SyncThrowRow[] = [];
  let snapshot = initial;

  for (const event of record.events) {
    if (event.type === "throw") {
      const active = snapshot.players.find(
        (p) => p.order_index === snapshot.game.current_player_index
      );
      if (!active) break;

      const visitIndex = getActiveVisitIndex(
        active.darts_thrown,
        active.visit_score,
        active.awaiting_visit_end
      );
      const dartIndex = snapshot.activeVisitThrows.length + 1;

      rows.push({
        orderIndex: active.order_index,
        visitIndex,
        dartIndex,
        segment: segmentToDb(event.input.segment),
        multiplier: event.input.multiplier,
        points: throwPoints(event.input),
      });

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

      const visitIndex = getActiveVisitIndex(
        active.darts_thrown,
        active.visit_score,
        active.awaiting_visit_end
      );
      let dartIndex = before.activeVisitThrows.length;

      for (const t of padded.slice(before.activeVisitThrows.length)) {
        dartIndex += 1;
        rows.push({
          orderIndex: active.order_index,
          visitIndex,
          dartIndex,
          segment: segmentToDb(t.segment),
          multiplier: t.multiplier,
          points: throwPoints(t),
        });
      }

      const next = optimisticEndVisit(before);
      if (!next) break;
      snapshot = next;
    }
  }

  return rows;
}

export function buildSyncPayload(record: LocalGameRecord) {
  const { snapshot, meta } = record;
  return {
    localId: record.id,
    channelId: meta.channelId,
    mode: meta.mode,
    settings: meta.settings,
    playerIds: meta.playerIds,
    createdBy: meta.createdBy,
    tournamentMatchId: meta.tournamentMatchId,
    tournamentMatchType: meta.tournamentMatchType,
    status: snapshot.game.status,
    currentPlayerIndex: snapshot.game.current_player_index,
    currentLeg: snapshot.game.current_leg,
    currentRound: snapshot.game.current_round,
    players: snapshot.players.map((p) => ({
      orderIndex: p.order_index,
      userId: p.user_id,
      remainingScore: p.remaining_score,
      legsWon: p.legs_won,
      visitScore: p.visit_score,
      dartsThrown: p.darts_thrown,
      scoreAtVisitStart: p.score_at_visit_start,
      awaitingVisitEnd: p.awaiting_visit_end,
    })),
    throws: buildSyncThrows(record),
  };
}
