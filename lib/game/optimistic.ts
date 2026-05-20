import {
  applyVisit,
  calculatePpr,
  defaultSettings,
  throwPoints,
  type GameSettings,
  type ThrowInput,
} from "@/lib/darts/rules";
import { getActiveVisitIndex } from "@/lib/darts/visit-index";
import type { GameTournamentContext } from "@/lib/tournament/game-context";

const MISS_THROW: ThrowInput = { segment: "miss", multiplier: 1 };

type PlayerRow = {
  id: string;
  user_id: number;
  order_index: number;
  remaining_score: number;
  visit_score: number;
  darts_thrown: number;
  score_at_visit_start: number;
  awaiting_visit_end: boolean;
  legs_won: number;
  ppr?: number;
  users?: { first_name: string; username: string | null };
};

type GameRow = {
  id: string;
  channel_id: string;
  mode: "301" | "501";
  status: string;
  current_player_index: number;
  current_round: number;
  current_leg: number;
  settings: {
    startingScore: number;
    maxRounds: number;
    legsToWin?: number;
    doubleOut?: boolean;
  };
};

export type GameSnapshot = {
  game: GameRow;
  players: PlayerRow[];
  activeVisitThrows: ThrowInput[];
  tournamentContext?: GameTournamentContext | null;
};

export function settingsFor(game: GameRow): GameSettings {
  const base = defaultSettings(game.mode);
  return {
    ...base,
    ...game.settings,
    startingScore: game.settings.startingScore as 301 | 501,
    doubleOut: game.settings.doubleOut ?? base.doubleOut,
    legsToWin: game.settings.legsToWin ?? base.legsToWin,
  };
}

export function optimisticThrow(
  data: GameSnapshot,
  input: ThrowInput
): GameSnapshot | null {
  if (data.game.status !== "active") return null;
  if (data.activeVisitThrows.length >= 3) return null;
  const activeForLock = data.players.find(
    (p) => p.order_index === data.game.current_player_index
  );
  if (activeForLock?.awaiting_visit_end) return null;

  const settings = settingsFor(data.game);
  const activeIdx = data.game.current_player_index;
  const newThrows = [...data.activeVisitThrows, input];
  const visitTotal = newThrows.reduce((s, t) => s + throwPoints(t), 0);
  const active = data.players.find((p) => p.order_index === activeIdx);
  if (!active) return null;

  const visitResult = applyVisit(
    active.score_at_visit_start,
    newThrows,
    settings
  );
  const bust = visitResult.bust;
  const checkoutWon = visitResult.legWon;

  const players = data.players.map((p) => {
    if (p.order_index !== activeIdx) return p;
    const dartsThrown = p.darts_thrown + 1;
    const remaining = bust
      ? p.score_at_visit_start
      : p.score_at_visit_start - visitTotal;
    return {
      ...p,
      visit_score: bust ? 0 : visitTotal,
      darts_thrown: dartsThrown,
      awaiting_visit_end:
        checkoutWon || (dartsThrown > 0 && dartsThrown % 3 === 0),
      remaining_score: remaining,
      ppr:
        dartsThrown > 0
          ? Math.round(
              ((settings.startingScore - remaining) / (dartsThrown / 3)) * 10
            ) / 10
          : 0,
    };
  });

  return { ...data, players, activeVisitThrows: newThrows };
}

export function optimisticUndo(data: GameSnapshot): GameSnapshot | null {
  if (data.game.status !== "active") return null;
  if (data.activeVisitThrows.length === 0) return null;

  const settings = settingsFor(data.game);
  const activeIdx = data.game.current_player_index;
  const newThrows = data.activeVisitThrows.slice(0, -1);
  const visitTotal = newThrows.reduce((s, t) => s + throwPoints(t), 0);
  const active = data.players.find((p) => p.order_index === activeIdx);
  if (!active) return null;

  const players = data.players.map((p) => {
    if (p.order_index !== activeIdx) return p;
    const dartsThrown = Math.max(0, p.darts_thrown - 1);
    const remaining = p.score_at_visit_start - visitTotal;
    return {
      ...p,
      visit_score: visitTotal,
      darts_thrown: dartsThrown,
      awaiting_visit_end: dartsThrown > 0 && dartsThrown % 3 === 0,
      remaining_score: remaining,
      ppr:
        dartsThrown > 0
          ? Math.round(
              ((settings.startingScore - remaining) / (dartsThrown / 3)) * 10
            ) / 10
          : 0,
    };
  });

  return { ...data, players, activeVisitThrows: newThrows };
}

/** Мгновенное завершение визита и переход к следующему игроку (как endVisit на сервере) */
export function optimisticEndVisit(data: GameSnapshot): GameSnapshot | null {
  if (data.game.status !== "active") return null;

  const settings = settingsFor(data.game);
  const activeIdx = data.game.current_player_index;
  const active = data.players.find((p) => p.order_index === activeIdx);
  if (!active) return null;

  const visitThrows = [...data.activeVisitThrows];
  while (visitThrows.length < 3) {
    visitThrows.push(MISS_THROW);
  }

  const visitIndex = getActiveVisitIndex(
    active.darts_thrown,
    active.visit_score,
    active.awaiting_visit_end
  );
  const visitStartDarts = visitIndex * 3;
  const result = applyVisit(
    active.score_at_visit_start,
    visitThrows,
    settings
  );

  let legsWon = active.legs_won;
  let remaining = result.bust
    ? active.score_at_visit_start
    : result.remaining;
  if (result.legWon) {
    legsWon += 1;
  }

  const matchWon = result.legWon && legsWon >= settings.legsToWin;
  if (result.legWon && !matchWon) {
    remaining = settings.startingScore;
  }

  const playerCount = data.players.length;
  const nextPlayerIndex = (activeIdx + 1) % playerCount;
  let nextRound = data.game.current_round;
  let nextLeg = data.game.current_leg;
  let status = data.game.status;

  if (matchWon) {
    status = "finished";
  } else if (nextPlayerIndex === 0) {
    nextRound += 1;
  }
  if (result.legWon && status !== "finished") {
    nextRound = 1;
    nextLeg += 1;
  }

  const finalizedDarts = visitStartDarts + 3;
  const players = data.players.map((p) => {
    if (p.order_index === activeIdx) {
      return {
        ...p,
        remaining_score: remaining,
        legs_won: legsWon,
        visit_score: 0,
        score_at_visit_start: remaining,
        darts_thrown: finalizedDarts,
        awaiting_visit_end: false,
        ppr: calculatePpr(
          settings.startingScore,
          remaining,
          finalizedDarts
        ),
      };
    }
    if (result.legWon && status !== "finished") {
      return {
        ...p,
        remaining_score: settings.startingScore,
        score_at_visit_start: settings.startingScore,
        visit_score: 0,
        awaiting_visit_end: false,
      };
    }
    return p;
  });

  return {
    ...data,
    game: {
      ...data.game,
      status,
      current_player_index:
        status === "finished" ? activeIdx : nextPlayerIndex,
      current_round: nextRound,
      current_leg: nextLeg,
    },
    players,
    activeVisitThrows: [],
  };
}
