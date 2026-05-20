"use client";

import type { LocalGameRecord } from "./types";

const DB_NAME = "darts-app";
const DB_VERSION = 1;
const STORE = "local-games";

function openDb(): Promise<IDBDatabase> {
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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

export async function saveLocalGame(record: LocalGameRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("save failed"));
    tx.objectStore(STORE).put(record);
  });
  db.close();
}

export async function getLocalGame(
  id: string
): Promise<LocalGameRecord | null> {
  const db = await openDb();
  const record = await new Promise<LocalGameRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as LocalGameRecord) ?? null);
    req.onerror = () => reject(req.error ?? new Error("get failed"));
  });
  db.close();
  return record;
}

export async function listPendingSyncGames(): Promise<LocalGameRecord[]> {
  const db = await openDb();
  const all = await new Promise<LocalGameRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as LocalGameRecord[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("list failed"));
  });
  db.close();
  return all.filter(
    (r) =>
      r.syncStatus !== "synced" &&
      r.syncStatus !== "syncing" &&
      (r.snapshot.game.status === "finished" ||
        r.snapshot.game.status === "cancelled")
  );
}

export async function deleteLocalGame(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("delete failed"));
    tx.objectStore(STORE).delete(id);
  });
  db.close();
}
