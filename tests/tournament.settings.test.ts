import { describe, it, expect } from "vitest";
import {
  gameSettingsForTournament,
  normalizeLegsToWin,
  parseTournamentSettings,
} from "@/lib/tournament/settings";

describe("tournament settings", () => {
  it("defaults to 2 legs to win (pair knockout)", () => {
    expect(parseTournamentSettings(null)).toEqual({ legsToWin: 2 });
    expect(parseTournamentSettings({})).toEqual({ legsToWin: 2 });
  });

  it("reads legsToWin from stored settings", () => {
    expect(parseTournamentSettings({ legsToWin: 1 })).toEqual({
      legsToWin: 1,
    });
    expect(parseTournamentSettings({ legsToWin: 2, format: "pair_ko" })).toEqual({
      legsToWin: 2,
      format: "pair_ko",
    });
  });

  it("normalizes legsToWin input", () => {
    expect(normalizeLegsToWin(2)).toBe(2);
    expect(normalizeLegsToWin(1)).toBe(1);
    expect(normalizeLegsToWin(3)).toBe(2);
  });

  it("applies legsToWin to game settings", () => {
    expect(gameSettingsForTournament("501", { legsToWin: 2 }).legsToWin).toBe(2);
  });

  it("final match always uses 2 legs to win", () => {
    expect(
      gameSettingsForTournament("501", { legsToWin: 1 }, { final: true })
        .legsToWin
    ).toBe(2);
  });
});
