import { describe, expect, it } from "vitest";
import {
  BOARD_CY,
  BOARD_RINGS,
  HEATMAP_RASTER_PAD,
  buildDartboardHeatmap,
  buildHeatmapRaster,
  densityToRgba,
  scaleBoardRadius,
  throwToBoardPoint,
  throwToHeatmapCell,
} from "@/lib/game/dartboard-heatmap";
import type { ThrowInput } from "@/lib/darts/rules";

describe("dartboard heatmap", () => {
  it("maps throws to segment cells", () => {
    expect(throwToHeatmapCell({ segment: 20, multiplier: 3 })).toEqual({
      kind: "segment",
      segment: 20,
      ring: "triple",
    });
    expect(throwToHeatmapCell({ segment: "bull25", multiplier: 1 })).toEqual({
      kind: "segment",
      segment: 25,
      ring: "bull25",
    });
    expect(throwToHeatmapCell({ segment: "miss", multiplier: 1 })).toEqual({
      kind: "miss",
    });
  });

  it("aggregates counts and intensity", () => {
    const throws: ThrowInput[] = [
      { segment: 20, multiplier: 3 },
      { segment: 20, multiplier: 3 },
      { segment: 5, multiplier: 1 },
    ];
    const { cells, maxCount, totalDarts } = buildDartboardHeatmap(throws);

    expect(totalDarts).toBe(3);
    expect(maxCount).toBe(2);
    const t20 = cells.find((c) => c.key === "triple-20");
    expect(t20?.count).toBe(2);
    expect(t20?.intensity).toBe(1);
  });

  it("places triple 20 near the top of the board", () => {
    const { y } = throwToBoardPoint({ segment: 20, multiplier: 3 }, 0);
    expect(y).toBeLessThan(BOARD_CY);
  });

  it("aligns victory double 20 with scaled wedge geometry", () => {
    const { y } = throwToBoardPoint(
      { segment: 20, multiplier: 2 },
      0,
      { victory: true }
    );
    const doubleMid = scaleBoardRadius(
      (BOARD_RINGS.doubleInner + BOARD_RINGS.doubleOuter) / 2
    );
    expect(y).toBeCloseTo(BOARD_CY - doubleMid, 0);
  });

  it("builds a KDE raster with hot pixels for clustered throws", () => {
    const throws: ThrowInput[] = Array.from({ length: 6 }, () => ({
      segment: 20 as const,
      multiplier: 3 as const,
    }));
    const raster = buildHeatmapRaster(throws, 120, { victory: true });
    expect(raster.maxDensity).toBeGreaterThan(0);

    const { x, y } = throwToBoardPoint(
      { segment: 20, multiplier: 3 },
      0,
      { victory: true }
    );
    const extent = 200 + HEATMAP_RASTER_PAD * 2;
    const px = Math.round(((x + HEATMAP_RASTER_PAD) / extent) * 120);
    const py = Math.round(((y + HEATMAP_RASTER_PAD) / extent) * 120);
    const idx = (py * 120 + px) * 4 + 3;
    expect(raster.data[idx]).toBeGreaterThan(40);
  });

  it("maps density through a multi-stop color scale", () => {
    expect(densityToRgba(0, 1)[3]).toBe(0);
    expect(densityToRgba(1, 1)[0]).toBeGreaterThan(200);
  });
});
