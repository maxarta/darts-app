import { describe, expect, it } from "vitest";
import {
  gameIdsWithMinPlayers,
  isMultiplayerGame,
} from "@/lib/game/multiplayer";

describe("isMultiplayerGame", () => {
  it("requires at least 2 players", () => {
    expect(isMultiplayerGame([])).toBe(false);
    expect(isMultiplayerGame([{ id: 1 }])).toBe(false);
    expect(isMultiplayerGame([{ id: 1 }, { id: 2 }])).toBe(true);
  });
});

describe("gameIdsWithMinPlayers", () => {
  it("returns only games with enough players", () => {
    const ids = gameIdsWithMinPlayers([
      { game_id: "a" },
      { game_id: "a" },
      { game_id: "b" },
    ]);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(false);
  });
});
