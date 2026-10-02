"use client";

import { openGameMenuFromTelegramBack } from "@/lib/telegram/game-menu-bridge";
import { resolveTelegramBackPath } from "@/lib/telegram/navigation";
import { useTelegramEnv } from "@/lib/telegram/use-is-telegram";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

let backButtonMounted = false;

export function TelegramBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = resolveTelegramBackPath(pathname, searchParams);
  const env = useTelegramEnv();

  const onClick = useCallback(() => {
    if (!target) return;
    if (target === "game_menu") {
      openGameMenuFromTelegramBack();
      return;
    }
    if (target === "history_back") {
      router.back();
      return;
    }
    router.push(target);
  }, [router, target]);

  useEffect(() => {
    if (env !== "telegram") return;
    let cancelled = false;

    void import("@twa-dev/sdk")
      .then(({ default: WebApp }) => {
        if (cancelled) return;

        if (!WebApp.isVersionAtLeast("6.1")) return;

        const back = WebApp.BackButton;
        if (!target) {
          if (backButtonMounted) {
            back.hide();
            backButtonMounted = false;
          }
          return;
        }

        back.show();
        backButtonMounted = true;
        back.onClick(onClick);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      void import("@twa-dev/sdk")
        .then(({ default: WebApp }) => {
          if (!WebApp.isVersionAtLeast("6.1")) return;
          WebApp.BackButton.offClick(onClick);
          setTimeout(() => {
            if (!backButtonMounted) return;
            const next = resolveTelegramBackPath(
              window.location.pathname,
              new URLSearchParams(window.location.search)
            );
            if (!next) {
              WebApp.BackButton.hide();
              backButtonMounted = false;
            }
          }, 10);
        })
        .catch(() => {});
    };
  }, [target, onClick, env]);

  return null;
}
