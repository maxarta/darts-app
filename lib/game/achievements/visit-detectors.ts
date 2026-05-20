import type { ThrowInput } from "@/lib/darts/rules";
import type { AchievementId } from "./types";

export const HUZPA_SEGMENTS = [1, 5, 20] as const;

/** Можно показывать на каждый подходящий бросок, не один раз за визит. */
export const REPEATABLE_ACHIEVEMENT_IDS: AchievementId[] = ["miss"];

function isNumberSegment(
  t: ThrowInput
): t is ThrowInput & { segment: number } {
  return typeof t.segment === "number";
}

function isTripleOn(t: ThrowInput, segment: number): boolean {
  return isNumberSegment(t) && t.segment === segment && t.multiplier === 3;
}

function huzpaSegmentsHit(throws: ThrowInput[]): Set<number> {
  const hit = new Set<number>();
  for (const t of throws) {
    if (
      isNumberSegment(t) &&
      (HUZPA_SEGMENTS as readonly number[]).includes(t.segment)
    ) {
      hit.add(t.segment);
    }
  }
  return hit;
}

export function isTriple1Throw(throws: ThrowInput[]): boolean {
  return throws.some((t) => isTripleOn(t, 1));
}

export function isTriple7Throw(throws: ThrowInput[]): boolean {
  return throws.some((t) => isTripleOn(t, 7));
}

export function isTriple20Throw(throws: ThrowInput[]): boolean {
  return throws.some((t) => isTripleOn(t, 20));
}

export function isBullThrow(throws: ThrowInput[]): boolean {
  return throws.some(
    (t) => t.segment === "bull50" || t.segment === "bull25"
  );
}

export function isDirectHitVisit(throws: ThrowInput[]): boolean {
  return throws.filter((t) => isTripleOn(t, 20)).length >= 2;
}

export function isGagarinThrow(throws: ThrowInput[]): boolean {
  return throws.some((t) => isTripleOn(t, 12));
}

/** 1, 5 и 20 за визит — только одинарные по этим секторам. */
export function isHuzpaClassicVisit(throws: ThrowInput[]): boolean {
  if (huzpaSegmentsHit(throws).size !== HUZPA_SEGMENTS.length) return false;
  return throws.every((t) => {
    if (
      !isNumberSegment(t) ||
      !(HUZPA_SEGMENTS as readonly number[]).includes(t.segment)
    ) {
      return true;
    }
    return t.multiplier === 1;
  });
}

/** 1, 5, 20 и хотя бы одно удвоение или утроение по ним. */
export function isHuzpaSpecialVisit(throws: ThrowInput[]): boolean {
  if (huzpaSegmentsHit(throws).size !== HUZPA_SEGMENTS.length) return false;
  return throws.some(
    (t) =>
      isNumberSegment(t) &&
      (HUZPA_SEGMENTS as readonly number[]).includes(t.segment) &&
      (t.multiplier === 2 || t.multiplier === 3)
  );
}

/** Ровно 2 из {1,5,20} и ровно один промах (не другой сектор). */
export function isHuzpaUnderVisit(throws: ThrowInput[]): boolean {
  if (throws.length !== 3) return false;
  const missCount = throws.filter((t) => t.segment === "miss").length;
  if (missCount !== 1) return false;
  return huzpaSegmentsHit(throws).size === 2;
}

export function isMissThrow(throws: ThrowInput[]): boolean {
  return throws.at(-1)?.segment === "miss";
}

export function isStefanVisit(throws: ThrowInput[]): boolean {
  return (
    throws.length === 3 && throws.every((t) => isTripleOn(t, 20))
  );
}

/** Три промаха за визит. */
export function isStefanZeroVisit(throws: ThrowInput[]): boolean {
  return (
    throws.length === 3 && throws.every((t) => t.segment === "miss")
  );
}

/** Порядок показа, если за визит сработало несколько ачивок. */
export const ACHIEVEMENT_DISPLAY_ORDER: AchievementId[] = [
  "stefan-zero",
  "stefan",
  "directhit",
  "huzpa-special",
  "huzpa-classic",
  "huzpa-under",
  "gagarin",
  "triple-20",
  "triple-7",
  "triple-1",
  "bull",
  "miss",
];

/** Чем выше число — тем выше z-index (перекрывает предыдущие). */
export const ACHIEVEMENT_STACK_RANK: Record<AchievementId, number> = {
  miss: 1,
  bull: 2,
  "triple-1": 3,
  "triple-20": 4,
  "triple-7": 4,
  gagarin: 5,
  "huzpa-classic": 6,
  "huzpa-special": 7,
  directhit: 8,
  "huzpa-under": 9,
  stefan: 10,
  "stefan-zero": 11,
};

export function sortAchievementsForStacking(ids: AchievementId[]): AchievementId[] {
  return [...ids].sort(
    (a, b) => ACHIEVEMENT_STACK_RANK[a] - ACHIEVEMENT_STACK_RANK[b]
  );
}

const DETECTORS: { id: AchievementId; test: (throws: ThrowInput[]) => boolean }[] =
  [
    { id: "stefan-zero", test: isStefanZeroVisit },
    { id: "stefan", test: isStefanVisit },
    { id: "directhit", test: isDirectHitVisit },
    { id: "huzpa-special", test: isHuzpaSpecialVisit },
    { id: "huzpa-classic", test: isHuzpaClassicVisit },
    { id: "huzpa-under", test: isHuzpaUnderVisit },
    { id: "gagarin", test: isGagarinThrow },
    { id: "triple-20", test: isTriple20Throw },
    { id: "triple-7", test: isTriple7Throw },
    { id: "triple-1", test: isTriple1Throw },
    { id: "bull", test: isBullThrow },
  ];

export function detectVisitAchievements(throws: ThrowInput[]): AchievementId[] {
  const found = DETECTORS.filter(({ test }) => test(throws)).map(({ id }) => id);
  if (!isStefanZeroVisit(throws) && isMissThrow(throws)) {
    found.push("miss");
  }

  const rank = new Map(
    ACHIEVEMENT_DISPLAY_ORDER.map((id, index) => [id, index])
  );
  return found.sort(
    (a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99)
  );
}
