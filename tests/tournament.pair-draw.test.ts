import { describe, expect, it } from "vitest";
import { drawRandomPairs, isPairKnockoutFormat } from "@/lib/tournament/pair-draw";

describe("drawRandomPairs", () => {
  it("pairs even fields with no bye", () => {
    const { pairs, byes } = drawRandomPairs([1, 2, 3, 4], () => 0);
    expect(pairs).toHaveLength(2);
    expect(byes).toEqual([]);
    const ids = pairs.flat();
    expect(ids.sort()).toEqual([1, 2, 3, 4]);
  });

  it("gives one bye when odd", () => {
    const { pairs, byes } = drawRandomPairs([1, 2, 3, 4, 5], () => 0);
    expect(pairs).toHaveLength(2);
    expect(byes).toHaveLength(1);
    expect([...pairs.flat(), ...byes].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles two players as one pair", () => {
    const { pairs, byes } = drawRandomPairs([10, 20], () => 0);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.sort()).toEqual([10, 20]);
    expect(byes).toEqual([]);
  });

  it("detects pair_ko format", () => {
    expect(isPairKnockoutFormat({ format: "pair_ko", legsToWin: 2 })).toBe(
      true
    );
    expect(isPairKnockoutFormat({ legsToWin: 2 })).toBe(false);
  });
});
