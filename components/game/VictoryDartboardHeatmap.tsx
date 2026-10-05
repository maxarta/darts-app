"use client";

import { useMemo } from "react";
import {
  BOARD_CX,
  BOARD_CY,
  BOARD_RINGS,
  BOARD_SIZE,
  buildHeatmapRaster,
  heatmapRasterToDataUrl,
  HEATMAP_RASTER_PAD,
  DARTBOARD_SEGMENT_ORDER,
  segmentCenterDegrees,
  VICTORY_BOARD_SCALE,
} from "@/lib/game/dartboard-heatmap";
import type { ThrowInput } from "@/lib/darts/rules";
import {
  segmentRingColor,
  segmentSingleBedTone,
} from "@/lib/darts/board-colors";
import styles from "@/components/dartboard/dartboardHeatmap.module.css";

const SEG_COUNT = 20;
const DEG = 360 / SEG_COUNT;
const R = BOARD_RINGS;
/** Black number ring outside the scoring area (viewBox radius = 100). */
const BOARD_OUTER = BOARD_SIZE / 2;
const NUMBER_RING_OUTER = BOARD_OUTER;
/** Default number-ring thickness (~15 board units). */
const NUMBER_RING_INNER = 85;
/**
 * Rules board: slightly thinner outer shell than the previous 2× ring,
 * so scoring wedges grow. Triple sits at mid-radius; bulls stay proportional.
 */
const RULES_NUMBER_RING_INNER = 78;
const RULES_RINGS = {
  doubleOuter: RULES_NUMBER_RING_INNER,
  doubleInner: 70,
  /** Mid of scoring area = 39; band width matches default ratio. */
  tripleOuter: 43,
  tripleInner: 35,
  singleOuterOuter: 70,
  singleOuterInner: 43,
  singleInnerOuter: 35,
  singleInnerInner: 22,
  /** bull50 : bull25 ≈ same ratio as default 14:22 */
  bull25Outer: 16,
  bull25Inner: 9,
  bull50: 9,
} as const;
/** Viewport padding around the 200×200 board (heatmap raster uses its own pad). */
const VIEW_PAD_FULL = HEATMAP_RASTER_PAD;

type BoardAppearance = "default" | "rules";
type RingSet = {
  doubleOuter: number;
  doubleInner: number;
  tripleOuter: number;
  tripleInner: number;
  singleOuterOuter: number;
  singleOuterInner: number;
  singleInnerOuter: number;
  singleInnerInner: number;
  bull25Outer: number;
  bull25Inner: number;
  bull50: number;
};

function ringsFor(appearance: BoardAppearance): RingSet {
  if (appearance === "rules") return RULES_RINGS;
  const s = VICTORY_BOARD_SCALE;
  return {
    doubleOuter: NUMBER_RING_INNER,
    doubleInner: R.doubleInner * s,
    tripleOuter: R.tripleOuter * s,
    tripleInner: R.tripleInner * s,
    singleOuterOuter: R.singleOuterOuter * s,
    singleOuterInner: R.singleOuterInner * s,
    singleInnerOuter: R.singleInnerOuter * s,
    singleInnerInner: R.singleInnerInner * s,
    bull25Outer: R.bull25Outer * s,
    bull25Inner: R.bull25Inner * s,
    bull50: R.bull50 * s,
  };
}

function numberRingInner(appearance: BoardAppearance): number {
  return appearance === "rules" ? RULES_NUMBER_RING_INNER : NUMBER_RING_INNER;
}

export type RulesHighlightZone = "double" | "triple" | "bull25" | "bull50";

type Props = {
  throws: ThrowInput[];
  className?: string;
  /** Board fills the SVG frame (no extra viewport gutter in layout). */
  tightViewport?: boolean;
  /** Full board color (no heatmap dim) — for rules/legend. */
  fullColor?: boolean;
  /** Hide clock numbers on the ring (draw callouts outside instead). */
  hideSegmentLabels?: boolean;
  /** Light board for rules screen. */
  appearance?: BoardAppearance;
  /** Dim board except this scoring band (rules tutorial). */
  highlightZone?: RulesHighlightZone | null;
};

type SegmentRing = "single" | "double" | "triple";

