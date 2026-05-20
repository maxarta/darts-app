import { describe, expect, it } from "vitest";
import {
  generateRoundRobinPairings,
  shuffleInPlace,
} from "@/lib/tournament/bracket";

describe("shuffleInPlace", () => {
  it("keeps the same elements", () => {
    const input = [1, 2, 3, 4, 5];
    const shuffled = shuffleInPlace(input, () => 0.99);
    expect(shuffled.sort((a, b) => a - b)).toEqual(input);
  });

  it("can reorder round robin pairings", () => {
    const pairings = generateRoundRobinPairings([10, 20, 30, 40]);
    let reordered = false;
    for (let i = 0; i < 20; i++) {
      const shuffled = shuffleInPlace(pairings, () => Math.random());
      if (shuffled.some((p, idx) => p !== pairings[idx])) {
        reordered = true;
        break;
      }
    }
    expect(reordered).toBe(true);
  });
});
