import { describe, expect, it } from "vitest";
import {
  isCustomClubPhoto,
  pickPhotoUrlToStore,
  resolveStoredPhotoUrl,
  shouldPreserveClubDisplayName,
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

  it("returns null when photo is missing, keeps Telegram proxy paths", () => {
    expect(resolveStoredPhotoUrl(99, null)).toBeNull();
    expect(resolveStoredPhotoUrl(99, "")).toBeNull();
    expect(resolveStoredPhotoUrl(99, "/api/telegram/avatar/99")).toBe(
      "/api/telegram/avatar/99"
    );
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

  it("never replaces club data-url avatars with Telegram photos", () => {
    const club = "data:image/jpeg;base64,/9j/abc";
    expect(isCustomClubPhoto(club)).toBe(true);
    expect(
      pickPhotoUrlToStore(1, "https://t.me/i/userpic/320/new.svg", club)
    ).toBe(club);
  });

  it("preserves renamed club display names", () => {
    expect(
      shouldPreserveClubDisplayName(
        {
          first_name: "Макс",
          username: null,
          photo_url: null,
        },
        "Max"
      )
    ).toBe(true);
    expect(
      shouldPreserveClubDisplayName(
        {
          first_name: "Max",
          username: "max",
          photo_url: null,
        },
        "Max"
      )
    ).toBe(false);
  });
});
