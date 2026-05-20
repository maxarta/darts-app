import type { ThrowInput } from "@/lib/darts/rules";
import type { GameSnapshot } from "@/lib/game/optimistic";

function throwEqual(a: ThrowInput, b: ThrowInput): boolean {
  return a.segment === b.segment && a.multiplier === b.multiplier;
}

/** Сравнивает поля, влияющие на UI счёта — без лишних setState */
export function gameSnapshotEqual(a: GameSnapshot, b: GameSnapshot): boolean {
  if (a.game.status !== b.game.status) return false;
  if (a.game.current_player_index !== b.game.current_player_index) return false;
  if (a.game.current_round !== b.game.current_round) return false;
  if (a.game.current_leg !== b.game.current_leg) return false;

  const prevTournamentId = a.tournamentContext?.tournamentId ?? null;
  const nextTournamentId = b.tournamentContext?.tournamentId ?? null;
  if (prevTournamentId !== nextTournamentId) return false;

  if (a.activeVisitThrows.length !== b.activeVisitThrows.length) return false;
  for (let i = 0; i < a.activeVisitThrows.length; i++) {
    if (!throwEqual(a.activeVisitThrows[i], b.activeVisitThrows[i])) {
      return false;
    }
  }

  if (a.players.length !== b.players.length) return false;
  for (let i = 0; i < a.players.length; i++) {
    const pa = a.players[i];
    const pb = b.players[i];
    if (pa.id !== pb.id) return false;
    if (pa.remaining_score !== pb.remaining_score) return false;
    if (pa.visit_score !== pb.visit_score) return false;
    if (pa.darts_thrown !== pb.darts_thrown) return false;
    if (pa.score_at_visit_start !== pb.score_at_visit_start) return false;
    if (pa.awaiting_visit_end !== pb.awaiting_visit_end) return false;
  }

  return true;
}

function totalDartsThrown(s: GameSnapshot): number {
  return s.players.reduce((sum, p) => sum + p.darts_thrown, 0);
}

/** Ответ /undo: отмена одного броска в текущем визите */
function isUndoThrowResponse(prev: GameSnapshot, next: GameSnapshot): boolean {
  if (
    next.activeVisitThrows.length < prev.activeVisitThrows.length &&
    prev.game.current_player_index === next.game.current_player_index
  ) {
    const idx = next.game.current_player_index;
    const prevP = prev.players.find((p) => p.order_index === idx);
    const nextP = next.players.find((p) => p.order_index === idx);
    if (prevP && nextP && nextP.darts_thrown === prevP.darts_thrown - 1) {
      return true;
    }
  }

  return false;
}

/** Не применять устаревший ответ API (гонка при быстрых бросках / endVisit) */
export function shouldApplyServerSnapshot(
  prev: GameSnapshot,
  next: GameSnapshot,
  options?: { trustUndo?: boolean }
): boolean {
  if (gameSnapshotEqual(prev, next)) return false;
  if (options?.trustUndo) return true;
  if (isUndoThrowResponse(prev, next)) return true;

  const prevDarts = totalDartsThrown(prev);
  const nextDarts = totalDartsThrown(next);
  if (nextDarts < prevDarts) return false;
  if (nextDarts > prevDarts) return true;

  const prevVisit = prev.activeVisitThrows.length;
  const nextVisit = next.activeVisitThrows.length;

  if (prevVisit > 0 && nextVisit === 0) return true;
  if (nextVisit < prevVisit) return false;
  if (nextVisit > prevVisit) {
    if (prev.game.current_player_index !== next.game.current_player_index) {
      return false;
    }
    return true;
  }

  if (prev.game.current_player_index !== next.game.current_player_index) {
    const n = Math.max(prev.players.length, 1);
    const dist =
      (next.game.current_player_index - prev.game.current_player_index + n) %
      n;
    if (dist === 1) return true;
    if (dist === n - 1) return false;
  }

  const idx = next.game.current_player_index;
  const prevP = prev.players.find((p) => p.order_index === idx);
  const nextP = next.players.find((p) => p.order_index === idx);
  if (prevP && nextP && nextP.darts_thrown < prevP.darts_thrown) {
    return false;
  }

  return true;
}
