type LegsPlayer = {
  user_id: number;
  legs_won: number;
};

/** Total legs played in a match (sum of legs won per player). */
export function getGameLegsPlayed(players: Array<{ legs_won: number }>): number {
  return players.reduce((sum, p) => sum + p.legs_won, 0);
}

/** Players with the most legs won in a finished game (all ties included). */
export function getFinishedGameWinnerIds(
  players: LegsPlayer[],
  isFinished: boolean
): Set<number> {
  if (!isFinished || players.length === 0) return new Set();

  const maxLegs = Math.max(...players.map((p) => p.legs_won));
  if (maxLegs <= 0) return new Set();

  return new Set(
    players.filter((p) => p.legs_won === maxLegs).map((p) => p.user_id)
  );
}

/** Winner(s) first, then remaining players in original order. */
export function sortPlayersWinnerFirst<T extends LegsPlayer>(
  players: T[],
  isFinished: boolean
): T[] {
  const winnerIds = getFinishedGameWinnerIds(players, isFinished);
  if (winnerIds.size === 0) return [...players];

  const winners = players.filter((p) => winnerIds.has(p.user_id));
  const others = players.filter((p) => !winnerIds.has(p.user_id));
  return [...winners, ...others];
}
