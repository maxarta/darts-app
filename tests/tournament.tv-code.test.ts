import { describe, expect, it } from "vitest";
import {
  generateTvCode,
  isValidTvCode,
  normalizeTvCode,
  readTvCodeFromSettings,
} from "@/lib/tournament/tv-code";

describe("tv-code", () => {
  it("normalizes to 4 digits", () => {
    expect(normalizeTvCode("12ab34")).toBe("1234");
    expect(isValidTvCode("0421")).toBe(true);
    expect(isValidTvCode("421")).toBe(false);
  });

  it("generates padded codes", () => {
    const code = generateTvCode(() => 0.0001);
    expect(code).toMatch(/^\d{4}$/);
  });

  it("reads from settings", () => {
    expect(readTvCodeFromSettings({ tvCode: "7" })).toBeNull();
    expect(readTvCodeFromSettings({ tvCode: "0042" })).toBe("0042");
    expect(readTvCodeFromSettings({ tvCode: 42 })).toBe("0042");
  });
});
