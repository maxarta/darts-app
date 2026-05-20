"use client";

import { useEffect, useRef } from "react";
import { setGameMenuHandler } from "@/lib/telegram/game-menu-bridge";
import { showTelegramGameMenu } from "@/lib/telegram/game-menu-popup";

type Props = {
  onRestart?: () => void;
  onLeave?: () => void;
  disabled?: boolean;
};

/**
 * В игре: нативная кнопка «Назад» (←) открывает меню (см. TelegramBackButton).
 * Закрытие мини-приложения (×) — только у Telegram; включаем подтверждение.
 */
export function TelegramGameMenu({ onRestart, onLeave, disabled }: Props) {
  const callbacksRef = useRef({ onRestart, onLeave });
  callbacksRef.current = { onRestart, onLeave };

  useEffect(() => {
    const open = () => {
      void showTelegramGameMenu(callbacksRef.current);
    };
    setGameMenuHandler(open);
    return () => setGameMenuHandler(null);
  }, []);

  useEffect(() => {
    if (disabled) return;

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
  }, [disabled]);

  return null;
}
