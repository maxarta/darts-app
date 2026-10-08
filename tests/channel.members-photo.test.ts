import { describe, expect, it } from "vitest";
import { photoFor, type MemberUser } from "@/lib/channel/members";

describe("photoFor", () => {
  it("prefers stored roster photo over session photo", () => {
    const user: MemberUser = {
      first_name: "Max",
      username: null,
      photo_url: "data:image/jpeg;base64,abc",
    };
    const session = {
      id: 1,
      photo_url: "https://example.com/session.jpg",
    };
    expect(photoFor(1, user, session)).toBe("/api/avatar/1");
  });

  it("falls back to session photo when roster has none", () => {
    const user: MemberUser = {
      first_name: "Max",
      username: null,
      photo_url: null,
    };
    const session = {
      id: 1,
      photo_url: "data:image/jpeg;base64,abc",
    };
    expect(photoFor(1, user, session)).toBe("/api/avatar/1");
  });
});
