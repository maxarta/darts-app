import { DARTBOARD_SEGMENT_ORDER } from "@/lib/game/dartboard-heatmap";

/**
 * Standard clock dartboard colors (Winmau-style).
 * Black / cream single beds alternate by position on the clock (not by segment number).
 * Black single bed → red double & triple ring.
 */
export type SegmentRingColor = "red" | "green";
export type SingleBedTone = "black" | "cream";

function clockIndex(segment: number): number {
  return DARTBOARD_SEGMENT_ORDER.indexOf(
    segment as (typeof DARTBOARD_SEGMENT_ORDER)[number]
  );
}

export function segmentSingleBedTone(segment: number): SingleBedTone {
  const idx = clockIndex(segment);
  if (idx < 0) return "cream";
  return idx % 2 === 0 ? "black" : "cream";
}

export function segmentRingColor(segment: number): SegmentRingColor {
  return segmentSingleBedTone(segment) === "black" ? "red" : "green";
}
