import { describe, expect, it } from "vitest";
import {
  resolveStoredPhotoUrl,
  telegramAvatarPath,
} from "@/lib/telegram/user-photo";

describe("telegram user photo", () => {
  it("builds proxy path by telegram id", () => {
    expect(telegramAvatarPath(12345)).toBe("/api/telegram/avatar/12345");
  });

  it("prefers stored public url", () => {
    expect(
      resolveStoredPhotoUrl(1, "https://t.me/i/userpic/320/abc.jpg")
    ).toBe("https://t.me/i/userpic/320/abc.jpg");
  });

  it("falls back to proxy when photo is missing", () => {
    expect(resolveStoredPhotoUrl(99, null)).toBe("/api/telegram/avatar/99");
    expect(resolveStoredPhotoUrl(99, "")).toBe("/api/telegram/avatar/99");
  });
});
