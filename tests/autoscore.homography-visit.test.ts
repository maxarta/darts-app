import { describe, expect, it } from "vitest";
import {
  applyHomography,
  BOARDPLANE_CALIB_TARGETS,
  findHomography,
  homographyFromCalib,
} from "@/lib/autoscore/homography";
import { scoreFromBoardPlane } from "@/lib/autoscore/boardplane-score";
import { VisitFsm } from "@/lib/autoscore/visit-fsm";

describe("homography", () => {
  it("maps identity calib to board targets", () => {
    const H = homographyFromCalib(BOARDPLANE_CALIB_TARGETS);
    expect(H).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(H!, BOARDPLANE_CALIB_TARGETS[i]!);
      expect(p.x).toBeCloseTo(BOARDPLANE_CALIB_TARGETS[i]!.x, 5);
      expect(p.y).toBeCloseTo(BOARDPLANE_CALIB_TARGETS[i]!.y, 5);
    }
  });

  it("maps a simple translation", () => {
    const src = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    const dst = src.map((p) => ({ x: p.x + 0.05, y: p.y - 0.02 }));
    const H = findHomography(src, dst)!;
    const p = applyHomography(H, { x: 0.5, y: 0.5 });
    expect(p.x).toBeCloseTo(0.55, 4);
    expect(p.y).toBeCloseTo(0.48, 4);
  });
});

describe("boardplane score", () => {
  it("scores DB at center", () => {
    expect(scoreFromBoardPlane({ x: 0.5, y: 0.5 })).toEqual({
      segment: "bull50",
      multiplier: 1,
    });
  });

  it("scores single 20 near top", () => {
    // above center, inside single
    const hit = scoreFromBoardPlane({ x: 0.5, y: 0.5 - 0.2 });
    expect(hit.segment).toBe(20);
    expect(hit.multiplier).toBe(1);
  });
});

describe("visit fsm", () => {
  it("locks calib then scores confirmed tip then clears", () => {
    const fsm = new VisitFsm({
      calibLockFrames: 3,
      confirmFrames: 2,
      clearFrames: 2,
    });
    expect(fsm.pushBoardTips([], { calibLocked: true }).some((e) => e.type === "ready")).toBe(
      false
    );
    fsm.pushBoardTips([], { calibLocked: true });
    const ready = fsm.pushBoardTips([], { calibLocked: true });
    expect(ready.some((e) => e.type === "ready")).toBe(true);

    const tip = { x: 0.5, y: 0.3 };
    expect(fsm.pushBoardTips([tip]).some((e) => e.type === "score")).toBe(false);
    const scored = fsm.pushBoardTips([tip]);
    expect(scored.some((e) => e.type === "score")).toBe(true);

    // fill visit
    const t2 = { x: 0.4, y: 0.4 };
    const t3 = { x: 0.6, y: 0.4 };
    fsm.pushBoardTips([tip, t2]);
    fsm.pushBoardTips([tip, t2]);
    fsm.pushBoardTips([tip, t2, t3]);
    const wait = fsm.pushBoardTips([tip, t2, t3]);
    expect(wait.some((e) => e.type === "waitRemoval")).toBe(true);

    fsm.pushBoardTips([]);
    const cleared = fsm.pushBoardTips([]);
    expect(cleared.some((e) => e.type === "boardCleared")).toBe(true);
  });
});
