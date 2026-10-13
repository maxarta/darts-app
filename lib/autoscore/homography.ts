/** 2D point in normalized 0–1 image / board-plane coords. */
export type Point2 = { x: number; y: number };

/**
 * Dart-sense calib targets on board plane (center 0.5,0.5; r_outer = 170/451).
 * Order: class 0=20, 1=3, 2=11, 3=6 [, 5→9, 6→15 optional].
 */
const OUTER_DOUBLE_R = 170 / 451;

function boardplaneCalibTargets(): Point2[] {
  const h = OUTER_DOUBLE_R;
  const a20 = h * Math.cos((81 * Math.PI) / 180);
  const o20 = Math.sqrt(h * h - a20 * a20);
  const a11 = h * Math.cos((-9 * Math.PI) / 180);
  const o11 = Math.sqrt(h * h - a11 * a11);
  const a9 = h * Math.cos((27 * Math.PI) / 180);
  const o9 = Math.sqrt(h * h - a9 * a9);
  return [
    { x: 0.5 - a20, y: 0.5 - o20 }, // 20
    { x: 0.5 + a20, y: 0.5 + o20 }, // 3
    { x: 0.5 - a11, y: 0.5 + o11 }, // 11
    { x: 0.5 + a11, y: 0.5 - o11 }, // 6
    { x: 0.5 - a9, y: 0.5 - o9 }, // 9
    { x: 0.5 + a9, y: 0.5 + o9 }, // 15
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
 * Exact (n=4) or least-squares (n>4) DLT with h22 = 1.
 * Matches OpenCV findHomography on the masked set in get_scores.py.
 */
export function findHomography(src: Point2[], dst: Point2[]): Homography3 | null {
  if (src.length < 4 || src.length !== dst.length) return null;
  const n = src.length;
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < n; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  if (n === 4) {
    const h = solve8(A, b);
    if (!h) return null;
    return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
  }
  // Normal equations (AᵀA) h = Aᵀb
  const AtA: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  const Atb: number[] = Array(8).fill(0);
  for (let r = 0; r < 2 * n; r++) {
    for (let c = 0; c < 8; c++) {
      Atb[c]! += A[r]![c]! * b[r]!;
      for (let k = 0; k < 8; k++) {
        AtA[k]![c]! += A[r]![k]! * A[r]![c]!;
      }
    }
  }
  const h = solve8(AtA, Atb);
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

export function meanReprojectionError(
  H: Homography3,
  src: Point2[],
  dst: Point2[]
): number {
  if (!src.length || src.length !== dst.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    const p = applyHomography(H, src[i]!);
    const d = dst[i]!;
    sum += Math.hypot(p.x - d.x, p.y - d.y);
  }
  return sum / src.length;
}

/** Chord / center sanity for 20–3 and 11–6. */
export function primaryQuartetSane(detected: (Point2 | null)[]): boolean {
  const p0 = detected[0];
  const p1 = detected[1];
  const p2 = detected[2];
  const p3 = detected[3];
  if (!p0 || !p1 || !p2 || !p3) return false;
  const d20_3 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const d11_6 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
  if (d20_3 <= 0.18 || d11_6 <= 0.18) return false;
  const ratio = d20_3 / d11_6;
  if (ratio <= 0.55 || ratio >= 1.85) return false;
  const cx = (p0.x + p1.x + p2.x + p3.x) * 0.25;
  const cy = (p0.y + p1.y + p2.y + p3.y) * 0.25;
  return cx > 0.22 && cx < 0.78 && cy > 0.22 && cy < 0.78;
}

/**
 * Build H: image-normalized → board plane from detected calib.
 * Requires real primary quartet 20/3/11/6; optional 9/15 enter LS.
 * Rejects bad geometry / high reprojection (no synthetic fill).
 */
export function homographyFromCalib(
  detected: (Point2 | null)[],
  opts?: { maxReproj?: number }
): Homography3 | null {
  const maxReproj = opts?.maxReproj ?? 0.03;
  if (!primaryQuartetSane(detected)) return null;
  const src: Point2[] = [];
  const dst: Point2[] = [];
  const n = Math.min(detected.length, BOARDPLANE_CALIB_TARGETS.length);
  for (let i = 0; i < n; i++) {
    const d = detected[i];
    if (!d) continue;
    if (d.x < 0 || d.x > 1 || d.y < 0 || d.y > 1) continue;
    src.push(d);
    dst.push(BOARDPLANE_CALIB_TARGETS[i]!);
  }
  if (src.length < 4) return null;
  const H = findHomography(src, dst);
  if (!H) return null;
  if (meanReprojectionError(H, src, dst) > maxReproj) return null;
  return H;
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
