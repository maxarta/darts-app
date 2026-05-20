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

  it("falls back to proxy when photo is missing", () => {
    expect(resolveStoredPhotoUrl(99, null)).toBe("/api/telegram/avatar/99");
    expect(resolveStoredPhotoUrl(99, "")).toBe("/api/telegram/avatar/99");
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
