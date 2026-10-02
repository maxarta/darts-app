"use client";

import { useEffect, useRef } from "react";
import { setGameMenuHandler } from "@/lib/telegram/game-menu-bridge";
import { showTelegramGameMenu } from "@/lib/telegram/game-menu-popup";
import { useTelegramEnv } from "@/lib/telegram/use-is-telegram";

type Props = {
  onRestart?: () => void;
  onLeave?: () => void;
  disabled?: boolean;
};

/**
 * В Telegram: нативная «Назад» открывает popup-меню.
 * В браузере меню регистрирует GameHeader (⋯ / кнопка «Меню»).
 */
export function TelegramGameMenu({ onRestart, onLeave, disabled }: Props) {
  const env = useTelegramEnv();
  const callbacksRef = useRef({ onRestart, onLeave });
  callbacksRef.current = { onRestart, onLeave };

  useEffect(() => {
    if (env !== "telegram") return;
    const open = () => {
      void showTelegramGameMenu(callbacksRef.current);
    };
    setGameMenuHandler(open);
    return () => setGameMenuHandler(null);
  }, [env]);

  useEffect(() => {
    if (disabled || env !== "telegram") return;

    let cancelled = false;
    void import("@twa-dev/sdk")
      .then(({ default: WebApp }) => {
        if (cancelled || !WebApp.initData) return;
        WebApp.enableClosingConfirmation();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      void import("@twa-dev/sdk")
        .then(({ default: WebApp }) => {
          WebApp.disableClosingConfirmation();
        })
        .catch(() => {});
    };
  }, [disabled, env]);

  return null;
}
