import type { Point2 } from "./homography";

/** Class ids matching dart-sense weights.pt */
export const YOLO_CLASS = {
  CALIB_20: 0,
  CALIB_3: 1,
  CALIB_11: 2,
  CALIB_6: 3,
  DART: 4,
} as const;

export type YoloDetection = {
  cls: number;
  conf: number;
  /** Center in normalized image coords 0–1. */
  cx: number;
  cy: number;
  w: number;
  h: number;
};

export type YoloDecodeOptions = {
  confThresh?: number;
  calibConfThresh?: number;
  iouThresh?: number;
  /** Model input size (square). */
  imgsz?: number;
};

/**
 * Decode Ultralytics YOLOv8 export output.
 * Supports shapes:
 * - [1, 4+nc, N] (ultralytics export, channels-first)
 * - [1, N, 4+nc] (some converters)
 * Boxes are xywh in letterboxed pixel space of `imgsz`.
 */
export function decodeYoloV8(
  data: Float32Array | number[],
  dims: number[],
  opts: YoloDecodeOptions = {}
): YoloDetection[] {
  const confThresh = opts.confThresh ?? 0.25;
  const calibConf = opts.calibConfThresh ?? 0.55;
  const iouThresh = opts.iouThresh ?? 0.45;
  const imgsz = opts.imgsz ?? 640;

  let rows: number; // anchors
  let attrs: number; // 4 + nc
  let get: (anchor: number, attr: number) => number;

  if (dims.length === 3 && dims[1]! < dims[2]!) {
    // [1, 4+nc, N]
    attrs = dims[1]!;
    rows = dims[2]!;
    get = (a, attr) => data[attr * rows + a]!;
  } else if (dims.length === 3) {
    // [1, N, 4+nc]
    rows = dims[1]!;
    attrs = dims[2]!;
    get = (a, attr) => data[a * attrs + attr]!;
  } else if (dims.length === 2) {
    rows = dims[0]!;
    attrs = dims[1]!;
    get = (a, attr) => data[a * attrs + attr]!;
  } else {
    return [];
  }

  const nc = attrs - 4;
  const raw: YoloDetection[] = [];
  for (let i = 0; i < rows; i++) {
    let bestCls = 0;
    let bestScore = 0;
    for (let c = 0; c < nc; c++) {
      const s = get(i, 4 + c);
      if (s > bestScore) {
        bestScore = s;
        bestCls = c;
      }
    }
    const minConf = bestCls === YOLO_CLASS.DART ? confThresh : calibConf;
    if (bestScore < minConf) continue;
    const cx = get(i, 0) / imgsz;
    const cy = get(i, 1) / imgsz;
    const w = get(i, 2) / imgsz;
    const h = get(i, 3) / imgsz;
    if (cx < 0 || cy < 0 || cx > 1.2 || cy > 1.2) continue;
    raw.push({
      cls: bestCls,
      conf: bestScore,
      cx: Math.min(1, Math.max(0, cx)),
      cy: Math.min(1, Math.max(0, cy)),
      w,
      h,
    });
  }

  return nms(raw, iouThresh);
}

function nms(dets: YoloDetection[], iouThresh: number): YoloDetection[] {
  const byClass = new Map<number, YoloDetection[]>();
  for (const d of dets) {
    const list = byClass.get(d.cls) ?? [];
    list.push(d);
    byClass.set(d.cls, list);
  }
  const out: YoloDetection[] = [];
  for (const [, list] of byClass) {
    list.sort((a, b) => b.conf - a.conf);
    const kept: YoloDetection[] = [];
    for (const d of list) {
      if (kept.every((k) => iou(k, d) < iouThresh)) kept.push(d);
    }
    out.push(...kept);
  }
  return out;
}

function iou(a: YoloDetection, b: YoloDetection) {
  const ax1 = a.cx - a.w / 2;
  const ay1 = a.cy - a.h / 2;
  const ax2 = a.cx + a.w / 2;
  const ay2 = a.cy + a.h / 2;
  const bx1 = b.cx - b.w / 2;
  const by1 = b.cy - b.h / 2;
  const bx2 = b.cx + b.w / 2;
  const by2 = b.cy + b.h / 2;
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

/** Split detections into calib[4] + tip centers. */
export function splitDetections(dets: YoloDetection[]): {
  calib: (Point2 | null)[];
  tips: Point2[];
  tipConf: number[];
} {
  const calib: (Point2 | null)[] = [null, null, null, null];
  const tips: Point2[] = [];
  const tipConf: number[] = [];
  for (const d of dets) {
    if (d.cls >= 0 && d.cls <= 3) {
      const prev = calib[d.cls];
      if (!prev) calib[d.cls] = { x: d.cx, y: d.cy };
      // keep highest conf — already NMS'd per class
    } else if (d.cls === YOLO_CLASS.DART) {
      tips.push({ x: d.cx, y: d.cy });
      tipConf.push(d.conf);
    }
  }
  return { calib, tips, tipConf };
}
