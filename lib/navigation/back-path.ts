export function homePath(channelId: string | null): string {
  return channelId ? `/?channelId=${encodeURIComponent(channelId)}` : "/";
}

export type BackTarget = string | "history_back" | "game_menu";

/** @deprecated use BackTarget */
export type TelegramBackTarget = BackTarget;

/** Where the back chevron should go; null — hide. */
export function resolveBackPath(
  pathname: string,
  searchParams: URLSearchParams
): BackTarget | null {
  if (pathname === "/") return null;

  const channelId = searchParams.get("channelId");
  const q = channelId ? `?channelId=${encodeURIComponent(channelId)}` : "";

  if (pathname === "/stats") return homePath(channelId);
  if (pathname === "/stats/players") return homePath(channelId);
  if (pathname === "/stats/games") return homePath(channelId);
  if (pathname === "/stats/current") return homePath(channelId);

  if (pathname.startsWith("/stats/players/")) {
    if (searchParams.get("from") === "stats") {
      return `/stats${q}`;
    }
    return `/stats/players${q}`;
  }

  if (pathname === "/game/new" || pathname === "/tournament/new") {
    return "history_back";
  }

  if (pathname.startsWith("/tournament/")) {
    return homePath(channelId);
  }

  if (pathname.startsWith("/game/") && pathname !== "/game/new") {
    return "game_menu";
  }

  return "history_back";
}

/** @deprecated use resolveBackPath */
export const resolveTelegramBackPath = resolveBackPath;
