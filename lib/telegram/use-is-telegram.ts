"use client";

import { useEffect, useState } from "react";

export type TelegramEnv = "telegram" | "browser" | "pending";

function syncIsTelegram(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.twa === "1") return true;
  const init = (
    window as unknown as { Telegram?: { WebApp?: { initData?: string } } }
  ).Telegram?.WebApp?.initData;
  return Boolean(init);
}

/** Где открыто приложение; `pending` — SDK ещё не ответил. */
export function useTelegramEnv(): TelegramEnv {
  const [env, setEnv] = useState<TelegramEnv>("pending");

  useEffect(() => {
    if (syncIsTelegram()) {
      setEnv("telegram");
      return;
    }
    void import("@twa-dev/sdk")
      .then(({ default: WebApp }) => {
        setEnv(WebApp.initData ? "telegram" : "browser");
      })
      .catch(() => setEnv("browser"));
  }, []);

  return env;
}

/** True when running inside Telegram WebApp with valid init data. */
export function useIsTelegram(): boolean {
  return useTelegramEnv() === "telegram";
}
