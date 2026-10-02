export type Segment = number | "miss" | "bull25" | "bull50";

export type ThrowInput = {
  segment: Segment;
  multiplier: 1 | 2 | 3;
};

export type ScoringRule = "straight" | "double" | "bull";

export type GameSettings = {
  startingScore: 301 | 501;
  doubleOut: boolean;
  legsToWin: number;
  /** Kept for schema compatibility; rounds are unlimited in play. */
  maxRounds: number;
  startRule?: ScoringRule;
  finishRule?: ScoringRule;
};

/** Sentinel stored in settings — rounds never stop by count. */
export const UNLIMITED_ROUNDS = 9999;

export function defaultSettings(mode: 301 | 501 | "301" | "501"): GameSettings {
  const score = typeof mode === "string" ? (Number(mode) as 301 | 501) : mode;
  return {
    startingScore: score,
    doubleOut: true,
    legsToWin: 3,
    maxRounds: UNLIMITED_ROUNDS,
    startRule: "straight",
    finishRule: "double",
  };
}

export function finishRuleToDoubleOut(rule: ScoringRule): boolean {
  return rule !== "straight";
}

export function throwPoints(input: ThrowInput): number {
  if (input.segment === "miss") return 0;
  if (input.segment === "bull25") return input.multiplier === 2 ? 50 : 25;
  if (input.segment === "bull50") return 50;
  return input.segment * input.multiplier;
}

export function isCheckoutThrow(
  remaining: number,
  input: ThrowInput,
  doubleOut: boolean
): boolean {
  const pts = throwPoints(input);
  if (remaining - pts !== 0) return false;
  if (!doubleOut) return true;
  if (input.segment === "bull50") return true;
  if (input.segment === "bull25" && input.multiplier === 2) return true;
  return input.multiplier === 2;
}

export function isBust(
  remaining: number,
  visitThrows: ThrowInput[],
  doubleOut: boolean
): boolean {
  let running = remaining;
  for (const t of visitThrows) {
    const after = running - throwPoints(t);
    if (after < 0) return true;
    if (after === 0) {
      return !isCheckoutThrow(running, t, doubleOut);
    }
    if (after === 1 && doubleOut) return true;
    running = after;
  }
  return false;
}

export type VisitResult = {
  bust: boolean;
  remaining: number;
  visitTotal: number;
  legWon: boolean;
};

export function applyVisit(
  remaining: number,
  visitThrows: ThrowInput[],
  settings: GameSettings
): VisitResult {
  const visitTotal = visitThrows.reduce((s, t) => s + throwPoints(t), 0);
  const bust = isBust(remaining, visitThrows, settings.doubleOut);

  if (bust) {
    return { bust: true, remaining, visitTotal, legWon: false };
  }

  const after = remaining - visitTotal;
  const legWon = after === 0;
  return { bust: false, remaining: after, visitTotal, legWon };
}

export function calculatePpr(
  startingScore: number,
  remaining: number,
  dartsThrown: number
): number {
  if (dartsThrown === 0) return 0;
  const scored = startingScore - remaining;
  return Math.round((scored / (dartsThrown / 3)) * 10) / 10;
}

export const DART_NUMBERS = [
  20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
] as const;
