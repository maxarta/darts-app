"use client";

import {
  idbRequest,
  idbTxDone,
  openOfflineDb,
  STORE_GAMES,
} from "@/lib/offline/db";
import type { LocalGameRecord } from "./types";

export async function saveLocalGame(record: LocalGameRecord): Promise<void> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(STORE_GAMES, "readwrite");
    tx.objectStore(STORE_GAMES).put(record);
    await idbTxDone(tx);
  } finally {
    db.close();
  }
}

export async function getLocalGame(
  id: string
): Promise<LocalGameRecord | null> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(STORE_GAMES, "readonly");
    const record = await idbRequest<LocalGameRecord | undefined>(
      tx.objectStore(STORE_GAMES).get(id)
    );
    return record ?? null;
  } finally {
    db.close();
  }
}

export async function listLocalGames(
  channelId?: string
): Promise<LocalGameRecord[]> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(STORE_GAMES, "readonly");
    const all = await idbRequest<LocalGameRecord[]>(
      tx.objectStore(STORE_GAMES).getAll()
    );
    if (!channelId) return all ?? [];
    return (all ?? []).filter((r) => r.meta.channelId === channelId);
  } finally {
    db.close();
  }
}

export async function listPendingSyncGames(): Promise<LocalGameRecord[]> {
  const all = await listLocalGames();
  return all.filter(
    (r) =>
      r.syncStatus !== "synced" &&
      r.syncStatus !== "syncing" &&
      (r.snapshot.game.status === "finished" ||
        r.snapshot.game.status === "cancelled")
  );
}

export async function deleteLocalGame(id: string): Promise<void> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(STORE_GAMES, "readwrite");
    tx.objectStore(STORE_GAMES).delete(id);
    await idbTxDone(tx);
  } finally {
    db.close();
  }
}
