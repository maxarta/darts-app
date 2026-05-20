"use client";

import { apiFetch } from "@/lib/api/client";
import {
  markLocalGameSynced,
  markLocalGameSyncFailed,
  markLocalGameSyncing,
  needsSync,
} from "@/lib/game/local/actions";
import { buildSyncPayload } from "@/lib/game/local/export-sync";
import { getLocalGame, listPendingSyncGames, saveLocalGame } from "@/lib/game/local/store";
import type { LocalGameRecord } from "@/lib/game/local/types";

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export async function syncLocalGame(
  gameId: string
): Promise<LocalGameRecord | null> {
  const record = await getLocalGame(gameId);
  if (!record || !needsSync(record)) return record;

  if (!isOnline()) {
    return record;
  }

  const syncing = markLocalGameSyncing(record);
  await saveLocalGame(syncing);

  try {
    const payload = buildSyncPayload(syncing);
    const res = await apiFetch<{ gameId: string }>("/api/games/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const synced = markLocalGameSynced(syncing, res.gameId);
    await saveLocalGame(synced);
    return synced;
  } catch (e) {
    const failed = markLocalGameSyncFailed(
      syncing,
      e instanceof Error ? e.message : "Ошибка синхронизации"
    );
    await saveLocalGame(failed);
    return failed;
  }
}

export async function syncAllPendingGames(): Promise<void> {
  if (!isOnline()) return;
  const pending = await listPendingSyncGames();
  for (const record of pending) {
    await syncLocalGame(record.id);
  }
}

export function registerBackgroundSync(): () => void {
  const onOnline = () => {
    void syncAllPendingGames();
  };
  window.addEventListener("online", onOnline);
  return () => window.removeEventListener("online", onOnline);
}
