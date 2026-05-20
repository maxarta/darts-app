import { calculatePpr, defaultSettings, type GameSettings } from "@/lib/darts/rules";
import { getFinishedGameWinnerIds } from "@/lib/stats/game-winners";

export type FinishedGameForStats = {
  id: string;
  mode: "301" | "501";
  settings: unknown;
  current_round: number;
  game_players: Array<{
    user_id: number;
    legs_won: number;
    remaining_score: number;
    darts_thrown: number;
  }>;
};

export type PlayerStatsResult = {
  gamesPlayed: number;
  legsWon: number;
  avgPpr: number;
  wins: number;
  /** Средний номер раунда, в котором игрок выиграл матч; null если побед не было. */
  avgWinRound: number | null;
};

function gameSettings(
  mode: "301" | "501",
  raw: unknown
): GameSettings {
  return {
    ...defaultSettings(mode),
    ...(typeof raw === "object" && raw !== null ? raw : {}),
  };
}

export function getGameWinnerIds(game: FinishedGameForStats): Set<number> {
  const settings = gameSettings(game.mode, game.settings);
  const players = game.game_players;
  if (players.length === 0) return new Set();

  const maxLegs = Math.max(...players.map((p) => p.legs_won));
  if (maxLegs < settings.legsToWin) return new Set();

  return getFinishedGameWinnerIds(players, true);
}

export function computePlayerStats(
  userId: number,
  games: FinishedGameForStats[]
): PlayerStatsResult {
  let gamesPlayed = 0;
  let legsWon = 0;
  let totalPpr = 0;
  let pprCount = 0;
  let wins = 0;
  const winRounds: number[] = [];

  for (const game of games) {
    const player = game.game_players.find((p) => p.user_id === userId);
    if (!player) continue;

    gamesPlayed++;
    legsWon += player.legs_won;

    const settings = gameSettings(game.mode, game.settings);
    const ppr = calculatePpr(
      settings.startingScore,
      player.remaining_score,
      player.darts_thrown
    );
    if (player.darts_thrown > 0) {
      totalPpr += ppr;
      pprCount++;
    }

    const winners = getGameWinnerIds(game);
    if (winners.has(userId)) {
      wins++;
      winRounds.push(game.current_round);
    }
  }

  const avgWinRound =
    winRounds.length > 0
      ? Math.round(
          (winRounds.reduce((sum, r) => sum + r, 0) / winRounds.length) * 10
        ) / 10
      : null;

  return {
    gamesPlayed,
    legsWon,
    avgPpr: pprCount ? Math.round((totalPpr / pprCount) * 10) / 10 : 0,
    wins,
    avgWinRound,
  };
}
