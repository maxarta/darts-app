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
/** ~15 units — 3× the previous 5-unit band. */
const NUMBER_RING_INNER = 85;
const SCORING_CLIP = NUMBER_RING_INNER;
const SCORING_SCALE = VICTORY_BOARD_SCALE;
/** Viewport padding around the 200×200 board (heatmap raster uses its own pad). */
const VIEW_PAD_FULL = HEATMAP_RASTER_PAD;

function sr(value: number): number {
  return value * SCORING_SCALE;
}

type Props = {
  throws: ThrowInput[];
  className?: string;
  /** Board fills the SVG frame (no extra viewport gutter in layout). */
  tightViewport?: boolean;
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
  ring: SegmentRing | "bull25" | "bull50"
): string {
  if (ring === "bull25") return "#22c55e";
  if (ring === "bull50") return "#ef4444";
  const ringColor = segmentRingColor(segment);
  if (ring === "double" || ring === "triple") {
    return ringColor === "red" ? "#ef4444" : "#22c55e";
  }
  const tone = segmentSingleBedTone(segment);
  return tone === "black" ? "#232b38" : "#d8d4c8";
}

function buildBaseWedges(): Array<{ key: string; d: string; fill: string }> {
  const items: Array<{ key: string; d: string; fill: string }> = [];

  DARTBOARD_SEGMENT_ORDER.forEach((segment, index) => {
    const start = index * DEG - DEG / 2;
    const end = start + DEG;
    const bands: Array<{ ring: SegmentRing; inner: number; outer: number }> = [
      { ring: "double", inner: sr(R.doubleInner), outer: NUMBER_RING_INNER },
      { ring: "triple", inner: sr(R.tripleInner), outer: sr(R.tripleOuter) },
      {
        ring: "single",
        inner: sr(R.singleOuterInner),
        outer: sr(R.singleOuterOuter),
      },
      {
        ring: "single",
        inner: sr(R.singleInnerInner),
        outer: sr(R.singleInnerOuter),
      },
      {
        ring: "single",
        inner: sr(R.bull25Outer),
        outer: sr(R.singleInnerInner),
      },
    ];
    for (const band of bands) {
      items.push({
        key: `${segment}-${band.ring}-${band.inner}`,
        d: wedgePath(band.inner, band.outer, start, end),
        fill: baseFill(segment, band.ring),
      });
    }
  });

  return items;
}

function buildNumberRingWedges(): Array<{ key: string; d: string }> {
  return DARTBOARD_SEGMENT_ORDER.map((segment, index) => {
    const start = index * DEG - DEG / 2;
    const end = start + DEG;
    return {
      key: `number-ring-${segment}`,
      d: wedgePath(NUMBER_RING_INNER, NUMBER_RING_OUTER, start, end),
    };
  });
}

const BASE_WEDGES = buildBaseWedges();
const NUMBER_RING_WEDGES = buildNumberRingWedges();

const SPOKE_LINES = Array.from({ length: SEG_COUNT }, (_, index) => {
  const deg = index * DEG - DEG / 2;
  const outer = polar(BOARD_CX, BOARD_CY, NUMBER_RING_OUTER, deg);
  return { key: `spoke-${index}`, x2: outer.x, y2: outer.y };
});

const RING_STROKES = [
  sr(R.doubleInner),
  sr(R.tripleOuter),
  sr(R.tripleInner),
  sr(R.singleInnerOuter),
];

const LABEL_RADIUS = (NUMBER_RING_INNER + NUMBER_RING_OUTER) / 2;

const SEGMENT_LABELS = DARTBOARD_SEGMENT_ORDER.map((segment) => {
  const deg = segmentCenterDegrees(segment);
  const pos = polar(BOARD_CX, BOARD_CY, LABEL_RADIUS, deg);
  return { segment, x: pos.x, y: pos.y, deg };
});

export function VictoryDartboardHeatmap({
  throws,
  className,
  tightViewport = false,
}: Props) {
  const viewPad = VIEW_PAD_FULL;
  const viewSize = BOARD_SIZE + viewPad * 2;

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
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={throws.length === 0}
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

        <circle cx={BOARD_CX} cy={BOARD_CY} r={SCORING_CLIP} fill="#141a22" />

        <g className={styles.heatmapBoard}>
          {BASE_WEDGES.map((w) => (
            <path key={w.key} d={w.d} fill={w.fill} />
          ))}
          {NUMBER_RING_WEDGES.map((w) => (
            <path
              key={w.key}
              d={w.d}
              fill="#0f1419"
              className={styles.heatmapNumberRing}
            />
          ))}
          <circle
            cx={BOARD_CX}
            cy={BOARD_CY}
            r={sr(R.bull50)}
            fill={baseFill(50, "bull50")}
          />
          <circle
            cx={BOARD_CX}
            cy={BOARD_CY}
            r={(sr(R.bull25Outer) + sr(R.bull25Inner)) / 2}
            fill="none"
            stroke="#22c55e"
            strokeWidth={sr(R.bull25Outer) - sr(R.bull25Inner)}
          />
        </g>

        <g className={styles.heatmapWires} pointerEvents="none">
          {RING_STROKES.map((radius) => (
            <circle
              key={radius}
              cx={BOARD_CX}
              cy={BOARD_CY}
              r={radius}
              className={styles.heatmapWire}
            />
          ))}
          {SPOKE_LINES.map((line) => (
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

        <g className={styles.heatmapLabels} pointerEvents="none">
          {SEGMENT_LABELS.map(({ segment, x, y, deg }) => (
            <text
              key={segment}
              x={x}
              y={y}
              className={styles.heatmapLabel}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${deg}, ${x}, ${y})`}
            >
              {segment}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
