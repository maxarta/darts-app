"use client";

import { useEffect } from "react";
import { isGuestMode } from "@/lib/app-mode";
import { syncAllPendingGames } from "@/lib/game/sync/client";
import { syncPendingMembers } from "@/lib/offline/members-service";

async function syncAllOfflineData() {
  if (isGuestMode()) return;
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
