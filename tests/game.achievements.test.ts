import { describe, expect, it } from "vitest";
import { detectVisitAchievements } from "@/lib/game/achievements";
import {
  isDirectHitVisit,
  isHuzpaClassicVisit,
  isHuzpaSpecialVisit,
  isHuzpaUnderVisit,
  isStefanVisit,
  isStefanZeroVisit,
} from "@/lib/game/achievements/visit-detectors";

describe("visit achievements", () => {
  it("triple-1 on T1", () => {
    expect(
      detectVisitAchievements([{ segment: 1, multiplier: 3 }])
    ).toContain("triple-1");
  });

  it("triple-20 on T20", () => {
    expect(
      detectVisitAchievements([{ segment: 20, multiplier: 3 }])
    ).toContain("triple-20");
  });

  it("triple-7 on T7", () => {
    expect(
      detectVisitAchievements([{ segment: 7, multiplier: 3 }])
    ).toContain("triple-7");
  });

  it("bull on bull50 or bull25", () => {
    expect(
      detectVisitAchievements([{ segment: "bull50", multiplier: 1 }])
    ).toContain("bull");
    expect(
      detectVisitAchievements([{ segment: "bull25", multiplier: 2 }])
    ).toContain("bull");
  });

  it("directhit on two T20", () => {
    expect(
      isDirectHitVisit([
        { segment: 20, multiplier: 3 },
        { segment: 20, multiplier: 3 },
      ])
    ).toBe(true);
  });

  it("gagarin on T12", () => {
    expect(
      detectVisitAchievements([{ segment: 12, multiplier: 3 }])
    ).toContain("gagarin");
  });

  it("huzpa-classic when 1, 5, 20 all singles", () => {
    expect(
      isHuzpaClassicVisit([
        { segment: 20, multiplier: 1 },
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 1 },
      ])
    ).toBe(true);
    expect(
      detectVisitAchievements([
        { segment: 20, multiplier: 1 },
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 1 },
      ])
    ).toEqual(expect.arrayContaining(["huzpa-classic"]));
    expect(
      detectVisitAchievements([
        { segment: 20, multiplier: 1 },
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 1 },
      ])
    ).not.toContain("huzpa-special");
  });

  it("huzpa-special not classic when double or triple on 1, 5, 20", () => {
    expect(
      isHuzpaClassicVisit([
        { segment: 20, multiplier: 1 },
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 2 },
      ])
    ).toBe(false);
    const ids = detectVisitAchievements([
      { segment: 20, multiplier: 1 },
      { segment: 1, multiplier: 1 },
      { segment: 5, multiplier: 2 },
    ]);
    expect(ids).toContain("huzpa-special");
    expect(ids).not.toContain("huzpa-classic");
  });

  it("huzpa-special when 1,5,20 with a double or triple", () => {
    expect(
      isHuzpaSpecialVisit([
        { segment: 1, multiplier: 2 },
        { segment: 5, multiplier: 1 },
        { segment: 20, multiplier: 1 },
      ])
    ).toBe(true);
  });

  it("huzpa-under when two of 1,5,20 and one miss", () => {
    expect(
      isHuzpaUnderVisit([
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 1 },
        { segment: "miss", multiplier: 1 },
      ])
    ).toBe(true);
    expect(
      isHuzpaUnderVisit([
        { segment: "miss", multiplier: 1 },
        { segment: 20, multiplier: 1 },
        { segment: 1, multiplier: 1 },
      ])
    ).toBe(true);
  });

  it("huzpa-under does not fire when third dart is another sector", () => {
    expect(
      isHuzpaUnderVisit([
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 1 },
        { segment: 18, multiplier: 1 },
      ])
    ).toBe(false);
  });

  it("does not fire huzpa-under before third dart", () => {
    expect(
      isHuzpaUnderVisit([
        { segment: 1, multiplier: 1 },
        { segment: 5, multiplier: 1 },
      ])
    ).toBe(false);
  });

  it("miss when last throw is miss", () => {
    expect(
      detectVisitAchievements([{ segment: "miss", multiplier: 1 }])
    ).toContain("miss");
    expect(
      detectVisitAchievements([
        { segment: "miss", multiplier: 1 },
        { segment: 20, multiplier: 1 },
      ])
    ).not.toContain("miss");
  });

  it("stefan-zero on three misses in one visit", () => {
    expect(
      isStefanZeroVisit([
        { segment: "miss", multiplier: 1 },
        { segment: "miss", multiplier: 1 },
        { segment: "miss", multiplier: 1 },
      ])
    ).toBe(true);
    const ids = detectVisitAchievements([
      { segment: "miss", multiplier: 1 },
      { segment: "miss", multiplier: 1 },
      { segment: "miss", multiplier: 1 },
    ]);
    expect(ids[0]).toBe("stefan-zero");
    expect(ids).not.toContain("miss");
  });

  it("stefan-zero does not fire before third dart", () => {
    expect(
      isStefanZeroVisit([
        { segment: "miss", multiplier: 1 },
        { segment: "miss", multiplier: 1 },
      ])
    ).toBe(false);
    expect(
      detectVisitAchievements([
        { segment: "miss", multiplier: 1 },
        { segment: "miss", multiplier: 1 },
      ])
    ).toEqual(["miss"]);
  });

  it("stefan on three T20", () => {
    expect(
      isStefanVisit([
        { segment: 20, multiplier: 3 },
        { segment: 20, multiplier: 3 },
        { segment: 20, multiplier: 3 },
      ])
    ).toBe(true);
    const ids = detectVisitAchievements([
      { segment: 20, multiplier: 3 },
      { segment: 20, multiplier: 3 },
      { segment: 20, multiplier: 3 },
    ]);
    expect(ids[0]).toBe("stefan");
    expect(ids).toContain("directhit");
    expect(ids).toContain("triple-20");
  });
});
