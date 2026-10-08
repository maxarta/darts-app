import type { ThrowInput } from "@/lib/darts/rules";
import type { Homography3, Point2 } from "./homography";
import { scoreFromBoardPlane } from "./boardplane-score";

export type VisitPhase = "calibrating" | "listen" | "waitClear";

export type VisitEvent =
  | { type: "calibProgress"; locked: number; need: number }
  | { type: "ready" }
  | { type: "score"; input: ThrowInput; board: Point2; confidence: number }
  | { type: "waitRemoval" }
  | { type: "boardCleared" };

export type VisitFsmOptions = {
  maxDarts?: number;
  confirmFrames?: number;
  tipMatchEps?: number;
  clearFrames?: number;
  calibLockFrames?: number;
};

type PendingTip = {
  board: Point2;
  hits: number;
  confSum: number;
};

/**
 * Visit FSM: calibrate → listen (score up to 3) → wait tips gone → boardCleared.
 * Tips must already be in board-plane coordinates.
 */
export class VisitFsm {
  private phase: VisitPhase = "calibrating";
  private calibStreak = 0;
  private H: Homography3 | null = null;
  private committed: Point2[] = [];
  private pending: PendingTip[] = [];
  private clearStreak = 0;
  private readonly maxDarts: number;
  private readonly confirmFrames: number;
  private readonly tipMatchEps: number;
  private readonly clearFrames: number;
  private readonly calibLockFrames: number;

  constructor(opts: VisitFsmOptions = {}) {
    this.maxDarts = opts.maxDarts ?? 3;
    this.confirmFrames = opts.confirmFrames ?? 3;
    this.tipMatchEps = opts.tipMatchEps ?? 0.02;
    this.clearFrames = opts.clearFrames ?? 8;
    this.calibLockFrames = opts.calibLockFrames ?? 10;
  }

  getPhase(): VisitPhase {
    return this.phase;
  }

  reset() {
    this.phase = "calibrating";
    this.calibStreak = 0;
    this.H = null;
    this.committed = [];
    this.pending = [];
    this.clearStreak = 0;
  }

  beginWaitClear(): VisitEvent[] {
    if (this.phase === "waitClear") return [];
    this.phase = "waitClear";
    this.clearStreak = 0;
    this.pending = [];
    return [{ type: "waitRemoval" }];
  }

  setHomography(H: Homography3 | null) {
    this.H = H;
  }

  getHomography() {
    return this.H;
  }

  pushBoardTips(
    boardTips: Point2[],
    opts: { calibLocked: boolean; tipConf?: number[] } = { calibLocked: true }
  ): VisitEvent[] {
    const events: VisitEvent[] = [];

    if (this.phase === "calibrating") {
      if (opts.calibLocked) {
        this.calibStreak++;
        events.push({
          type: "calibProgress",
          locked: Math.min(this.calibStreak, this.calibLockFrames),
          need: this.calibLockFrames,
        });
        if (this.calibStreak >= this.calibLockFrames) {
          this.phase = "listen";
          events.push({ type: "ready" });
        }
      } else {
        this.calibStreak = 0;
        events.push({
          type: "calibProgress",
          locked: 0,
          need: this.calibLockFrames,
        });
      }
      return events;
    }

    if (this.phase === "waitClear") {
      if (boardTips.length === 0) {
        this.clearStreak++;
        if (this.clearStreak >= this.clearFrames) {
          this.committed = [];
          this.pending = [];
          this.clearStreak = 0;
          this.phase = "listen";
          events.push({ type: "boardCleared" });
        }
      } else {
        this.clearStreak = 0;
      }
      return events;
    }

    // listen — update pending from visible tips
    const stillPending: PendingTip[] = [];
    for (const tip of boardTips) {
      if (this.committed.some((c) => dist(c, tip) < this.tipMatchEps)) continue;

      let pend = this.pending.find((p) => dist(p.board, tip) < this.tipMatchEps);
      if (!pend) {
        pend = { board: tip, hits: 0, confSum: 0 };
      }
      pend.hits++;
      pend.board = {
        x: (pend.board.x * (pend.hits - 1) + tip.x) / pend.hits,
        y: (pend.board.y * (pend.hits - 1) + tip.y) / pend.hits,
      };
      const idx = boardTips.indexOf(tip);
      pend.confSum += opts.tipConf?.[idx] ?? 0.8;
      stillPending.push(pend);
    }
    this.pending = stillPending;

    for (const p of [...this.pending]) {
      if (p.hits < this.confirmFrames) continue;
      if (this.committed.length >= this.maxDarts) break;
      if (this.committed.some((c) => dist(c, p.board) < this.tipMatchEps)) {
        continue;
      }

      this.committed.push(p.board);
      this.pending = this.pending.filter((x) => x !== p);
      events.push({
        type: "score",
        input: scoreFromBoardPlane(p.board),
        board: p.board,
        confidence: Math.min(1, p.confSum / p.hits),
      });
    }

    if (this.committed.length >= this.maxDarts) {
      this.phase = "waitClear";
      this.clearStreak = 0;
      this.pending = [];
      events.push({ type: "waitRemoval" });
    }

    return events;
  }
}

function dist(a: Point2, b: Point2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
