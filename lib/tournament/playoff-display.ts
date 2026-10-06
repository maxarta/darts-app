import { generatePlayoffBracket } from "@/lib/tournament/bracket";

export type PlayoffMatchRow = {
  id: string;
  round: number;
  slot: number;
  player1_id: number | null;
  player2_id: number | null;
  game_id: string | null;
  winner_id: number | null;
};

export type DisplayPlayoffMatch = PlayoffMatchRow & {
  isPreview: boolean;
};

export function getPlayoffRoundTitle(
  round: number,
  totalRounds: number
): string {
  if (round === totalRounds) return "Финал";
  // Fixed 4/8 seeded bracket labels
  if (totalRounds === 2 && round === 1) return "Полуфинал";
  if (totalRounds === 3 && round === 2) return "Полуфинал";
  if (totalRounds === 3 && round === 1) return "1/4 финала";
  return `Раунд ${round}`;
}

export function getPlayoffRoundCount(playoffSize: 4 | 8): number {
  return playoffSize === 8 ? 3 : 2;
}

/** Раунды плей-офф без финала (1/4, полуфинал…) */
export function getPlayoffBracketRounds(playoffSize: 4 | 8): number[] {
  const total = getPlayoffRoundCount(playoffSize);
  return Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 1);
}

/** Пустая сетка: все этапы видны, пары без игроков до старта плей-офф */
export function buildEmptyPlayoffSkeleton(
  playoffSize: 4 | 8
): DisplayPlayoffMatch[] {
  return generatePlayoffBracket([], playoffSize).map((s) => ({
    id: `skeleton-${s.round}-${s.slot}`,
    round: s.round,
    slot: s.slot,
    player1_id: s.player1Id,
    player2_id: s.player2Id,
    game_id: null,
    winner_id: null,
    isPreview: true,
  }));
}

/** Сетка плей-офф: из БД или пустой каркас до запуска */
export function buildPlayoffDisplay(
  playoffSize: 4 | 8,
  dbMatches: PlayoffMatchRow[]
): DisplayPlayoffMatch[] {
  if (dbMatches.length > 0) {
    return dbMatches.map((m) => ({ ...m, isPreview: false }));
  }
  return buildEmptyPlayoffSkeleton(playoffSize);
}
