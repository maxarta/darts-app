"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { KENNY_THEME_COLOR } from "@/lib/tournament/variant";

const HOME_BG = "#ffdf20";
const NEW_GAME_BG = "#ff2056";
const GAME_BG = "#f9fafb";

export function TelegramChrome() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHome = pathname === "/";
  const isKennyTournament =
    searchParams.get("variant") === "kenny" &&
    (pathname === "/tournament/new" || /^\/tournament\/[^/]+$/.test(pathname));
  const isNewGame =
    (pathname === "/game/new" || pathname === "/tournament/new") &&
    !isKennyTournament;
  const isScoring = pathname.startsWith("/game/") && !isNewGame;

  useEffect(() => {
    void import("@twa-dev/sdk")
      .then(({ default: WebApp }) => {
        const bg = isHome
          ? HOME_BG
          : isKennyTournament
            ? KENNY_THEME_COLOR
            : isNewGame
              ? NEW_GAME_BG
              : isScoring
                ? GAME_BG
                : "#1a1a1a";
        if (WebApp.isVersionAtLeast("6.1")) {
          WebApp.setHeaderColor(bg);
          WebApp.setBackgroundColor(bg);
        }
      })
      .catch(() => {});
  }, [isHome, isKennyTournament, isNewGame, isScoring]);

  return null;
}
