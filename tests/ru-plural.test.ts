import { describe, expect, it } from "vitest";
import {
  formatStatsLeaderboardMeta,
  formatStatsPlayerSummary,
  formatVictoryRoundMeta,
  ruGamesCount,
  ruLegsCount,
  ruWinsCount,
} from "@/lib/i18n/ru-plural";

describe("ru plural stats labels", () => {
  it("declines games", () => {
    expect(ruGamesCount(1)).toBe("1 игра");
    expect(ruGamesCount(2)).toBe("2 игры");
    expect(ruGamesCount(5)).toBe("5 игр");
    expect(ruGamesCount(11)).toBe("11 игр");
    expect(ruGamesCount(21)).toBe("21 игра");
    expect(ruGamesCount(22)).toBe("22 игры");
  });

  it("declines wins", () => {
    expect(ruWinsCount(1)).toBe("1 победа");
    expect(ruWinsCount(2)).toBe("2 победы");
    expect(ruWinsCount(5)).toBe("5 побед");
  });

  it("declines legs", () => {
    expect(ruLegsCount(1)).toBe("1 лег");
    expect(ruLegsCount(2)).toBe("2 лега");
    expect(ruLegsCount(5)).toBe("5 легов");
  });

  it("formats leaderboard meta with middle dots", () => {
    expect(formatStatsLeaderboardMeta(2, 1, 3)).toBe(
      "2 игры · 1 победа · 3 лега"
    );
  });

  it("formats player summary", () => {
    expect(formatStatsPlayerSummary(2, 42.5, 1)).toBe(
      "2 игры · PPR 42.5 · 1 победа"
    );
    expect(formatStatsPlayerSummary(2, 42.5, 1, 12)).toBe(
      "2 игры · PPR 42.5 · 1 победа · ср. раунд 12"
    );
  });

  it("formats victory round on game card", () => {
    expect(formatVictoryRoundMeta(7)).toBe("победа · раунд 7");
  });

  it("formats leaderboard meta with avg win round", () => {
    expect(formatStatsLeaderboardMeta(2, 1, 3, 10)).toBe(
      "2 игры · 1 победа · 3 лега · ср. раунд 10"
    );
  });
});
