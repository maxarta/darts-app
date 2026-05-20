/** Minimum players for a game to count in stats / archive (solo practice excluded). */
export const MIN_PLAYERS_FOR_STATS = 2;

export function isMultiplayerGame(
  players: ReadonlyArray<unknown> | null | undefined
): boolean {
  return (players?.length ?? 0) >= MIN_PLAYERS_FOR_STATS;
}

/** Returns game IDs that have at least `MIN_PLAYERS_FOR_STATS` players. */
export function gameIdsWithMinPlayers(
  rows: ReadonlyArray<{ game_id: string }>,
  minPlayers = MIN_PLAYERS_FOR_STATS
): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1);
  }
  const ids = new Set<string>();
  for (const [gameId, count] of counts) {
    if (count >= minPlayers) ids.add(gameId);
  }
  return ids;
}
