import { describe, expect, it } from "vitest";
import {
  BOARD_SEGMENTS,
  scoreFromNormalizedPoint,
} from "@/lib/autoscore/board-geometry";
import type { BoardCalibration } from "@/lib/autoscore/types";

const calib: BoardCalibration = { cx: 0.5, cy: 0.5, r: 0.4 };

describe("autoscore board geometry", () => {
  it("has 20 segments starting at 20", () => {
    expect(BOARD_SEGMENTS).toHaveLength(20);
    expect(BOARD_SEGMENTS[0]).toBe(20);
  });

  it("scores bull50 near center", () => {
    expect(scoreFromNormalizedPoint(0.5, 0.5, calib, 1)).toEqual({
      segment: "bull50",
      multiplier: 1,
    });
  });

  it("scores miss outside the board", () => {
    expect(scoreFromNormalizedPoint(0.05, 0.05, calib, 1)).toEqual({
      segment: "miss",
      multiplier: 1,
    });
  });

  it("scores single 20 near the top of the board", () => {
    // Just inside outer single, top of circle
    const hit = scoreFromNormalizedPoint(0.5, 0.5 - 0.4 * 0.5, calib, 1);
    expect(hit.segment).toBe(20);
    expect(hit.multiplier).toBe(1);
  });

  it("scores double near the outer ring at top", () => {
    const hit = scoreFromNormalizedPoint(0.5, 0.5 - 0.4 * 0.97, calib, 1);
    expect(hit.segment).toBe(20);
    expect(hit.multiplier).toBe(2);
  });
});
