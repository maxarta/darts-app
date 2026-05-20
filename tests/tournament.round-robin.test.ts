import { describe, it, expect } from "vitest";
import { roundRobinWinnerId } from "@/lib/tournament/round-robin";

describe("roundRobinWinnerId", () => {
  it("returns winner by points", () => {
    expect(
      roundRobinWinnerId({
        played: true,
        player1_id: 1,
        player2_id: 2,
        points_p1: 2,
        points_p2: 0,
      })
    ).toBe(1);
  });

  it("returns null when not played", () => {
    expect(
      roundRobinWinnerId({
        played: false,
        player1_id: 1,
        player2_id: 2,
        points_p1: null,
        points_p2: null,
      })
    ).toBeNull();
  });
});
