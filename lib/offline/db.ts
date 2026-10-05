"use client";

const DB_NAME = "darts-app";
const DB_VERSION = 3;

export const STORE_GAMES = "local-games";
export const STORE_MEMBERS = "channel-members";
export const STORE_PENDING_MEMBERS = "pending-member-ops";
export const STORE_STATS_CACHE = "stats-cache";

export function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступен"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_GAMES)) {
        db.createObjectStore(STORE_GAMES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_MEMBERS)) {
        db.createObjectStore(STORE_MEMBERS, { keyPath: "channelId" });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_MEMBERS)) {
        db.createObjectStore(STORE_PENDING_MEMBERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_STATS_CACHE)) {
        db.createObjectStore(STORE_STATS_CACHE, { keyPath: "key" });
      }
    };
  });
}

export async function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function idbTxDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}