function polar(cx: number, cy: number, radius: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function wedgePath(
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number
): string {
  const p1 = polar(BOARD_CX, BOARD_CY, rOuter, startDeg);
  const p2 = polar(BOARD_CX, BOARD_CY, rOuter, endDeg);
  const p3 = polar(BOARD_CX, BOARD_CY, rInner, endDeg);
  const p4 = polar(BOARD_CX, BOARD_CY, rInner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

function baseFill(
  segment: number,
  ring: SegmentRing | "bull25" | "bull50",
  appearance: BoardAppearance = "default"
): string {
  if (ring === "bull25") return "#22c55e";
  if (ring === "bull50") return "#ef4444";
  const ringColor = segmentRingColor(segment);
  if (ring === "double" || ring === "triple") {
    return ringColor === "red" ? "#ef4444" : "#22c55e";
  }
  const tone = segmentSingleBedTone(segment);
  if (appearance === "rules") {
    return tone === "black" ? "#e8eaef" : "#ffffff";
  }
  return tone === "black" ? "#232b38" : "#d8d4c8";
}

function buildBaseWedges(
  appearance: BoardAppearance = "default"
): Array<{ key: string; d: string; fill: string }> {
  const items: Array<{ key: string; d: string; fill: string }> = [];
  const rings = ringsFor(appearance);
  const ringInner = numberRingInner(appearance);

  DARTBOARD_SEGMENT_ORDER.forEach((segment, index) => {
    const start = index * DEG - DEG / 2;
    const end = start + DEG;
    const bands: Array<{ ring: SegmentRing; inner: number; outer: number }> = [
      { ring: "double", inner: rings.doubleInner, outer: ringInner },
      { ring: "triple", inner: rings.tripleInner, outer: rings.tripleOuter },
      {
        ring: "single",
        inner: rings.singleOuterInner,
        outer: rings.singleOuterOuter,
      },
      {
        ring: "single",
        inner: rings.singleInnerInner,
        outer: rings.singleInnerOuter,
      },
      {
        ring: "single",
        inner: rings.bull25Outer,
        outer: rings.singleInnerInner,
      },
    ];
    for (const band of bands) {
      items.push({
        key: `${segment}-${band.ring}-${band.inner}`,
        d: wedgePath(band.inner, band.outer, start, end),
        fill: baseFill(segment, band.ring, appearance),
      });
    }
  });

  return items;
}

function buildNumberRingWedges(
  appearance: BoardAppearance
): Array<{ key: string; d: string }> {
  const ringInner = numberRingInner(appearance);
  return DARTBOARD_SEGMENT_ORDER.map((segment, index) => {
    const start = index * DEG - DEG / 2;
    const end = start + DEG;
    return {
      key: `number-ring-${segment}`,
      d: wedgePath(ringInner, NUMBER_RING_OUTER, start, end),
    };
  });
}

function buildSpokeLines(appearance: BoardAppearance) {
  /** Stop at scoring edge so spokes don't slice the number ring. */
  const spokeOuter = numberRingInner(appearance);
  return Array.from({ length: SEG_COUNT }, (_, index) => {
    const deg = index * DEG - DEG / 2;
    const outer = polar(BOARD_CX, BOARD_CY, spokeOuter, deg);
    return { key: `spoke-${index}`, x2: outer.x, y2: outer.y };
  });
}

function buildRingStrokes(appearance: BoardAppearance) {
  const rings = ringsFor(appearance);
  return [
    rings.doubleInner,
    rings.tripleOuter,
    rings.tripleInner,
    rings.singleInnerOuter,
  ];
}

function buildSegmentLabels(appearance: BoardAppearance) {
  const ringInner = numberRingInner(appearance);
  const labelRadius = (ringInner + NUMBER_RING_OUTER) / 2;
  return DARTBOARD_SEGMENT_ORDER.map((segment) => {
    const deg = segmentCenterDegrees(segment);
    const pos = polar(BOARD_CX, BOARD_CY, labelRadius, deg);
    return { segment, x: pos.x, y: pos.y, deg };
  });
}

function wedgeMatchesHighlight(
  wedgeKey: string,
  zone: RulesHighlightZone
): boolean {
  const ring = wedgeKey.split("-")[1];
  if (zone === "double") return ring === "double";
  if (zone === "triple") return ring === "triple";
  return false;
}

const BASE_WEDGES = buildBaseWedges("default");
const RULES_BASE_WEDGES = buildBaseWedges("rules");
const NUMBER_RING_WEDGES = buildNumberRingWedges("default");
const RULES_NUMBER_RING_WEDGES = buildNumberRingWedges("rules");
const SPOKE_LINES = buildSpokeLines("default");
const RULES_SPOKE_LINES = buildSpokeLines("rules");
const RING_STROKES = buildRingStrokes("default");
const RULES_RING_STROKES = buildRingStrokes("rules");
const SEGMENT_LABELS = buildSegmentLabels("default");
const RULES_SEGMENT_LABELS = buildSegmentLabels("rules");

export function VictoryDartboardHeatmap({
  throws,
  className,
  tightViewport = false,
  fullColor = false,
  hideSegmentLabels = false,
  appearance = "default",
  highlightZone = null,
}: Props) {
  const isRules = appearance === "rules";
  const viewPad = isRules ? 0 : VIEW_PAD_FULL;
  const viewSize = BOARD_SIZE + viewPad * 2;
  const wedges = isRules ? RULES_BASE_WEDGES : BASE_WEDGES;
  const numberRingWedges = isRules
    ? RULES_NUMBER_RING_WEDGES
    : NUMBER_RING_WEDGES;
  const spokeLines = isRules ? RULES_SPOKE_LINES : SPOKE_LINES;
  const ringStrokes = isRules ? RULES_RING_STROKES : RING_STROKES;
  const segmentLabels = isRules ? RULES_SEGMENT_LABELS : SEGMENT_LABELS;
  const scoringClip = numberRingInner(appearance);
  const rings = ringsFor(appearance);
  const dimBoard = highlightZone != null;

  const heatUrl = useMemo(() => {
    if (throws.length === 0 || typeof document === "undefined") return null;
    const raster = buildHeatmapRaster(throws, 200, { victory: true });
    if (raster.maxDensity <= 0) return null;
    return { url: heatmapRasterToDataUrl(raster), pad: raster.pad };
  }, [throws]);

  return (
    <div
      className={[
        styles.heatmapWrap,
        tightViewport ? styles.heatmapWrapTight : null,
        fullColor ? styles.heatmapWrapFullColor : null,
        isRules ? styles.heatmapWrapRules : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={throws.length === 0 && !fullColor}
    >
      <svg
        className={styles.heatmapSvg}
        viewBox={`${-viewPad} ${-viewPad} ${viewSize} ${viewSize}`}
        overflow="visible"
        role="img"
        aria-label="Карта бросков"
      >
        <circle
          cx={BOARD_CX}
          cy={BOARD_CY}
          r={NUMBER_RING_OUTER}
          className={styles.heatmapOuterRing}
        />

        <circle
          cx={BOARD_CX}
          cy={BOARD_CY}
          r={scoringClip}
          fill={isRules ? "#eef0f3" : "#141a22"}
        />

        <g className={styles.heatmapBoard}>
          {wedges.map((w) => {
            const lit =
              !dimBoard ||
              (highlightZone != null &&
                wedgeMatchesHighlight(w.key, highlightZone));
            return (
              <path
                key={w.key}
                d={w.d}
                fill={w.fill}
                opacity={lit ? 1 : 0.2}
                className={lit && dimBoard ? styles.heatmapZoneLit : undefined}
              />
            );
          })}
          {numberRingWedges.map((w) => (
            <path
              key={w.key}
              d={w.d}
              fill={isRules ? "#9ca3af" : "#0f1419"}
              className={
                isRules ? styles.heatmapNumberRingRules : styles.heatmapNumberRing
              }
              opacity={dimBoard ? 0.45 : 1}
            />
          ))}
          <circle
            cx={BOARD_CX}
            cy={BOARD_CY}
            r={rings.bull50}
            fill={baseFill(50, "bull50", appearance)}
            opacity={
              !dimBoard || highlightZone === "bull50" || highlightZone == null
                ? 1
                : 0.2
            }
            className={
              dimBoard && highlightZone === "bull50"
                ? styles.heatmapZoneLit
                : undefined
            }
          />
          <circle
            cx={BOARD_CX}
            cy={BOARD_CY}
            r={(rings.bull25Outer + rings.bull25Inner) / 2}
            fill="none"
            stroke="#22c55e"
            strokeWidth={rings.bull25Outer - rings.bull25Inner}
            opacity={
              !dimBoard || highlightZone === "bull25" || highlightZone == null
                ? 1
                : 0.2
            }
            className={
              dimBoard && highlightZone === "bull25"
                ? styles.heatmapZoneLit
                : undefined
            }
          />
        </g>

        <g className={styles.heatmapWires} pointerEvents="none">
          {ringStrokes.map((radius, index) => (
            <circle
              key={`ring-${index}`}
              cx={BOARD_CX}
              cy={BOARD_CY}
              r={radius}
              className={styles.heatmapWire}
            />
          ))}
          {spokeLines.map((line) => (
            <line
              key={line.key}
              x1={BOARD_CX}
              y1={BOARD_CY}
              x2={line.x2}
              y2={line.y2}
              className={styles.heatmapWire}
            />
          ))}
        </g>

        {heatUrl ? (
          <image
            href={heatUrl.url}
            x={-heatUrl.pad}
            y={-heatUrl.pad}
            width={BOARD_SIZE + heatUrl.pad * 2}
            height={BOARD_SIZE + heatUrl.pad * 2}
            className={styles.heatmapLayer}
            preserveAspectRatio="none"
          />
        ) : null}

        {hideSegmentLabels ? null : (
          <g className={styles.heatmapLabels} pointerEvents="none">
            {segmentLabels.map(({ segment, x, y, deg }) => (
              <text
                key={segment}
                x={x}
                y={y}
                className={
                  isRules ? styles.heatmapLabelRules : styles.heatmapLabel
                }
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${deg}, ${x}, ${y})`}
              >
                {segment}
              </text>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
