import {
  optimisticEndVisit,
  optimisticThrow,
  type GameSnapshot,
} from "@/lib/game/optimistic";
import type { ThrowInput } from "@/lib/darts/rules";
import { buildInitialSnapshot } from "./initial";
import { replayEvents } from "./replay";
import type {
  GameEvent,
  LocalGameMeta,
  LocalGameRecord,
  LocalGameSyncStatus,
} from "./types";
import type { GameTournamentContext } from "@/lib/tournament/game-context";

function touch(record: LocalGameRecord): LocalGameRecord {
  return { ...record, updatedAt: Date.now() };
}

function withSnapshot(
  record: LocalGameRecord,
  events: GameEvent[],
  snapshot: GameSnapshot,
  syncStatus?: LocalGameSyncStatus
): LocalGameRecord {
  return touch({
    ...record,
    events,
    snapshot,
    syncStatus: syncStatus ?? record.syncStatus,
    syncError: syncStatus === "failed" ? record.syncError : null,
  });
}

export function createLocalGameRecord(params: {
  id: string;
  meta: LocalGameMeta;
  tournamentContext?: GameTournamentContext | null;
}): LocalGameRecord {
  const snapshot = buildInitialSnapshot(
    params.id,
    params.meta,
    params.tournamentContext ?? null
  );
  const now = Date.now();
  return {
    id: params.id,
    serverId: null,
    meta: params.meta,
    events: [],
    snapshot,
    tournamentContext: params.tournamentContext ?? null,
    syncStatus: "local",
    syncError: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function localGameThrow(
  record: LocalGameRecord,
  input: ThrowInput
): LocalGameRecord | null {
  if (record.snapshot.game.status !== "active") return null;
  const active = record.snapshot.players.find(
    (p) => p.order_index === record.snapshot.game.current_player_index
  );
  if (
    record.snapshot.activeVisitThrows.length >= 3 ||
    active?.awaiting_visit_end
  ) {
    return null;
  }

  const next = optimisticThrow(record.snapshot, input);
  if (!next) return null;

  const events: GameEvent[] = [...record.events, { type: "throw", input }];

  return withSnapshot(record, events, next);
}

export function localGameEndVisit(record: LocalGameRecord): LocalGameRecord | null {
  if (record.snapshot.game.status !== "active") return null;
  const next = optimisticEndVisit(record.snapshot);
  if (!next) return null;

  const syncStatus =
    next.game.status === "finished" ? record.syncStatus : record.syncStatus;

  return withSnapshot(
    record,
    [...record.events, { type: "endVisit" }],
    next,
    syncStatus
  );
}

export function localGameUndo(record: LocalGameRecord): LocalGameRecord | null {
  if (record.events.length === 0) return null;
  const events = record.events.slice(0, -1);
  const initial = buildInitialSnapshot(
    record.id,
    record.meta,
    record.tournamentContext
  );
  const snapshot = replayEvents(initial, events);
  return withSnapshot(record, events, snapshot);
}

export function localGameRestart(record: LocalGameRecord): LocalGameRecord {
  const snapshot = buildInitialSnapshot(
    record.id,
    record.meta,
    record.tournamentContext
  );
  return touch({
    ...record,
    events: [],
    snapshot,
    syncStatus: "local",
    syncError: null,
  });
}

export function localGameCancel(record: LocalGameRecord): LocalGameRecord {
  return withSnapshot(
    record,
    record.events,
    {
      ...record.snapshot,
      game: { ...record.snapshot.game, status: "cancelled" },
      activeVisitThrows: [],
    },
    "local"
  );
}

export function markLocalGameSyncing(record: LocalGameRecord): LocalGameRecord {
  return touch({ ...record, syncStatus: "syncing", syncError: null });
}

export function markLocalGameSynced(
  record: LocalGameRecord,
  serverId: string
): LocalGameRecord {
  return touch({
    ...record,
    serverId,
    syncStatus: "synced",
    syncError: null,
  });
}

export function markLocalGameSyncFailed(
  record: LocalGameRecord,
  message: string
): LocalGameRecord {
  return touch({
    ...record,
    syncStatus: "failed",
    syncError: message,
  });
}

export function needsSync(record: LocalGameRecord): boolean {
  if (record.syncStatus === "synced" || record.syncStatus === "syncing") {
    return false;
  }
  const status = record.snapshot.game.status;
  return status === "finished" || status === "cancelled";
}
