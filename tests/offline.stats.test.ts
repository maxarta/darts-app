import { describe, expect, it } from "vitest";
import type { ArchiveGameRow } from "@/components/stats/gameArchiveModel";
import type { LocalGameRecord } from "@/lib/game/local/types";
import {
  computeStatsFromLocalRecords,
  localRecordToArchiveRow,
  localRecordToFinishedGame,
  mergeArchiveGames,
  mergePlayerStats,
} from "@/lib/stats/local-from-record";

function finishedRecord(
  overrides: Partial<LocalGameRecord> & { id: string }
): LocalGameRecord {
  return {
    id: overrides.id,
    serverId: overrides.serverId ?? null,
    meta: overrides.meta ?? {
      channelId: "ch1",
      mode: "501",
      settings: {
        startingScore: 501,
        maxRounds: 20,
        legsToWin: 1,
        doubleOut: true,
      },
      playerIds: [1, 2],
      players: [
        { userId: 1, firstName: "A", username: null, photoUrl: null },
        { userId: 2, firstName: "B", username: null, photoUrl: null },
      ],
      createdBy: 1,
      tournamentMatchId: null,
      tournamentMatchType: null,
    },
    events: overrides.events ?? [],
    snapshot: overrides.snapshot ?? {
      game: {
        id: overrides.id,
        channel_id: "ch1",
        mode: "501",
        status: "finished",
        current_round: 5,
        current_leg: 1,
        current_player_index: 0,
        settings: {
          startingScore: 501,
          maxRounds: 20,
          legsToWin: 1,
          doubleOut: true,
        },
      },
      players: [
        {
          id: `${overrides.id}-p0`,
          user_id: 1,
          order_index: 0,
          legs_won: 1,
          remaining_score: 0,
          darts_thrown: 9,
          visit_score: 0,
          score_at_visit_start: 0,
          awaiting_visit_end: false,
        },
        {
          id: `${overrides.id}-p1`,
          user_id: 2,
          order_index: 1,
          legs_won: 0,
          remaining_score: 401,
          darts_thrown: 9,
          visit_score: 0,
          score_at_visit_start: 401,
          awaiting_visit_end: false,
        },
      ],
      activeVisitThrows: [],
    },
    tournamentContext: null,
    syncStatus: overrides.syncStatus ?? "local",
    syncError: null,
    createdAt: overrides.createdAt ?? 1_700_000_000_000,
    updatedAt: overrides.updatedAt ?? 1_700_000_000_000,
  };
}

describe("local stats from records", () => {
  it("converts finished multiplayer local games", () => {
    const record = finishedRecord({ id: "local-1" });
    const finished = localRecordToFinishedGame(record);
    expect(finished?.game_players).toHaveLength(2);
    expect(computeStatsFromLocalRecords(1, [record])).toMatchObject({
      gamesPlayed: 1,
      wins: 1,
      legsWon: 1,
    });
  });

  it("merges archive rows and prefers local ids for synced games", () => {
    const local = finishedRecord({
      id: "local-1",
      serverId: "server-1",
      syncStatus: "synced",
    });
    const remote: ArchiveGameRow[] = [
      {
        id: "server-1",
        mode: "501",
        status: "finished",
        created_at: "2024-01-02T00:00:00.000Z",
        game_players: [
          {
            user_id: 1,
            legs_won: 1,
            users: { first_name: "A", photo_url: null },
          },
          {
            user_id: 2,
            legs_won: 0,
            users: { first_name: "B", photo_url: null },
          },
        ],
      },
      {
        id: "server-2",
        mode: "301",
        status: "finished",
        created_at: "2024-01-01T00:00:00.000Z",
        game_players: [
          {
            user_id: 1,
            legs_won: 0,
            users: { first_name: "A", photo_url: null },
          },
          {
            user_id: 3,
            legs_won: 1,
            users: { first_name: "C", photo_url: null },
          },
        ],
      },
    ];

    const merged = mergeArchiveGames(remote, [local]);
    expect(merged.map((g) => g.id)).toEqual(["local-1", "server-2"]);
    expect(merged[0]?.created_at).toBe("2024-01-02T00:00:00.000Z");
    expect(localRecordToArchiveRow(local).id).toBe("local-1");
  });

  it("merges player stats without dropping local wins", () => {
    const merged = mergePlayerStats(
      {
        gamesPlayed: 2,
        legsWon: 2,
        avgPpr: 40,
        wins: 1,
        avgWinRound: 6,
      },
      {
        gamesPlayed: 1,
        legsWon: 1,
        avgPpr: 50,
        wins: 1,
        avgWinRound: 4,
      }
    );
    expect(merged.gamesPlayed).toBe(3);
    expect(merged.wins).toBe(2);
    expect(merged.avgWinRound).toBe(5);
  });
});
