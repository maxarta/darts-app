/** Client-safe TV board key helpers (no server imports). */

export type TvBoardKeyKind = "tournament" | "game" | "channel";

export function tournamentBoardKey(tournamentId: string): string {
  return `t:${tournamentId}`;
}

export function gameBoardKey(gameId: string): string {
  return `g:${gameId}`;
}

/** Stable free-game TV board for a club session (survives rematch / roster changes). */
export function channelBoardKey(channelId: string): string {
  return `c:${channelId}`;
}

export function parseTvBoardKey(
  raw: string
): { kind: TvBoardKeyKind; refId: string; boardKey: string } | null {
  const boardKey = decodeURIComponent(raw);
  if (boardKey.startsWith("t:") && boardKey.length > 2) {
    return { boardKey, kind: "tournament", refId: boardKey.slice(2) };
  }
  if (boardKey.startsWith("g:") && boardKey.length > 2) {
    return { boardKey, kind: "game", refId: boardKey.slice(2) };
  }
  if (boardKey.startsWith("c:") && boardKey.length > 2) {
    return { boardKey, kind: "channel", refId: boardKey.slice(2) };
  }
  return null;
}
