import { throwPoints, type ThrowInput } from "@/lib/darts/rules";

/** Clock order around a standard dartboard (from top, clockwise). */
export const DARTBOARD_SEGMENT_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const;

export const BOARD_SIZE = 200;
export const BOARD_CX = 100;
export const BOARD_CY = 100;
export const BOARD_RADIUS = 98;

/** Extra board units around raster so KDE splats are not cropped. */
export const HEATMAP_RASTER_PAD = 30;

const SEG_COUNT = 20;
const SEG_DEG = 360 / SEG_COUNT;

/** Standard ring radii in board coordinates (viewBox 0–200). */
export const BOARD_RINGS = {
  doubleOuter: 98,
  doubleInner: 88,
  singleOuterOuter: 88,
  singleOuterInner: 68,
  tripleOuter: 68,
  tripleInner: 60,
  singleInnerOuter: 60,
  singleInnerInner: 38,
  bull25Outer: 22,
  bull25Inner: 14,
  bull50: 14,
} as const;

/** Matches victory overlay wedge scale (scoring area fits r=85). */
export const VICTORY_BOARD_SCALE = 85 / BOARD_RINGS.doubleOuter;

export type HeatmapRing =
  | "single"
  | "double"
  | "triple"
  | "bull25"
  | "bull50";

export type HeatmapCellId =
  | { kind: "segment"; segment: number; ring: HeatmapRing }
  | { kind: "miss" };

export function segmentCenterDegrees(segment: number): number {
  const idx = DARTBOARD_SEGMENT_ORDER.indexOf(
    segment as (typeof DARTBOARD_SEGMENT_ORDER)[number]
  );
  if (idx < 0) return 0;
  return idx * SEG_DEG;
}

export function polarToXY(
  cx: number,
  cy: number,
  radius: number,
  degrees: number
): { x: number; y: number } {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

export function scaleBoardRadius(radius: number): number {
  return radius * VICTORY_BOARD_SCALE;
}

function throwRadius(input: ThrowInput): number {
  const R = BOARD_RINGS;
  if (input.segment === "miss") {
    return R.doubleOuter + 6;
  }
  if (input.segment === "bull25") {
    return (R.bull25Inner + R.bull25Outer) / 2;
  }
  if (input.segment === "bull50") {
    return R.bull50 * 0.55;
  }
  if (input.multiplier === 3) {
    return (R.tripleInner + R.tripleOuter) / 2;
  }
  if (input.multiplier === 2) {
    return (R.doubleInner + R.doubleOuter) / 2;
  }
  const outerMid = (R.singleOuterInner + R.singleOuterOuter) / 2;
  const innerMid = (R.singleInnerInner + R.singleInnerOuter) / 2;
  return (outerMid + innerMid) / 2;
}

function victoryThrowRadius(input: ThrowInput): number {
  return scaleBoardRadius(throwRadius(input));
}

/** Deterministic scatter so stacked hits don't sit on one pixel. */
function scatterOffset(
  dartIndex: number,
  tight = false
): { dx: number; dy: number } {
  const t = dartIndex + 1;
  const angle = ((t * 2654435761) % 6283) / 1000;
  const dist = tight
    ? 0.35 + ((t * 1597334677) % 120) / 200
    : 1.5 + ((t * 1597334677) % 400) / 100;
  return {
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist,
  };
}

export type ThrowBoardPointOptions = {
  /** Align with scaled victory SVG wedges (default false). */
  victory?: boolean;
};

/** Approximate (x, y) on the board for a scored throw. */
export function throwToBoardPoint(
  input: ThrowInput,
  dartIndex = 0,
  options?: ThrowBoardPointOptions
): { x: number; y: number } {
  const victory = options?.victory ?? false;
  const { dx, dy } = scatterOffset(dartIndex, victory);

  if (input.segment === "miss") {
    const missAngle =
      ((dartIndex * 97) % SEG_COUNT) * SEG_DEG + SEG_DEG / 3;
    const missR = victory
      ? scaleBoardRadius(BOARD_RINGS.doubleOuter + 4 + (dartIndex % 3))
      : BOARD_RINGS.doubleOuter + 4 + (dartIndex % 3);
    const p = polarToXY(BOARD_CX, BOARD_CY, missR, missAngle);
    return { x: p.x + dx, y: p.y + dy };
  }

  const degrees =
    input.segment === "bull25" || input.segment === "bull50"
      ? 0
      : segmentCenterDegrees(input.segment);

  const radius = victory ? victoryThrowRadius(input) : throwRadius(input);
  const p = polarToXY(BOARD_CX, BOARD_CY, radius, degrees);
  return { x: p.x + dx, y: p.y + dy };
}

export function throwToHeatmapCell(input: ThrowInput): HeatmapCellId {
  if (input.segment === "miss") return { kind: "miss" };
  if (input.segment === "bull25") {
    return { kind: "segment", segment: 25, ring: "bull25" };
  }
  if (input.segment === "bull50") {
    return { kind: "segment", segment: 50, ring: "bull50" };
  }
  const ring: HeatmapRing =
    input.multiplier === 3
      ? "triple"
      : input.multiplier === 2
        ? "double"
        : "single";
  return { kind: "segment", segment: input.segment, ring };
}

function cellKey(cell: HeatmapCellId): string {
  if (cell.kind === "miss") return "miss";
  return `${cell.ring}-${cell.segment}`;
}

export type HeatmapCellStat = HeatmapCellId & {
  key: string;
  count: number;
  intensity: number;
};

export function buildDartboardHeatmap(throws: ThrowInput[]): {
  cells: HeatmapCellStat[];
  maxCount: number;
  totalDarts: number;
} {
  const counts = new Map<string, { cell: HeatmapCellId; count: number }>();

  for (const t of throws) {
    const cell = throwToHeatmapCell(t);
    const key = cellKey(cell);
    const prev = counts.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(key, { cell, count: 1 });
    }
  }

  let maxCount = 0;
  for (const { count } of counts.values()) {
    if (count > maxCount) maxCount = count;
  }

  const cells: HeatmapCellStat[] = [...counts.values()].map(({ cell, count }) => ({
    ...cell,
    key: cellKey(cell),
    count,
    intensity: maxCount > 0 ? count / maxCount : 0,
  }));

  return { cells, maxCount, totalDarts: throws.length };
}

