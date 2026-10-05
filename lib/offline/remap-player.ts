"use client";

import type { LocalGameRecord } from "@/lib/game/local/types";
import {
  idbRequest,
  idbTxDone,
  openOfflineDb,
  STORE_GAMES,
  STORE_MEMBERS,
  STORE_PENDING_MEMBERS,
} from "./db";
import {
  remapMemberIdInList,
  type MembersCacheRow,
  type PendingMemberOp,
} from "./members-store";

function remapGame(
  record: LocalGameRecord,
  fromId: number,
  toId: number
): LocalGameRecord {
  if (fromId === toId) return record;
  const playerIds = record.meta.playerIds.map((id) =>
    id === fromId ? toId : id
  );
  const players = record.meta.players.map((p) =>
    p.userId === fromId ? { ...p, userId: toId } : p
  );
  const snapshotPlayers = record.snapshot.players.map((p) =>
    p.user_id === fromId ? { ...p, user_id: toId } : p
  );
  return {
    ...record,
    meta: {
      ...record.meta,
      playerIds,
      players,
      createdBy:
        record.meta.createdBy === fromId ? toId : record.meta.createdBy,
    },
    snapshot: {
      ...record.snapshot,
      players: snapshotPlayers,
    },
    updatedAt: Date.now(),
  };
}

function remapPendingOp(
  op: PendingMemberOp,
  fromId: number,
  toId: number
): PendingMemberOp {
  if (op.type === "create" && op.localUserId === fromId) {
    return { ...op, localUserId: toId };
  }
  if (
    (op.type === "update" || op.type === "delete") &&
    op.userId === fromId
  ) {
    return { ...op, userId: toId };
  }
  return op;
}

/** After an offline-created player is synced, rewrite local IDs → server IDs. */
export async function remapLocalPlayerId(
  channelId: string,
  fromId: number,
  toId: number
): Promise<void> {
  if (fromId === toId) return;
  const db = await openOfflineDb();
  try {
    const membersTx = db.transaction(STORE_MEMBERS, "readwrite");
    const membersStore = membersTx.objectStore(STORE_MEMBERS);
    const row = await idbRequest<MembersCacheRow | undefined>(
      membersStore.get(channelId)
    );
    if (row) {
      membersStore.put({
        ...row,
        members: remapMemberIdInList(row.members, fromId, toId),
        updatedAt: Date.now(),
      });
    }
    await idbTxDone(membersTx);

    const gamesTx = db.transaction(STORE_GAMES, "readwrite");
    const gamesStore = gamesTx.objectStore(STORE_GAMES);
    const games = await idbRequest<LocalGameRecord[]>(gamesStore.getAll());
    for (const game of games ?? []) {
      if (game.meta.channelId !== channelId) continue;
      if (
        !game.meta.playerIds.includes(fromId) &&
        game.meta.createdBy !== fromId
      ) {
        continue;
      }
      gamesStore.put(remapGame(game, fromId, toId));
    }
    await idbTxDone(gamesTx);

    const pendingTx = db.transaction(STORE_PENDING_MEMBERS, "readwrite");
    const pendingStore = pendingTx.objectStore(STORE_PENDING_MEMBERS);
    const ops = await idbRequest<PendingMemberOp[]>(pendingStore.getAll());
    for (const op of ops ?? []) {
      if (op.channelId !== channelId) continue;
      const next = remapPendingOp(op, fromId, toId);
      if (next !== op) pendingStore.put(next);
    }
    await idbTxDone(pendingTx);
  } finally {
    db.close();
  }
}
