"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api/client";
import {
  getAppMode,
  lockToGuest,
  tryUnlockExtended,
  type AppMode,
} from "@/lib/app-mode";
import {
  buildGuestSession,
  buildOfflineWebSession,
  isProbablyOfflineError,
  readCachedSession,
  writeCachedSession,
  type CachedSession,
} from "@/lib/offline/session-cache";

type Channel = {
  id: string;
  telegram_chat_id: number;
  title: string;
};

type Session = CachedSession;

type SessionContextValue = {
  ready: boolean;
  session: Session | null;
  error: string | null;
  channel: Channel | null;
  isChannelAdmin: boolean;
  offline: boolean;
  appMode: AppMode;
  refreshSession: () => Promise<void>;
  unlockExtended: (code: string) => Promise<boolean>;
  switchToGuest: () => void;
  patchSessionUser: (patch: Partial<CachedSession["user"]>) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function applyGuestSession(
  setSession: (s: Session) => void,
  setError: (e: string | null) => void,
  setOffline: (v: boolean) => void
) {
  const guest = buildGuestSession();
  writeCachedSession(guest);
  setSession(guest);
  setError(null);
  setOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appMode, setAppModeState] = useState<AppMode>(() =>
    typeof window === "undefined" ? "guest" : getAppMode()
  );
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  const refreshSession = useCallback(async () => {
    if (getAppMode() === "guest") {
      applyGuestSession(setSession, setError, setOffline);
      setAppModeState("guest");
      return;
    }

    try {
      const data = await apiFetch<Session>("/api/auth/session", {
        method: "POST",
        body: JSON.stringify({}),
      });
      writeCachedSession(data);
      setSession(data);
      setError(null);
      setOffline(false);
      setAppModeState("extended");
    } catch (e) {
      const cached = readCachedSession();
      if (cached || isProbablyOfflineError(e)) {
        const fallback = cached ?? buildOfflineWebSession();
        writeCachedSession(fallback);
        setSession(fallback);
        setOffline(true);
        setError(null);
        return;
      }
      throw e;
    }
  }, []);

  const unlockExtended = useCallback(
    async (code: string) => {
      if (!tryUnlockExtended(code)) return false;
      setAppModeState("extended");
      try {
        await refreshSession();
      } catch {
        /* session/network errors stay visible on home; mode is already extended */
      }
      return true;
    },
    [refreshSession]
  );

  const switchToGuest = useCallback(() => {
    lockToGuest();
    setAppModeState("guest");
    applyGuestSession(setSession, setError, setOffline);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      if (getAppMode() === "extended") {
        void refreshSession().catch(() => setOffline(!navigator.onLine));
      }
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshSession]);

  useEffect(() => {
    const mode = getAppMode();
    setAppModeState(mode);

    if (mode === "guest") {
      applyGuestSession(setSession, setError, setOffline);
      setReady(true);
      return;
    }

    const cached = readCachedSession();
    if (cached) setSession(cached);

    refreshSession()
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Auth failed";
        if (
          msg.includes("users") ||
          msg.includes("PGRST") ||
          msg.includes("Supabase") ||
          msg.includes("SUPABASE")
        ) {
          setError(
            "База на сервере не настроена: проверьте Supabase в Vercel и выполните SQL из supabase/migrations/001_initial.sql"
          );
        } else {
          setError(msg);
        }
      })
      .finally(() => setReady(true));
  }, [refreshSession]);

  const patchSessionUser = (patch: Partial<CachedSession["user"]>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: Session = {
        ...prev,
        user: { ...prev.user, ...patch },
      };
      writeCachedSession(next);
      return next;
    });
  };

  return (
    <SessionContext.Provider
      value={{
        ready,
        session,
        error,
        channel: session?.channel ?? null,
        isChannelAdmin: session?.isChannelAdmin === true,
        offline,
        appMode,
        refreshSession,
        unlockExtended,
        switchToGuest,
        patchSessionUser,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

/** @deprecated use useSession */
export const useTelegram = useSession;
/** @deprecated use SessionProvider */
export const TelegramProvider = SessionProvider;
