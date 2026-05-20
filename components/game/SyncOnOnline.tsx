"use client";

import { useEffect } from "react";
import {
  registerBackgroundSync,
  syncAllPendingGames,
} from "@/lib/game/sync/client";

export function SyncOnOnline() {
  useEffect(() => {
    void syncAllPendingGames();
    return registerBackgroundSync();
  }, []);

  return null;
}
