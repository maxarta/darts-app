import { describe, expect, it } from "vitest";
import {
  isMissingVariantColumnError,
  variantFromTournamentRow,
} from "@/lib/tournament/variant";

describe("variantFromTournamentRow", () => {
  it("reads column variant when present", () => {
    expect(variantFromTournamentRow({ variant: "kenny", settings: {} })).toBe(
      "kenny"
    );
  });

  it("falls back to settings.variant", () => {
    expect(
      variantFromTournamentRow({
        settings: { variant: "kenny", legsToWin: 1 },
      })
    ).toBe("kenny");
  });

  it("defaults to standard", () => {
    expect(variantFromTournamentRow({ settings: { legsToWin: 1 } })).toBe(
      "standard"
    );
  });
});

describe("isMissingVariantColumnError", () => {
  it("detects schema cache variant errors", () => {
    expect(
      isMissingVariantColumnError({
        message:
          "Could not find the 'variant' column of 'tournaments' in the schema cache",
      })
    ).toBe(true);
  });
});
