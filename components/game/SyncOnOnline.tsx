"use client";

import { useEffect } from "react";
import { syncAllPendingGames } from "@/lib/game/sync/client";
import { syncPendingMembers } from "@/lib/offline/members-service";

async function syncAllOfflineData() {
  await syncPendingMembers();
  await syncAllPendingGames();
}

export function SyncOnOnline() {
  useEffect(() => {
    void syncAllOfflineData();
    const onOnline = () => {
      void syncAllOfflineData();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return null;
}
