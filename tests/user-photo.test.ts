import { describe, expect, it } from "vitest";
import {
  decodeDataImageUrl,
  isCustomClubPhoto,
  pickPhotoUrlToStore,
  resolveStoredPhotoUrl,
  shouldPreserveClubDisplayName,
  avatarPath,
} from "@/lib/user-photo";

describe("user photo", () => {
  it("builds avatar proxy path by user id", () => {
    expect(avatarPath(12345)).toBe("/api/avatar/12345");
  });

  it("routes club data-url photos through avatar proxy", () => {
    expect(
      resolveStoredPhotoUrl(1, "data:image/jpeg;base64,QQ==")
    ).toBe("/api/avatar/1");
  });

  it("returns null when photo is missing, normalizes legacy proxy paths", () => {
    expect(resolveStoredPhotoUrl(99, null)).toBeNull();
    expect(resolveStoredPhotoUrl(99, "")).toBeNull();
    expect(resolveStoredPhotoUrl(99, "/api/avatar/99")).toBe("/api/avatar/99");
    expect(resolveStoredPhotoUrl(99, "/api/telegram/avatar/99")).toBe(
      "/api/avatar/99"
    );
  });

  it("keeps existing external url when no incoming photo", () => {
    const existing = "https://example.com/photo.jpg";
    expect(pickPhotoUrlToStore(179793841, undefined, existing)).toBe(existing);
    expect(pickPhotoUrlToStore(179793841, null, existing)).toBe(existing);
  });

  it("normalizes legacy telegram proxy path in db", () => {
    expect(pickPhotoUrlToStore(1, undefined, "/api/telegram/avatar/1")).toBe(
      "/api/avatar/1"
    );
  });

  it("uses proxy when no photo exists", () => {
    expect(pickPhotoUrlToStore(7, undefined, null)).toBe("/api/avatar/7");
  });

  it("never replaces club data-url avatars", () => {
    const club = "data:image/jpeg;base64,/9j/abc";
    expect(isCustomClubPhoto(club)).toBe(true);
    expect(
      pickPhotoUrlToStore(1, "https://example.com/new.jpg", club)
    ).toBe(club);
  });

  it("decodes club data-url photos for the avatar proxy", () => {
    const decoded = decodeDataImageUrl("data:image/jpeg;base64,QQ==");
    expect(decoded?.contentType).toBe("image/jpeg");
    expect(Array.from(decoded!.body)).toEqual([65]);
    expect(decodeDataImageUrl("https://example.com/a.jpg")).toBeNull();
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
