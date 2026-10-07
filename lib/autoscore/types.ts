import type { ThrowInput } from "@/lib/darts/rules";

/** Board ellipse in normalized video coordinates (0–1). */
export type BoardCalibration = {
  cx: number;
  cy: number;
  /** Outer double-wire radius as fraction of the shorter video side. */
  r: number;
};

export type AutoScorePhase = "off" | "calibrate" | "active";

export type DetectedDart = {
  input: ThrowInput;
  /** Confidence 0–1 from motion blob strength. */
  confidence: number;
  /** Normalized tip position in the video frame. */
  nx: number;
  ny: number;
};
