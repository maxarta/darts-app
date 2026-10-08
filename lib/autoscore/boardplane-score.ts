import type { ThrowInput } from "@/lib/darts/rules";
import type { Point2 } from "./homography";

/**
 * Score a tip already mapped into dart-sense board plane
 * (center 0.5,0.5; outer double radius = 170/451).
 * Port of get_scores.py GetScores.score.
 */
const RING = 10;
const BULL_WIRE = 1.6;
const DIAM = 451;

function radii(): number[] {
  // inside radius of DB, SB, S, T, S, D, miss bands (dart-sense)
  const r = [0, 6.35, 15.9, 107.4 - RING, 107.4, 170 - RING, 170];
  r[1]! += BULL_WIRE / 2;
  r[2]! += BULL_WIRE / 2;
  return r.map((x) => x / DIAM);
}

const SCORING_RADII = radii();
const SCORING_NAMES = ["DB", "SB", "S", "T", "S", "D", "miss"] as const;

const SEGMENT_ANGLES = [-9, 9, 27, 45, 63, -81, -63, -45, -27];
const SEGMENT_PAIRS: [number, number][] = [
  [6, 11],
  [10, 14],
  [15, 9],
  [2, 12],
  [17, 5],
  [19, 1],
  [7, 18],
  [16, 4],
  [8, 13],
];

export function scoreFromBoardPlane(p: Point2): ThrowInput {
  let x = p.x;
  let y = p.y;
  if (x === 0.5) x += 1e-5;

  let angle = (Math.atan((y - 0.5) / (x - 0.5)) * 180) / Math.PI;
  angle = angle > 0 ? Math.floor(angle) : Math.ceil(angle);

  let possible: [number, number];
  if (Math.abs(angle) >= 81) {
    possible = [3, 20];
  } else {
    const eligible = SEGMENT_ANGLES.filter((a) => a <= angle);
    const best = Math.max(...eligible);
    const idx = SEGMENT_ANGLES.indexOf(best);
    possible = SEGMENT_PAIRS[idx]!;
  }

  let number: number;
  if (possible[0] === 6 && possible[1] === 11) {
    number = x > 0.5 ? possible[0] : possible[1];
  } else {
    number = y > 0.5 ? possible[0] : possible[1];
  }

  const distance = Math.hypot(x - 0.5, y - 0.5);
  let regionIdx = 0;
  for (let i = 0; i < SCORING_RADII.length; i++) {
    if (distance > SCORING_RADII[i]!) regionIdx = i;
  }
  const region = SCORING_NAMES[regionIdx]!;

  switch (region) {
    case "DB":
      return { segment: "bull50", multiplier: 1 };
    case "SB":
      return { segment: "bull25", multiplier: 1 };
    case "miss":
      return { segment: "miss", multiplier: 1 };
    case "T":
      return { segment: number, multiplier: 3 };
    case "D":
      return { segment: number, multiplier: 2 };
    default:
      return { segment: number, multiplier: 1 };
  }
}
