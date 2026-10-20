import { describe, expect, it } from "vitest";
import { detectVisitAchievements } from "@/lib/game/achievements";
import {
  flyoutsForNewThrows,
  isBitchVisit,
  isDirectHitVisit,
  isGetdownVisit,
  isHuzpaClassicVisit,
  isHuzpaSpecialVisit,
  isHuzpaUnderVisit,
  isShtoshVisit,
  isStefanVisit,
  isStefanZeroVisit,
  isStephanStart,
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

  it("getdown when D3 is left and the visit is all misses", () => {
    const misses = [
      { segment: "miss" as const, multiplier: 1 as const },
      { segment: "miss" as const, multiplier: 1 as const },
      { segment: "miss" as const, multiplier: 1 as const },
    ];
    expect(isGetdownVisit(misses, { remainingAtStart: 6 })).toBe(true);
    expect(isGetdownVisit(misses, { remainingAtStart: 6, doubleOut: false })).toBe(
      false
    );
    expect(isGetdownVisit(misses, { remainingAtStart: 10 })).toBe(false);
    expect(
      detectVisitAchievements(misses, { remainingAtStart: 6 })
    ).toEqual(expect.arrayContaining(["getdown", "stefan-zero"]));
  });

  it("bitch when D1 is left and the visit is all misses", () => {
    const misses = [
      { segment: "miss" as const, multiplier: 1 as const },
      { segment: "miss" as const, multiplier: 1 as const },
      { segment: "miss" as const, multiplier: 1 as const },
    ];
    expect(isBitchVisit(misses, { remainingAtStart: 2 })).toBe(true);
    expect(isBitchVisit(misses.slice(0, 2), { remainingAtStart: 2 })).toBe(
      false
    );
  });

  it("shta on T3 and hoba on T19", () => {
    expect(
      detectVisitAchievements([{ segment: 3, multiplier: 3 }])
    ).toContain("shta");
    expect(
      detectVisitAchievements([{ segment: 19, multiplier: 3 }])
    ).toContain("hoba");
  });

  it("stephan when a player named Stepan starts the visit", () => {
    const dart = { segment: 20 as const, multiplier: 1 as const };
    expect(isStephanStart([dart], { playerName: "Степан" })).toBe(true);
    expect(isStephanStart([dart], { playerName: "степан иванов" })).toBe(true);
    expect(isStephanStart([dart], { playerName: "СТЕПАН" })).toBe(true);
    expect(isStephanStart([dart], { playerName: "Стефан" })).toBe(false);
    expect(isStephanStart([], { playerName: "Степан" })).toBe(false);
  });

  it("shtosh on 0, 0, 1 in any order", () => {
    const miss = { segment: "miss" as const, multiplier: 1 as const };
    const single1 = { segment: 1 as const, multiplier: 1 as const };
    expect(isShtoshVisit([miss, miss, single1])).toBe(true);
    expect(isShtoshVisit([single1, miss, miss])).toBe(true);
    expect(isShtoshVisit([miss, single1, miss])).toBe(true);
    expect(isShtoshVisit([miss, miss, { segment: 1, multiplier: 2 }])).toBe(
      false
    );
  });

  it("flies each of three quick darts instead of their sum", () => {
    const flyouts = flyoutsForNewThrows(
      [
        { segment: 20, multiplier: 1 },
        { segment: 20, multiplier: 1 },
        { segment: 5, multiplier: 1 },
      ],
      0
    );
    expect(flyouts.filter((f) => f.kind === "score").map((f) => f.points)).toEqual([
      20, 20, 5,
    ]);
  });

  it("flies a miss sticker for every miss, then getdown on the third", () => {
    const flyouts = flyoutsForNewThrows(
      [
        { segment: "miss", multiplier: 1 },
        { segment: "miss", multiplier: 1 },
        { segment: "miss", multiplier: 1 },
      ],
      0,
      { remainingAtStart: 6 }
    );
    expect(flyouts).toEqual([
      { kind: "achievement", id: "miss" },
      { kind: "achievement", id: "miss" },
      { kind: "achievement", id: "stefan-zero" },
      { kind: "achievement", id: "getdown" },
    ]);
  });
});
