import { describe, expect, it } from "vitest";
import { createLocalGameRecord } from "@/lib/game/local/actions";
import { buildVictoryStats, getVictoryWinnerIndex } from "@/lib/game/victory-stats";
import type { GameSnapshot } from "@/lib/game/optimistic";
import type { LocalGameMeta, LocalGameRecord } from "@/lib/game/local/types";

function snapshot(overrides?: Partial<GameSnapshot["game"]>): GameSnapshot {
  return {
    game: {
      id: "g1",
      channel_id: "ch",
      mode: "501",
      status: "finished",
      current_player_index: 1,
      current_round: 1,
      current_leg: 1,
      settings: {
        startingScore: 501,
        maxRounds: 20,
        legsToWin: 2,
        doubleOut: true,
      },
      ...overrides,
    },
    players: [
      {
        id: "p0",
        user_id: 1,
        order_index: 0,
        remaining_score: 501,
        visit_score: 0,
        darts_thrown: 30,
        score_at_visit_start: 501,
        awaiting_visit_end: false,
        legs_won: 1,
        ppr: 40,
        users: { first_name: "Alice", username: "alice" },
      },
      {
        id: "p1",
        user_id: 2,
        order_index: 1,
        remaining_score: 0,
        visit_score: 0,
        darts_thrown: 28,
        score_at_visit_start: 32,
        awaiting_visit_end: false,
        legs_won: 2,
        ppr: 52.5,
        users: { first_name: "Bob", username: null },
      },
    ],
    activeVisitThrows: [],
  };
}

const meta: LocalGameMeta = {
  channelId: "ch",
  mode: "501",
  settings: snapshot().game.settings,
  playerIds: [1, 2],
  players: [
    {
      userId: 1,
      firstName: "Alice",
      username: "alice",
      photoUrl: "https://example.com/alice.jpg",
    },
    { userId: 2, firstName: "Bob", username: null, photoUrl: null },
  ],
  createdBy: 1,
  tournamentMatchId: null,
  tournamentMatchType: null,
};

function recordWithEvents(): LocalGameRecord {
  let record = createLocalGameRecord({ id: "g1", meta });
  record = {
    ...record,
    snapshot: snapshot(),
  };
  return record;
}

describe("victory stats", () => {
  it("picks winner by legs won", () => {
    const stats = buildVictoryStats(snapshot());
    expect(getVictoryWinnerIndex(snapshot())).toBe(1);
    expect(stats.find((p) => p.isWinner)?.name).toBe("BOB");
    expect(stats.find((p) => p.userId === 1)?.ppr).toBe(40);
  });

  it("maps remaining score, photos, and empty throws without record", () => {
    const stats = buildVictoryStats(snapshot());
    const alice = stats.find((p) => p.userId === 1)!;
    const bob = stats.find((p) => p.userId === 2)!;

    expect(alice.remainingScore).toBe(501);
    expect(bob.remainingScore).toBe(0);
    // Without a local record there is no stored photo — proxy paths are not invented.
    expect(alice.photoUrl).toBeNull();
    expect(bob.photoUrl).toBeNull();
    expect(alice.throws).toEqual([]);
    expect(bob.throws).toEqual([]);
    expect(stats.every((p) => !("mode" in p))).toBe(true);
  });

  it("enriches stats from local record meta and events", () => {
    let record = recordWithEvents();
    record = {
      ...record,
      events: [
        { type: "throw", input: { segment: 20, multiplier: 3 } },
        { type: "throw", input: { segment: 20, multiplier: 1 } },
        { type: "throw", input: { segment: 5, multiplier: 1 } },
        { type: "endVisit" },
      ],
    };

    const stats = buildVictoryStats(record.snapshot, record);
    const alice = stats.find((p) => p.userId === 1)!;

    expect(alice.photoUrl).toBe("https://example.com/alice.jpg");
    expect(alice.throws).toEqual([
      { segment: 20, multiplier: 3 },
      { segment: 20, multiplier: 1 },
      { segment: 5, multiplier: 1 },
    ]);
    expect(stats.find((p) => p.userId === 2)?.throws).toEqual([]);
  });
});
