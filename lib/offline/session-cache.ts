"use client";

import { GUEST_CLUB_CHAT_ID, WEB_CLUB_CHAT_ID } from "@/lib/api/auth";
import { getGuestChannelId, isGuestMode } from "@/lib/app-mode";

const SESSION_KEY = "darts.session.v1";
const OFFLINE_CHANNEL_KEY = "darts.offline-channel-id.v1";

export type CachedSession = {
  user: {
    id: number;
    first_name: string;
    username?: string;
    photo_url?: string;
  };
  channel: {
    id: string;
    telegram_chat_id: number;
    title: string;
  } | null;
  isChannelAdmin?: boolean;
};

export function readCachedSession(): CachedSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedSession;
  } catch {
    return null;
  }
}

export function writeCachedSession(session: CachedSession): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (session.channel?.id && !isGuestMode()) {
      localStorage.setItem(OFFLINE_CHANNEL_KEY, session.channel.id);
    }
  } catch {
    /* quota / private mode */
  }
}

function offlineChannelId(): string {
  if (typeof localStorage === "undefined") return crypto.randomUUID();
  const existing = localStorage.getItem(OFFLINE_CHANNEL_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(OFFLINE_CHANNEL_KEY, id);
  return id;
}

/** Temporary local-only club — never synced to the server. */
export function buildGuestSession(): CachedSession {
  return {
    user: {
      id: 1,
      first_name: "Игрок",
    },
    channel: {
      id: getGuestChannelId(),
      telegram_chat_id: GUEST_CLUB_CHAT_ID,
      title: "Временная игра",
    },
    isChannelAdmin: true,
  };
}

/** Local club session when there is no network and no prior server session. */
export function buildOfflineWebSession(): CachedSession {
  if (isGuestMode()) return buildGuestSession();

  const cached = readCachedSession();
  if (
    cached?.channel?.id &&
    cached.channel.telegram_chat_id !== GUEST_CLUB_CHAT_ID
  ) {
    return cached;
  }

  return {
    user: {
      id: 1,
      first_name: "Игрок",
    },
    channel: {
      id: offlineChannelId(),
      telegram_chat_id: WEB_CLUB_CHAT_ID,
      title: "Клуб",
    },
    isChannelAdmin: true,
  };
}

export function isProbablyOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Load failed") ||
    msg.includes("network") ||
    msg.includes("offline")
  );
}
