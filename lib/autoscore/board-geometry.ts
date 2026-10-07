import type { ThrowInput } from "@/lib/darts/rules";
import type { BoardCalibration } from "./types";

/**
 * Standard steel-tip board radii (mm from center) / outer double (170 mm).
 * Source: WDF / PDC board specification.
 */
const R_DB = 6.35 / 170;
const R_SB = 15.9 / 170;
const R_TRIPLE_IN = 99 / 170;
const R_TRIPLE_OUT = 107 / 170;
const R_DOUBLE_IN = 162 / 170;

/** Clockwise from top (20). */
export const BOARD_SEGMENTS = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const;

/**
 * Map a tip in normalized video coords to a dart score using board calibration.
 * `nx`/`ny` are 0–1 relative to the video frame. Calibration `r` is the outer
 * double radius as a fraction of min(videoWidth, videoHeight).
 * `videoAspect` is width/height.
 */
export function scoreFromNormalizedPoint(
  nx: number,
  ny: number,
  calib: BoardCalibration,
  videoAspect = 1
): ThrowInput {
  const W = Math.max(videoAspect, 0.01);
  const H = 1;
  const rPx = calib.r * Math.min(W, H);
  const dx = (nx - calib.cx) * W;
  const dy = (ny - calib.cy) * H;
  const dist = Math.hypot(dx, dy) / Math.max(rPx, 1e-6);

  if (dist > 1.08) {
    return { segment: "miss", multiplier: 1 };
  }

  // 0 rad = top (20), clockwise
  let angle = Math.atan2(dx, -dy);
  if (angle < 0) angle += Math.PI * 2;
  const wedge = (Math.PI * 2) / 20;
  const idx = Math.floor(((angle + wedge / 2) % (Math.PI * 2)) / wedge);
  const segment = BOARD_SEGMENTS[((idx % 20) + 20) % 20]!;

  if (dist <= R_DB) return { segment: "bull50", multiplier: 1 };
  if (dist <= R_SB) return { segment: "bull25", multiplier: 1 };
  if (dist >= R_TRIPLE_IN && dist < R_TRIPLE_OUT) {
    return { segment, multiplier: 3 };
  }
  if (dist >= R_DOUBLE_IN && dist <= 1.05) {
    return { segment, multiplier: 2 };
  }
  return { segment, multiplier: 1 };
}
