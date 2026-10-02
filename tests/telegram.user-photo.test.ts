import { describe, expect, it } from "vitest";
import {
  pickPhotoUrlToStore,
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

  it("returns null when photo is missing (no Telegram proxy fallback)", () => {
    expect(resolveStoredPhotoUrl(99, null)).toBeNull();
    expect(resolveStoredPhotoUrl(99, "")).toBeNull();
    expect(resolveStoredPhotoUrl(99, "/api/telegram/avatar/99")).toBeNull();
  });

  it("keeps existing t.me url when initData has no photo", () => {
    const existing = "https://t.me/i/userpic/320/abc.svg";
    expect(pickPhotoUrlToStore(179793841, undefined, existing)).toBe(existing);
    expect(pickPhotoUrlToStore(179793841, null, existing)).toBe(existing);
  });

  it("prefers initData photo over proxy path in db", () => {
    const init = "https://t.me/i/userpic/320/new.svg";
    expect(
      pickPhotoUrlToStore(1, init, "/api/telegram/avatar/1")
    ).toBe(init);
  });

  it("uses proxy only when no public url exists", () => {
    expect(pickPhotoUrlToStore(7, undefined, null)).toBe(
      "/api/telegram/avatar/7"
    );
  });
});
