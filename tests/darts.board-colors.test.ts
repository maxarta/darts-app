import { describe, expect, it } from "vitest";
import {
  segmentRingColor,
  segmentSingleBedTone,
} from "@/lib/darts/board-colors";

describe("dartboard segment colors", () => {
  it("maps black-bed numbers to red rings", () => {
    for (const n of [20, 18, 13, 10, 2, 3, 7, 8, 14, 12]) {
      expect(segmentRingColor(n)).toBe("red");
      expect(segmentSingleBedTone(n)).toBe("black");
    }
  });

  it("maps cream-bed numbers to green rings", () => {
    for (const n of [1, 4, 6, 15, 17, 19, 16, 11, 9, 5]) {
      expect(segmentRingColor(n)).toBe("green");
      expect(segmentSingleBedTone(n)).toBe("cream");
    }
  });
});
