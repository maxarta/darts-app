import type { ThrowInput } from "./rules";
import { throwPoints } from "./rules";

/** Подпись броска как в макете (T-20, D16, 20, B50, МИМО) */
export function formatThrowLabel(input: ThrowInput): string {
  if (input.segment === "miss") return "МИМО";
  if (input.segment === "bull25") {
    return input.multiplier === 2 ? "DB" : "B25";
  }
  if (input.segment === "bull50") return "B50";
  if (input.multiplier === 3) return `T-${input.segment}`;
  if (input.multiplier === 2) return `D-${input.segment}`;
  return String(input.segment);
}

export function visitThrowSummary(throws: ThrowInput[]) {
  return throws.map((t) => ({
    label: formatThrowLabel(t),
    points: throwPoints(t),
  }));
}
