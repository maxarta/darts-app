/** 2D point in normalized 0–1 image / board-plane coords. */
export type Point2 = { x: number; y: number };

/**
 * Dart-sense calib targets on board plane (center 0.5,0.5; r_outer = 170/451).
 * Order: class 0=20, 1=3, 2=11, 3=6.
 */
const OUTER_DOUBLE_R = 170 / 451;

function boardplaneCalibTargets(): Point2[] {
  const h = OUTER_DOUBLE_R;
  const a20 = h * Math.cos((81 * Math.PI) / 180);
  const o20 = Math.sqrt(h * h - a20 * a20);
  const a11 = h * Math.cos((-9 * Math.PI) / 180);
  const o11 = Math.sqrt(h * h - a11 * a11);
  return [
    { x: 0.5 - a20, y: 0.5 - o20 }, // 20
    { x: 0.5 + a20, y: 0.5 + o20 }, // 3
    { x: 0.5 - a11, y: 0.5 + o11 }, // 11
    { x: 0.5 + a11, y: 0.5 - o11 }, // 6
  ];
}

export const BOARDPLANE_CALIB_TARGETS = boardplaneCalibTargets();

/** 3×3 row-major homography. */
export type Homography3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Homography from exactly 4 point correspondences (src → dst), h22 = 1.
 * Uses Gaussian elimination on the 8×8 system.
 */
export function findHomography(src: Point2[], dst: Point2[]): Homography3 | null {
  if (src.length < 4 || dst.length < 4) return null;
  // Use first 4
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    // x h00 + y h01 + h02 + 0 + 0 + 0 - u x h20 - u y h21 = u
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve8(A, b);
  if (!h) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography(H: Homography3, p: Point2): Point2 {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-12) return { x: p.x, y: p.y };
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

/**
 * Build H: image-normalized → board plane from detected calib (classes 0..3).
 * Needs all 4 of 20/3/11/6.
 */
export function homographyFromCalib(
  detected: (Point2 | null)[]
): Homography3 | null {
  const src: Point2[] = [];
  const dst: Point2[] = [];
  for (let i = 0; i < 4; i++) {
    const d = detected[i];
    if (!d) return null;
    if (d.x < 0 || d.x > 1 || d.y < 0 || d.y > 1) return null;
    src.push(d);
    dst.push(BOARDPLANE_CALIB_TARGETS[i]!);
  }
  return findHomography(src, dst);
}

function solve8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(M[pivot]![col]!) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }
    const div = M[col]![col]!;
    for (let c = col; c <= n; c++) M[col]![c]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}
