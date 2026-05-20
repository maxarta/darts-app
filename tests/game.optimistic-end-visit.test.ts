import { describe, it, expect } from "vitest";
import { optimisticEndVisit, type GameSnapshot } from "@/lib/game/optimistic";
import { shouldApplyServerSnapshot } from "@/lib/game/snapshot-equal";

function twoPlayerGame(): GameSnapshot {
  return {
    game: {
      id: "g1",
      channel_id: "c1",
      mode: "501",
      status: "active",
      current_player_index: 0,
      current_round: 1,
      current_leg: 1,
      settings: { startingScore: 501, maxRounds: 20, legsToWin: 3 },
    },
    players: [
      {
        id: "p1",
        user_id: 1,
        order_index: 0,
        remaining_score: 416,
        visit_score: 85,
        darts_thrown: 3,
        score_at_visit_start: 501,
        legs_won: 0,
      },
      {
        id: "p2",
        user_id: 2,
        order_index: 1,
        remaining_score: 501,
        visit_score: 0,
        darts_thrown: 0,
        score_at_visit_start: 501,
        legs_won: 0,
      },
    ],
    activeVisitThrows: [
      { segment: 20, multiplier: 3 },
      { segment: 20, multiplier: 1 },
      { segment: 5, multiplier: 1 },
    ],
  };
}

describe("optimisticEndVisit", () => {
  it("advances to next player and clears visit", () => {
    const next = optimisticEndVisit(twoPlayerGame());
    expect(next).not.toBeNull();
    expect(next!.game.current_player_index).toBe(1);
    expect(next!.activeVisitThrows).toEqual([]);
    expect(next!.players[0].visit_score).toBe(0);
    expect(next!.players[0].remaining_score).toBe(416);
    expect(next!.players[1].visit_score).toBe(0);
  });

  it("pads misses when fewer than 3 darts", () => {
    const data = twoPlayerGame();
    data.activeVisitThrows = [{ segment: 20, multiplier: 1 }];
    data.players[0].darts_thrown = 1;
    data.players[0].visit_score = 20;
    data.players[0].remaining_score = 481;
    const next = optimisticEndVisit(data);
    expect(next!.game.current_player_index).toBe(1);
    expect(next!.players[0].darts_thrown).toBe(3);
    expect(next!.players[0].remaining_score).toBe(481);
  });
});

describe("shouldApplyServerSnapshot after optimistic end", () => {
  it("rejects stale server still on previous player with throws", () => {
    const prev = optimisticEndVisit(twoPlayerGame())!;
    const stale = twoPlayerGame();
    expect(shouldApplyServerSnapshot(prev, stale)).toBe(false);
  });
});
