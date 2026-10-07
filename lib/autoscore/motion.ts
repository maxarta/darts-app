import { scoreFromNormalizedPoint } from "./board-geometry";
import type { BoardCalibration, DetectedDart } from "./types";

export type MotionDetectorOptions = {
  /** Diff threshold 0–255. */
  threshold?: number;
  /** Min changed pixels inside the board (downsampled). */
  minPixels?: number;
  /** Ignore detections for this many ms after a hit. */
  cooldownMs?: number;
};

/**
 * Frame-diff dart tip detector inside a calibrated board circle.
 * Downsamples to keep CPU low on phone browsers.
 */
export class DartMotionDetector {
  private prev: Uint8ClampedArray | null = null;
  private prevW = 0;
  private prevH = 0;
  private lastHitAt = 0;
  private readonly threshold: number;
  private readonly minPixels: number;
  private readonly cooldownMs: number;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(opts: MotionDetectorOptions = {}) {
    this.threshold = opts.threshold ?? 28;
    this.minPixels = opts.minPixels ?? 18;
    this.cooldownMs = opts.cooldownMs ?? 1400;
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
  }

  reset() {
    this.prev = null;
    this.lastHitAt = 0;
  }

  /**
   * Analyze one video frame. Returns a detection or null.
   * Call ~8–12 times per second.
   */
  analyze(
    video: HTMLVideoElement,
    calib: BoardCalibration
  ): DetectedDart | null {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw < 16 || vh < 16) return null;

    const scale = Math.min(1, 160 / Math.max(vw, vh));
    const w = Math.max(8, Math.round(vw * scale));
    const h = Math.max(8, Math.round(vh * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.prev = null;
    }

    this.ctx.drawImage(video, 0, 0, w, h);
    const { data } = this.ctx.getImageData(0, 0, w, h);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) | 0;
    }

    if (!this.prev || this.prevW !== w || this.prevH !== h) {
      this.prev = gray;
      this.prevW = w;
      this.prevH = h;
      return null;
    }

    const now = performance.now();
    if (now - this.lastHitAt < this.cooldownMs) {
      this.prev = gray;
      return null;
    }

    const aspect = vw / vh;
    const rPx = calib.r * Math.min(w, h);
    const cx = calib.cx * w;
    const cy = calib.cy * h;
    const r2 = (rPx * 1.05) ** 2;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let energy = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const idx = y * w + x;
        const d = Math.abs(gray[idx]! - this.prev[idx]!);
        if (d < this.threshold) continue;
        sumX += x * d;
        sumY += y * d;
        energy += d;
        count++;
      }
    }

    this.prev = gray;

    if (count < this.minPixels) return null;

    const tipX = sumX / energy;
    const tipY = sumY / energy;
    const nx = tipX / w;
    const ny = tipY / h;
    const input = scoreFromNormalizedPoint(nx, ny, calib, aspect);
    const confidence = Math.min(1, count / (this.minPixels * 6));

    this.lastHitAt = now;
    return { input, confidence, nx, ny };
  }
}
