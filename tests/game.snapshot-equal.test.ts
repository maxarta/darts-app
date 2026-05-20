import { describe, it, expect } from "vitest";
import {
  gameSnapshotEqual,
  shouldApplyServerSnapshot,
} from "@/lib/game/snapshot-equal";
import type { GameSnapshot } from "@/lib/game/optimistic";

const base = (): GameSnapshot => ({
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
      remaining_score: 441,
      visit_score: 60,
      darts_thrown: 3,
      score_at_visit_start: 501,
      legs_won: 0,
    },
  ],
  activeVisitThrows: [
    { segment: 20, multiplier: 3 },
    { segment: 20, multiplier: 1 },
  ],
});

describe("shouldApplyServerSnapshot", () => {
  it("rejects stale server with fewer throws", () => {
    const prev = base();
    const stale: GameSnapshot = {
      ...prev,
      activeVisitThrows: [{ segment: 20, multiplier: 3 }],
      players: [{ ...prev.players[0], darts_thrown: 1, visit_score: 60 }],
    };
    expect(shouldApplyServerSnapshot(prev, stale)).toBe(false);
  });

  it("accepts equal progression", () => {
    const prev = base();
    const next: GameSnapshot = {
      ...prev,
      activeVisitThrows: [
        ...prev.activeVisitThrows,
        { segment: 5, multiplier: 1 },
      ],
      players: [{ ...prev.players[0], darts_thrown: 3, visit_score: 65 }],
    };
    expect(gameSnapshotEqual(prev, next)).toBe(false);
    expect(shouldApplyServerSnapshot(prev, next)).toBe(true);
  });

  it("accepts server end-visit after local throws", () => {
    const prev = base();
    const next: GameSnapshot = {
      ...prev,
      game: { ...prev.game, current_player_index: 0 },
      activeVisitThrows: [],
      players: [
        {
          ...prev.players[0],
          darts_thrown: 3,
          visit_score: 0,
          remaining_score: 441,
        },
      ],
    };
    expect(shouldApplyServerSnapshot(prev, next)).toBe(true);
  });

  it("accepts undo after end-visit (back to previous player)", () => {
    const afterEnd: GameSnapshot = {
      ...base(),
      game: { ...base().game, current_player_index: 1 },
      activeVisitThrows: [],
      players: [
        {
          ...base().players[0],
          remaining_score: 441,
          visit_score: 0,
          darts_thrown: 3,
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
    };
    const afterUndo: GameSnapshot = {
      ...afterEnd,
      game: { ...afterEnd.game, current_player_index: 0 },
      activeVisitThrows: [
        { segment: 20, multiplier: 3 },
        { segment: 20, multiplier: 1 },
      ],
      players: [
        {
          ...afterEnd.players[0],
          visit_score: 80,
          remaining_score: 416,
        },
        afterEnd.players[1],
      ],
    };
    expect(
      shouldApplyServerSnapshot(afterEnd, afterUndo, { trustUndo: true })
    ).toBe(true);
  });
});