export function heatmapCellLookup(throws: ThrowInput[]): Map<string, number> {
  const { cells } = buildDartboardHeatmap(throws);
  return new Map(cells.map((c) => [c.key, c.intensity]));
}

export function heatmapCellPoints(throws: ThrowInput[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const t of throws) {
    const key = cellKey(throwToHeatmapCell(t));
    sums.set(key, (sums.get(key) ?? 0) + throwPoints(t));
  }
  return sums;
}

/** Classic heat palette: transparent → blue → cyan → yellow → red. */
export function densityToRgba(
  value: number,
  max: number
): [number, number, number, number] {
  if (max <= 0 || value <= 0) return [0, 0, 0, 0];

  const t = Math.pow(Math.min(1, value / max), 0.65);

  const stops: Array<[number, number, number, number]> = [
    [0, 0, 0, 0],
    [37, 99, 235, 0.45],
    [34, 211, 238, 0.68],
    [250, 204, 21, 0.88],
    [239, 68, 68, 0.98],
  ];

  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    a[3] + (b[3] - a[3]) * f,
  ];
}

function splatDensity(
  grid: Float32Array,
  size: number,
  x: number,
  y: number,
  sigmaPx: number,
  pad: number,
  extent: number
): void {
  const gx = ((x + pad) / extent) * size;
  const gy = ((y + pad) / extent) * size;
  const radius = Math.ceil(sigmaPx * 3);
  const inv2Sigma2 = 1 / (2 * sigmaPx * sigmaPx);

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = Math.round(gx) + dx;
      const py = Math.round(gy) + dy;
      if (px < 0 || px >= size || py < 0 || py >= size) continue;
      const dist2 = (px - gx) ** 2 + (py - gy) ** 2;
      grid[py * size + px] += Math.exp(-dist2 * inv2Sigma2);
    }
  }
}

export type HeatmapRaster = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  maxDensity: number;
  /** Board-space padding included in the raster (0 if none). */
  pad: number;
};

export type BuildHeatmapRasterOptions = {
  victory?: boolean;
  pad?: number;
  sigmaPx?: number;
};

/** Gaussian KDE raster for canvas / SVG overlay. */
export function buildHeatmapRaster(
  throws: ThrowInput[],
  size = 200,
  options?: BuildHeatmapRasterOptions
): HeatmapRaster {
  const victory = options?.victory ?? false;
  const pad = options?.pad ?? (victory ? HEATMAP_RASTER_PAD : 0);
  const extent = BOARD_SIZE + pad * 2;
  const sigmaPx =
    options?.sigmaPx ?? size * (victory ? 0.045 : 0.065);
  const density = new Float32Array(size * size);

  throws.forEach((t, i) => {
    const { x, y } = throwToBoardPoint(t, i, { victory });
    splatDensity(density, size, x, y, sigmaPx, pad, extent);
  });

  let maxDensity = 0;
  for (const v of density) {
    if (v > maxDensity) maxDensity = v;
  }

  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b, a] = densityToRgba(density[i], maxDensity);
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = Math.round(a * 255);
  }

  return { width: size, height: size, data, maxDensity, pad };
}

export function heatmapRasterToDataUrl(raster: HeatmapRaster): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const pixels = new Uint8ClampedArray(raster.data);
  ctx.putImageData(new ImageData(pixels, raster.width, raster.height), 0, 0);
  return canvas.toDataURL("image/png");
}
