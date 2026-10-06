import { describe, expect, it } from "vitest";
import {
  allocateManualPlayerId,
  assertPhotoUrl,
  isManualPlayerId,
} from "@/lib/channel/manual-players";

describe("manual players", () => {
  it("marks negative ids as manual", () => {
    expect(isManualPlayerId(-1)).toBe(true);
    expect(isManualPlayerId(179793841)).toBe(false);
  });

  it("allocates unique negative ids", () => {
    const a = allocateManualPlayerId();
    const b = allocateManualPlayerId();
    expect(a).toBeLessThan(0);
    expect(b).toBeLessThan(0);
    expect(a).not.toBe(b);
  });

  it("accepts data urls and rejects junk", () => {
    expect(assertPhotoUrl("data:image/jpeg;base64,abc")).toBe(
      "data:image/jpeg;base64,abc"
    );
    expect(assertPhotoUrl(null)).toBe(null);
    expect(() => assertPhotoUrl("javascript:alert(1)")).toThrow();
  });

  it("rejects oversized data urls", async () => {
    const { MAX_PHOTO_DATA_URL_CHARS } = await import(
      "@/lib/channel/player-photo"
    );
    const huge = `data:image/jpeg;base64,${"a".repeat(MAX_PHOTO_DATA_URL_CHARS)}`;
    expect(() => assertPhotoUrl(huge)).toThrow(/слишком большое/);
  });
});