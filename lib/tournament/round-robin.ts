export function roundRobinWinnerId(match: {
  played: boolean;
  player1_id: number;
  player2_id: number;
  points_p1: number | null;
  points_p2: number | null;
}): number | null {
  if (!match.played || match.points_p1 == null || match.points_p2 == null) {
    return null;
  }
  if (match.points_p1 > match.points_p2) return match.player1_id;
  if (match.points_p2 > match.points_p1) return match.player2_id;
  return null;
}
