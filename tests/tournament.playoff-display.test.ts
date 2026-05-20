import { describe, it, expect } from "vitest";
import {
  buildEmptyPlayoffSkeleton,
  buildPlayoffDisplay,
  getPlayoffBracketRounds,
} from "@/lib/tournament/playoff-display";

describe("buildEmptyPlayoffSkeleton", () => {
  it("builds all rounds with empty slots for top-4", () => {
    const matches = buildEmptyPlayoffSkeleton(4);
    expect(matches).toHaveLength(3);
    expect(matches.every((m) => m.player1_id == null && m.player2_id == null)).toBe(
      true
    );
    expect(matches.every((m) => m.isPreview)).toBe(true);
  });

  it("builds all rounds with empty slots for top-8", () => {
    const matches = buildEmptyPlayoffSkeleton(8);
    expect(matches).toHaveLength(7);
    expect(matches.filter((m) => m.round === 1)).toHaveLength(4);
    expect(matches.filter((m) => m.round === 2)).toHaveLength(2);
    expect(matches.filter((m) => m.round === 3)).toHaveLength(1);
  });
});

describe("buildPlayoffDisplay", () => {
  it("returns empty skeleton when playoff not started", () => {
    const matches = buildPlayoffDisplay(4, []);
    expect(matches[0].player1_id).toBeNull();
    expect(matches.some((m) => m.id.startsWith("skeleton-"))).toBe(true);
  });

  it("splits bracket rounds before final", () => {
    expect(getPlayoffBracketRounds(8)).toEqual([1, 2]);
    expect(getPlayoffBracketRounds(4)).toEqual([1]);
  });

  it("uses db matches when playoff started", () => {
    const db = [
      {
        id: "real-1",
        round: 1,
        slot: 0,
        player1_id: 1,
        player2_id: 4,
        game_id: null,
        winner_id: null,
      },
    ];
    const matches = buildPlayoffDisplay(4, db);
    expect(matches).toHaveLength(1);
    expect(matches[0].isPreview).toBe(false);
    expect(matches[0].id).toBe("real-1");
  });
});
