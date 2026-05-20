import { describe, expect, it } from "vitest";
import { LANDSCAPE_KEYPAD_GRID } from "@/lib/game/landscape-keypad-grid";

describe("LANDSCAPE_KEYPAD_GRID", () => {
  it("is 5 rows by 12 columns", () => {
    expect(LANDSCAPE_KEYPAD_GRID).toHaveLength(5);
    for (const row of LANDSCAPE_KEYPAD_GRID) {
      expect(row).toHaveLength(12);
    }
  });

  it("maps singles, doubles, triples in row-major bands (Figma)", () => {
    expect(LANDSCAPE_KEYPAD_GRID[0]![0]).toEqual({ segment: 20, multiplier: 1 });
    expect(LANDSCAPE_KEYPAD_GRID[0]![3]).toEqual({ segment: 17, multiplier: 1 });
    expect(LANDSCAPE_KEYPAD_GRID[4]![3]).toEqual({ segment: 1, multiplier: 1 });
    expect(LANDSCAPE_KEYPAD_GRID[0]![4]).toEqual({ segment: 20, multiplier: 2 });
    expect(LANDSCAPE_KEYPAD_GRID[2]![6]).toEqual({ segment: 10, multiplier: 2 });
    expect(LANDSCAPE_KEYPAD_GRID[0]![8]).toEqual({ segment: 20, multiplier: 3 });
    expect(LANDSCAPE_KEYPAD_GRID[4]![11]).toEqual({ segment: 1, multiplier: 3 });
  });
});
