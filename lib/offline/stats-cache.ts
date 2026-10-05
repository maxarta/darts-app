"use client";

import {
  idbRequest,
  idbTxDone,
  openOfflineDb,
  STORE_STATS_CACHE,
} from "./db";

export type StatsCacheRow<T = unknown> = {
  key: string;
  data: T;
  updatedAt: number;
};

export function playerStatsCacheKey(channelId: string, userId: number) {
  return `player:${channelId}:${userId}`;
}

export function leaderboardCacheKey(channelId: string) {
  return `leaderboard:${channelId}`;
}

export function archiveGamesCacheKey(channelId: string) {
  return `games:${channelId}`;
}

export function tournamentsCacheKey(channelId: string) {
  return `tournaments:${channelId}`;
}

export async function readStatsCache<T>(key: string): Promise<T | null> {
  const db = await openOfflineDb();
  try {
    const row = await idbRequest<StatsCacheRow<T> | undefined>(
      db.transaction(STORE_STATS_CACHE, "readonly").objectStore(STORE_STATS_CACHE).get(key)
    );
    return row?.data ?? null;
  } finally {
    db.close();
  }
}

export async function writeStatsCache<T>(key: string, data: T): Promise<void> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(STORE_STATS_CACHE, "readwrite");
    tx.objectStore(STORE_STATS_CACHE).put({
      key,
      data,
      updatedAt: Date.now(),
    } satisfies StatsCacheRow<T>);
    await idbTxDone(tx);
  } finally {
    db.close();
  }
}
