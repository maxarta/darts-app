import { describe, expect, it } from "vitest";
import { resolveTelegramBackPath } from "@/lib/telegram/navigation";

function params(init: Record<string, string>) {
  return new URLSearchParams(init);
}

describe("resolveTelegramBackPath", () => {
  it("hides back on home", () => {
    expect(resolveTelegramBackPath("/", params({}))).toBeNull();
  });

  it("returns home from stats sections", () => {
    expect(
      resolveTelegramBackPath("/stats/players", params({ channelId: "abc" }))
    ).toBe("/?channelId=abc");
  });

  it("returns stats or players list from player profile", () => {
    expect(
      resolveTelegramBackPath(
        "/stats/players/42",
        params({ channelId: "abc", from: "stats" })
      )
    ).toBe("/stats?channelId=abc");
    expect(
      resolveTelegramBackPath("/stats/players/42", params({ channelId: "abc" }))
    ).toBe("/stats/players?channelId=abc");
  });

  it("opens game menu from native back during active game", () => {
    expect(
      resolveTelegramBackPath("/game/xyz", params({ channelId: "abc" }))
    ).toBe("game_menu");
  });
});
