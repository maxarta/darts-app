import { describe, it, expect } from "vitest";
import { getActiveVisitIndex } from "@/lib/darts/visit-index";

describe("getActiveVisitIndex", () => {
  it("returns 0 during first visit in progress", () => {
    expect(getActiveVisitIndex(1, 20)).toBe(0);
    expect(getActiveVisitIndex(2, 60)).toBe(0);
  });

  it("returns completed visit when 3 darts entered and waiting", () => {
    expect(getActiveVisitIndex(3, 180)).toBe(0);
    expect(getActiveVisitIndex(3, 0, true)).toBe(0);
  });

  it("returns next empty visit after endVisit", () => {
    expect(getActiveVisitIndex(3, 0, false)).toBe(1);
  });
});
