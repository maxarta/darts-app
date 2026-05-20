import { describe, expect, it } from "vitest";
import {
  getFinishedGameWinnerIds,
  getGameLegsPlayed,
  sortPlayersWinnerFirst,
} from "@/lib/stats/game-winners";

describe("getGameLegsPlayed", () => {
  it("sums legs won across players", () => {
    expect(
      getGameLegsPlayed([
        { legs_won: 2 },
        { legs_won: 1 },
      ])
    ).toBe(3);
  });
});

describe("getFinishedGameWinnerIds", () => {
  const players = [
    { user_id: 1, legs_won: 2 },
    { user_id: 2, legs_won: 3 },
  ];

  it("returns empty set when game is not finished", () => {
    expect(getFinishedGameWinnerIds(players, false).size).toBe(0);
  });

  it("picks player with most legs won", () => {
    expect(getFinishedGameWinnerIds(players, true)).toEqual(new Set([2]));
  });

  it("includes all players tied at max legs", () => {
    const tied = [
      { user_id: 1, legs_won: 2 },
      { user_id: 2, legs_won: 2 },
    ];
    expect(getFinishedGameWinnerIds(tied, true)).toEqual(new Set([1, 2]));
  });

  it("returns no winners when max legs is zero", () => {
    const none = [
      { user_id: 1, legs_won: 0 },
      { user_id: 2, legs_won: 0 },
    ];
    expect(getFinishedGameWinnerIds(none, true).size).toBe(0);
  });
});

describe("sortPlayersWinnerFirst", () => {
  it("puts winner first when game is finished", () => {
    const players = [
      { user_id: 1, legs_won: 1 },
      { user_id: 2, legs_won: 3 },
    ];
    expect(sortPlayersWinnerFirst(players, true).map((p) => p.user_id)).toEqual([
      2, 1,
    ]);
  });

  it("keeps original order when game is not finished", () => {
    const players = [
      { user_id: 1, legs_won: 1 },
      { user_id: 2, legs_won: 3 },
    ];
    expect(sortPlayersWinnerFirst(players, false).map((p) => p.user_id)).toEqual([
      1, 2,
    ]);
  });
});
