import { throwPoints, type ThrowInput } from "@/lib/darts/rules";
import type { AchievementId } from "./types";

export type VisitAchievementContext = {
  /** Remaining score when the visit started. */
  remainingAtStart?: number;
  /** Double-out. Missing means on, same as the game default. */
  doubleOut?: boolean;
  playerName?: string;
};

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

function isDoubleOut(ctx: VisitAchievementContext): boolean {
  return ctx.doubleOut !== false;
}

/** Осталось D3 (6) и весь подход мимо. */
export function isGetdownVisit(
  throws: ThrowInput[],
  ctx: VisitAchievementContext = {}
): boolean {
  return (
    isDoubleOut(ctx) &&
    ctx.remainingAtStart === 6 &&
    isStefanZeroVisit(throws)
  );
}

/** Осталось D1 (2) и весь подход мимо. */
export function isBitchVisit(
  throws: ThrowInput[],
  ctx: VisitAchievementContext = {}
): boolean {
  return (
    isDoubleOut(ctx) &&
    ctx.remainingAtStart === 2 &&
    isStefanZeroVisit(throws)
  );
}

export function isShtaThrow(throws: ThrowInput[]): boolean {
  return throws.some((t) => isTripleOn(t, 3));
}

export function isHobaThrow(throws: ThrowInput[]): boolean {
  return throws.some((t) => isTripleOn(t, 19));
}

/** 0, 0, 1 в любом порядке: два промаха и одинарная 1. */
export function isShtoshVisit(throws: ThrowInput[]): boolean {
  if (throws.length !== 3) return false;
  const points = throws.map((t) => throwPoints(t)).sort((a, b) => a - b);
  return points[0] === 0 && points[1] === 0 && points[2] === 1;
}

export function isStepanName(name: string | null | undefined): boolean {
  const first = (name ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
  return first === "степан" || first === "stepan" || first === "stephan";
}

/** Первый дротик подхода игрока по имени Степан. */
export function isStephanStart(
  throws: ThrowInput[],
  ctx: VisitAchievementContext = {}
): boolean {
  return throws.length >= 1 && isStepanName(ctx.playerName);
}

/** Порядок показа, если за визит сработало несколько ачивок. */
export const ACHIEVEMENT_DISPLAY_ORDER: AchievementId[] = [
  "bitch",
  "getdown",
  "stefan-zero",
  "stefan",
  "directhit",
  "huzpa-special",
  "huzpa-classic",
  "huzpa-under",
  "shtosh",
  "gagarin",
  "hoba",
  "shta",
  "triple-20",
  "triple-7",
  "triple-1",
  "bull",
  "stephan",
  "miss",
];

/** Чем выше число — тем выше z-index (перекрывает предыдущие). */
export const ACHIEVEMENT_STACK_RANK: Record<AchievementId, number> = {
  miss: 1,
  stephan: 2,
  bull: 3,
  "triple-1": 4,
  shta: 4,
  "triple-20": 5,
  "triple-7": 5,
  hoba: 5,
  gagarin: 6,
  "huzpa-classic": 7,
  shtosh: 7,
  "huzpa-special": 8,
  directhit: 9,
  "huzpa-under": 10,
  stefan: 11,
  "stefan-zero": 12,
  getdown: 13,
  bitch: 14,
};

export function sortAchievementsForStacking(ids: AchievementId[]): AchievementId[] {
  return [...ids].sort(
    (a, b) => ACHIEVEMENT_STACK_RANK[a] - ACHIEVEMENT_STACK_RANK[b]
  );
}

const DETECTORS: {
  id: AchievementId;
  test: (throws: ThrowInput[], ctx: VisitAchievementContext) => boolean;
}[] = [
  { id: "bitch", test: isBitchVisit },
  { id: "getdown", test: isGetdownVisit },
  { id: "stefan-zero", test: isStefanZeroVisit },
  { id: "stefan", test: isStefanVisit },
  { id: "directhit", test: isDirectHitVisit },
  { id: "huzpa-special", test: isHuzpaSpecialVisit },
  { id: "huzpa-classic", test: isHuzpaClassicVisit },
  { id: "huzpa-under", test: isHuzpaUnderVisit },
  { id: "shtosh", test: isShtoshVisit },
  { id: "gagarin", test: isGagarinThrow },
  { id: "hoba", test: isHobaThrow },
  { id: "shta", test: isShtaThrow },
  { id: "triple-20", test: isTriple20Throw },
  { id: "triple-7", test: isTriple7Throw },
  { id: "triple-1", test: isTriple1Throw },
  { id: "bull", test: isBullThrow },
  { id: "stephan", test: isStephanStart },
];

export function detectVisitAchievements(
  throws: ThrowInput[],
  ctx: VisitAchievementContext = {}
): AchievementId[] {
  const found = DETECTORS.filter(({ test }) => test(throws, ctx)).map(
    ({ id }) => id
  );
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

/** Stickers that become true because of the last dart in `throws`. */
export function achievementsUnlockedByThrow(
  throws: ThrowInput[],
  ctx: VisitAchievementContext = {}
): AchievementId[] {
  if (throws.length === 0) return [];
  const before = detectVisitAchievements(throws.slice(0, -1), ctx);
  const after = detectVisitAchievements(throws, ctx);
  const left = new Map<AchievementId, number>();
  for (const id of before) left.set(id, (left.get(id) ?? 0) + 1);
  const novel: AchievementId[] = [];
  for (const id of after) {
    const n = left.get(id) ?? 0;
    if (n > 0) left.set(id, n - 1);
    else novel.push(id);
  }
  if (
    throws.at(-1)?.segment === "miss" &&
    !novel.includes("miss") &&
    !isStefanZeroVisit(throws)
  ) {
    novel.push("miss");
  }
  return sortAchievementsForStacking(novel);
}

export type TvFlyout =
  | { kind: "score"; points: number }
  | { kind: "achievement"; id: AchievementId };

/** One entry per new dart, in throw order: its points, then its stickers. */
export function flyoutsForNewThrows(
  throws: ThrowInput[],
  fromIndex: number,
  ctx: VisitAchievementContext = {}
): TvFlyout[] {
  const out: TvFlyout[] = [];
  for (let i = Math.max(0, fromIndex); i < throws.length; i++) {
    const step = throws.slice(0, i + 1);
    const points = throwPoints(throws[i]);
    if (points > 0) out.push({ kind: "score", points });
    for (const id of achievementsUnlockedByThrow(step, ctx)) {
      out.push({ kind: "achievement", id });
    }
  }
  return out;
}
