import { describe, it, expect } from "vitest";
import { formatThrowLabel } from "@/lib/darts/format";
import {
  applyVisit,
  calculatePpr,
  defaultSettings,
  isBust,
  isThreeDartCheckoutRange,
  throwPoints,
} from "@/lib/darts/rules";

describe("formatThrowLabel", () => {
  it("shows МИМО for miss with zero points", () => {
    const miss = { segment: "miss" as const, multiplier: 1 as const };
    expect(formatThrowLabel(miss)).toBe("МИМО");
    expect(throwPoints(miss)).toBe(0);
  });
});

describe("throwPoints", () => {
  it("scores singles and triples", () => {
    expect(throwPoints({ segment: 20, multiplier: 3 })).toBe(60);
    expect(throwPoints({ segment: "miss", multiplier: 1 })).toBe(0);
    expect(throwPoints({ segment: "bull25", multiplier: 1 })).toBe(25);
    expect(throwPoints({ segment: "bull50", multiplier: 1 })).toBe(50);
  });
});

describe("bust and checkout", () => {
  const settings = defaultSettings(501);

  it("busts on negative", () => {
    expect(isBust(10, [{ segment: 20, multiplier: 1 }], true)).toBe(true);
  });

  it("busts on 1 left with double out", () => {
    expect(isBust(2, [{ segment: 1, multiplier: 1 }], true)).toBe(true);
  });

  it("allows double checkout", () => {
    const visit = [{ segment: 16, multiplier: 2 }];
    expect(isBust(32, visit, true)).toBe(false);
    const result = applyVisit(32, visit, settings);
    expect(result.legWon).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("busts when checkout not on double", () => {
    expect(isBust(20, [{ segment: 20, multiplier: 1 }], true)).toBe(true);
  });

  it("reverts score on bust visit", () => {
    const result = applyVisit(32, [{ segment: 20, multiplier: 3 }], settings);
    expect(result.bust).toBe(true);
    expect(result.remaining).toBe(32);
  });

  it("does not bust when visit is padded with misses after checkout", () => {
    const visit = [
      { segment: 16, multiplier: 2 },
      { segment: "miss", multiplier: 1 },
      { segment: "miss", multiplier: 1 },
    ] as const;
    expect(isBust(32, [...visit], true)).toBe(false);
    const result = applyVisit(32, [...visit], settings);
    expect(result.legWon).toBe(true);
  });
});

describe("calculatePpr", () => {
  it("returns 0 with no darts", () => {
    expect(calculatePpr(501, 501, 0)).toBe(0);
  });

  it("calculates average", () => {
    expect(calculatePpr(501, 401, 3)).toBe(100);
  });
});

describe("isThreeDartCheckoutRange", () => {
  it("covers double-out finish zone", () => {
    expect(isThreeDartCheckoutRange(170, true)).toBe(true);
    expect(isThreeDartCheckoutRange(40, true)).toBe(true);
    expect(isThreeDartCheckoutRange(2, true)).toBe(true);
    expect(isThreeDartCheckoutRange(171, true)).toBe(false);
    expect(isThreeDartCheckoutRange(1, true)).toBe(false);
  });
});
