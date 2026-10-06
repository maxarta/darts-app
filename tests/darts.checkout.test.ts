import { describe, expect, it } from "vitest";
import {
  formatCheckoutHint,
  isCheckoutSuggestable,
  suggestCheckout,
} from "@/lib/darts/checkout";

describe("suggestCheckout", () => {
  it("suggests simple doubles", () => {
    expect(suggestCheckout(40)).toEqual(["D20"]);
    expect(suggestCheckout(32)).toEqual(["D16"]);
    expect(suggestCheckout(50)).toEqual(["DB"]);
    expect(suggestCheckout(2)).toEqual(["D1"]);
  });

  it("suggests classic two-dart finishes", () => {
    expect(formatCheckoutHint(100)).toBe("T20 D20");
    expect(formatCheckoutHint(60)).toBe("20 D20");
  });

  it("suggests common three-dart finishes", () => {
    expect(formatCheckoutHint(121)).toBe("T20 T7 D20");
    expect(formatCheckoutHint(81)).toBe("T15 D18");
  });

  it("respects darts left", () => {
    expect(suggestCheckout(100, 1)).toBeNull();
    expect(suggestCheckout(40, 1)).toEqual(["D20"]);
    expect(suggestCheckout(100, 2)).toEqual(["T20", "D20"]);
  });

  it("skips bogeys and out of range", () => {
    expect(isCheckoutSuggestable(169)).toBe(false);
    expect(suggestCheckout(169)).toBeNull();
    expect(suggestCheckout(171)).toBeNull();
    expect(suggestCheckout(1)).toBeNull();
  });
});
