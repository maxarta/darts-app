import type { ThrowInput } from "@/lib/darts/rules";

export function segmentFromDb(segment: string, multiplier: number): ThrowInput {
  if (segment === "miss") return { segment: "miss", multiplier: 1 };
  if (segment === "bull25")
    return { segment: "bull25", multiplier: multiplier === 2 ? 2 : 1 };
  if (segment === "bull50") return { segment: "bull50", multiplier: 1 };
  return {
    segment: Number(segment),
    multiplier: multiplier as 1 | 2 | 3,
  };
}

export function segmentToDb(segment: ThrowInput["segment"]): string {
  if (typeof segment === "number") return String(segment);
  return segment;
}

export type DbThrowRow = {
  segment: string;
  multiplier: number;
};

export function throwsFromDbRows(rows: ReadonlyArray<DbThrowRow>): ThrowInput[] {
  return rows.map((t) => segmentFromDb(t.segment, t.multiplier));
}
