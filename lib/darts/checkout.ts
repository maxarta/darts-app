/** Preferred double-out checkout routes (PDC-style). */

const BOGEY = new Set([169, 168, 166, 165, 163, 162, 159]);

type DartOpt = {
  label: string;
  points: number;
  /** Only these can finish a double-out leg. */
  finishes: boolean;
};

function buildOptions(): DartOpt[] {
  const opts: DartOpt[] = [];
  // Prefer high trebles / doubles first when searching.
  for (let n = 20; n >= 1; n--) {
    opts.push({ label: `T${n}`, points: n * 3, finishes: false });
  }
  opts.push({ label: "DB", points: 50, finishes: true });
  opts.push({ label: "25", points: 25, finishes: false });
  for (let n = 20; n >= 1; n--) {
    opts.push({ label: `D${n}`, points: n * 2, finishes: true });
  }
  for (let n = 20; n >= 1; n--) {
    opts.push({ label: String(n), points: n, finishes: false });
  }
  return opts;
}

const DARTS = buildOptions();

type ScoredRoute = { labels: string[]; score: number };

function routeScore(labels: string[]): number {
  // Prefer fewer darts, treble/single setup, finish on a strong double.
  let score = labels.length * 1000;
  const finish = labels[labels.length - 1] ?? "";
  if (finish === "D20") score -= 50;
  else if (finish === "DB") score -= 45;
  else if (finish === "D16" || finish === "D18") score -= 30;
  else if (finish === "D10" || finish === "D8" || finish === "D12") score -= 20;
  else if (finish.startsWith("D")) score -= 10;

  for (let i = 0; i < labels.length - 1; i++) {
    const lab = labels[i]!;
    if (lab === "T20") score -= 35;
    else if (lab.startsWith("T")) score -= 25;
    else if (lab.startsWith("D") || lab === "DB") score += 50; // avoid double as setup
    else if (lab === "20" || lab === "19" || lab === "18") score -= 15;
    else score -= 5;
  }
  return score;
}

const memo = new Map<string, ScoredRoute | null>();

function search(remaining: number, dartsLeft: number): ScoredRoute | null {
  if (remaining === 0) return { labels: [], score: 0 };
  if (dartsLeft <= 0 || remaining < 0) return null;
  if (remaining === 1) return null; // can't leave/finish on 1 with double-out
  if (remaining > 170) return null;

  const key = `${remaining}:${dartsLeft}`;
  if (memo.has(key)) return memo.get(key)!;

  let best: ScoredRoute | null = null;

  for (const dart of DARTS) {
    if (dart.points > remaining) continue;
    const after = remaining - dart.points;

    if (after === 0) {
      if (!dart.finishes) continue;
      const labels = [dart.label];
      const scored = { labels, score: routeScore(labels) };
      if (!best || scored.score < best.score) best = scored;
      continue;
    }

    if (dartsLeft === 1) continue;
    if (after === 1) continue;

    const rest = search(after, dartsLeft - 1);
    if (!rest) continue;
    const labels = [dart.label, ...rest.labels];
    const scored = { labels, score: routeScore(labels) };
    if (!best || scored.score < best.score) best = scored;
  }

  memo.set(key, best);
  return best;
}

/** True when remaining is in the 3-dart double-out window (excl. bogeys). */
export function isCheckoutSuggestable(remaining: number): boolean {
  return (
    Number.isFinite(remaining) &&
    remaining >= 2 &&
    remaining <= 170 &&
    !BOGEY.has(remaining)
  );
}

/**
 * Preferred double-out checkout labels for the current remaining score.
 * @param dartsLeft darts still available in this visit (1–3)
 */
export function suggestCheckout(
  remaining: number,
  dartsLeft = 3
): string[] | null {
  if (!isCheckoutSuggestable(remaining)) return null;
  const left = Math.min(3, Math.max(1, Math.floor(dartsLeft)));
  const found = search(remaining, left);
  if (!found || found.labels.length === 0) return null;
  return found.labels;
}

/** Compact hint: "T20 D20" */
export function formatCheckoutHint(
  remaining: number,
  dartsLeft = 3
): string | null {
  const route = suggestCheckout(remaining, dartsLeft);
  if (!route) return null;
  return route.join(" ");
}
