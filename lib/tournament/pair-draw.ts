import { shuffleInPlace } from "@/lib/tournament/bracket";

export type PairDrawResult = {
  /** Playing pairs for this round. */
  pairs: Array<[number, number]>;
  /** Odd player(s) who skip the round and advance automatically. */
  byes: number[];
};

/**
 * Random pairing for knockout rounds. One bye when the field is odd.
 */
export function drawRandomPairs(
  playerIds: number[],
  random: () => number = Math.random
): PairDrawResult {
  const unique = [...new Set(playerIds.filter((id) => Number.isFinite(id)))];
  const shuffled = shuffleInPlace(unique, random);
  const byes: number[] = [];
  let pool = shuffled;

  if (pool.length % 2 === 1) {
    byes.push(pool[pool.length - 1]!);
    pool = pool.slice(0, -1);
  }

  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < pool.length; i += 2) {
    pairs.push([pool[i]!, pool[i + 1]!]);
  }

  return { pairs, byes };
}

export function isPairKnockoutFormat(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  return (settings as { format?: unknown }).format === "pair_ko";
}
