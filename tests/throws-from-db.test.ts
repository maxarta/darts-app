import { describe, expect, it } from "vitest";
import {
  segmentFromDb,
  segmentToDb,
  throwsFromDbRows,
} from "@/lib/game/throws-from-db";

describe("throws-from-db", () => {
  it("maps DB segments to ThrowInput", () => {
    expect(segmentFromDb("miss", 1)).toEqual({
      segment: "miss",
      multiplier: 1,
    });
    expect(segmentFromDb("bull25", 2)).toEqual({
      segment: "bull25",
      multiplier: 2,
    });
    expect(segmentFromDb("bull50", 1)).toEqual({
      segment: "bull50",
      multiplier: 1,
    });
    expect(segmentFromDb("20", 3)).toEqual({ segment: 20, multiplier: 3 });
  });

  it("maps ThrowInput segments to DB strings", () => {
    expect(segmentToDb(20)).toBe("20");
    expect(segmentToDb("bull25")).toBe("bull25");
  });

  it("converts throw rows in order", () => {
    const throws = throwsFromDbRows([
      { segment: "20", multiplier: 3 },
      { segment: "miss", multiplier: 1 },
    ]);
    expect(throws).toEqual([
      { segment: 20, multiplier: 3 },
      { segment: "miss", multiplier: 1 },
    ]);
  });
});
