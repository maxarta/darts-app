import { describe, expect, it } from "vitest";
import { isHutspaVisit } from "@/lib/darts/hutspa";

describe("isHutspaVisit", () => {
  it("is true when 1, 5 and 20 singles in any order", () => {
    expect(
      isHutspaVisit([
        { segment: 20, multiplier: 1 },
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 1 },
      ])
    ).toBe(true);
  });

  it("is false when a sector uses double or triple", () => {
    expect(
      isHutspaVisit([
        { segment: 20, multiplier: 1 },
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 2 },
      ])
    ).toBe(false);

    expect(
      isHutspaVisit([
        { segment: 5, multiplier: 3 },
        { segment: 20, multiplier: 2 },
        { segment: 1, multiplier: 1 },
      ])
    ).toBe(false);
  });

  it("is false when a sector is missing", () => {
    expect(
      isHutspaVisit([
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 1 },
        { segment: 6, multiplier: 1 },
      ])
    ).toBe(false);
  });

  it("ignores bulls and misses for segment coverage", () => {
    expect(
      isHutspaVisit([
        { segment: 1, multiplier: 1 },
        { segment: "bull50", multiplier: 1 },
        { segment: 5, multiplier: 1 },
        { segment: "miss", multiplier: 1 },
        { segment: 20, multiplier: 1 },
      ])
    ).toBe(true);
  });
});
