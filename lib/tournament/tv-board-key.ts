/** Client-safe TV board key helpers (no server imports). */

export function tournamentBoardKey(tournamentId: string): string {
  return `t:${tournamentId}`;
}

export function gameBoardKey(gameId: string): string {
  return `g:${gameId}`;
}

export function parseTvBoardKey(
  raw: string
): { kind: "tournament" | "game"; refId: string; boardKey: string } | null {
  const boardKey = decodeURIComponent(raw);
  if (boardKey.startsWith("t:") && boardKey.length > 2) {
    return { boardKey, kind: "tournament", refId: boardKey.slice(2) };
  }
  if (boardKey.startsWith("g:") && boardKey.length > 2) {
    return { boardKey, kind: "game", refId: boardKey.slice(2) };
  }
  return null;
}
