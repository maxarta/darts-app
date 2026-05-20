import { describe, expect, it } from "vitest";
import {
  computePlayerStats,
  getGameWinnerIds,
  type FinishedGameForStats,
} from "@/lib/stats/player-stats";

function game(
  id: string,
  players: FinishedGameForStats["game_players"],
  current_round: number,
  settings: Record<string, unknown> = { legsToWin: 1 }
): FinishedGameForStats {
  return {
    id,
    mode: "501",
    settings,
    current_round,
    game_players: players,
  };
}

describe("player stats", () => {
  it("counts win at current_round when legsToWin is 1", () => {
    const g = game(
      "g1",
      [
        { user_id: 1, legs_won: 1, remaining_score: 0, darts_thrown: 9 },
        { user_id: 2, legs_won: 0, remaining_score: 401, darts_thrown: 9 },
      ],
      7
    );
    expect(getGameWinnerIds(g)).toEqual(new Set([1]));
    const stats = computePlayerStats(1, [g]);
    expect(stats.wins).toBe(1);
    expect(stats.avgWinRound).toBe(7);
  });

  it("requires legsToWin for a match win", () => {
    const g = game(
      "g1",
      [
        { user_id: 1, legs_won: 1, remaining_score: 0, darts_thrown: 9 },
        { user_id: 2, legs_won: 0, remaining_score: 401, darts_thrown: 9 },
      ],
      4,
      { legsToWin: 2 }
    );
    expect(getGameWinnerIds(g)).toEqual(new Set());
    expect(computePlayerStats(1, [g]).wins).toBe(0);
  });

  it("averages win rounds across victories", () => {
    const stats = computePlayerStats(1, [
      game(
        "a",
        [
          { user_id: 1, legs_won: 1, remaining_score: 0, darts_thrown: 6 },
          { user_id: 2, legs_won: 0, remaining_score: 300, darts_thrown: 6 },
        ],
        5
      ),
      game(
        "b",
        [
          { user_id: 1, legs_won: 1, remaining_score: 0, darts_thrown: 12 },
          { user_id: 2, legs_won: 0, remaining_score: 120, darts_thrown: 12 },
        ],
        15
      ),
    ]);
    expect(stats.wins).toBe(2);
    expect(stats.avgWinRound).toBe(10);
  });
});
