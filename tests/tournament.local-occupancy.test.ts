import { describe, expect, it } from "vitest";
import { matchPlayControls } from "@/lib/tournament/local-match-occupancy";
import { needsSync, localGameCancel } from "@/lib/game/local/actions";
import type { LocalGameRecord } from "@/lib/game/local/types";

function baseRecord(
  overrides: Partial<LocalGameRecord> = {}
): LocalGameRecord {
  return {
    id: "g1",
    serverId: null,
    meta: {
      channelId: "ch",
      mode: "501",
      settings: {
        startingScore: 501,
        maxRounds: 20,
        legsToWin: 1,
        doubleOut: true,
      },
      playerIds: [1, 2],
      players: [
        { userId: 1, firstName: "A", username: null },
        { userId: 2, firstName: "B", username: null },
      ],
      createdBy: 1,
      tournamentMatchId: "m1",
      tournamentMatchType: "rr",
    },
    events: [],
    snapshot: {
      game: {
        id: "g1",
        channel_id: "ch",
        mode: "501",
        status: "active",
        current_player_index: 0,
        current_round: 1,
        current_leg: 1,
        settings: {
          startingScore: 501,
          maxRounds: 20,
          legsToWin: 1,
          doubleOut: true,
        },
      },
      players: [],
      activeVisitThrows: [],
    },
    tournamentContext: {
      tournamentId: "t1",
      name: "Test",
      stage: "Круговой этап",
      variant: "classic",
    },
    syncStatus: "local",
    syncError: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("tournament local match occupancy", () => {
  it("blocks play when local finished, allows continue when local active", () => {
    expect(
      matchPlayControls({
        serverPlayed: false,
        serverGameId: null,
        local: {
          matchId: "m1",
          localGameId: "local-1",
          status: "finished",
          syncStatus: "local",
          serverId: null,
          localWinnerId: 1,
        },
      })
    ).toMatchObject({
      canPlay: false,
      showLocalFinished: true,
      continueGameId: null,
      effectiveWinnerId: 1,
    });

    expect(
      matchPlayControls({
        serverPlayed: false,
        serverGameId: null,
        local: {
          matchId: "m1",
          localGameId: "local-1",
          status: "active",
          syncStatus: "local",
          serverId: null,
          localWinnerId: null,
        },
      })
    ).toMatchObject({
      canPlay: false,
      continueGameId: "local-1",
      showLocalFinished: false,
    });
  });

  it("marks cancelled tournament games for sync", () => {
    const cancelled = localGameCancel(baseRecord());
    expect(cancelled.snapshot.game.status).toBe("cancelled");
    expect(needsSync(cancelled)).toBe(true);
  });
});
