import { describe, it, expect } from "vitest";
import {
  createLocalGameRecord,
  localGameEndVisit,
  localGameThrow,
  localGameUndo,
} from "@/lib/game/local/actions";
import { buildInitialSnapshot } from "@/lib/game/local/initial";
import { replayEvents } from "@/lib/game/local/replay";
import type { LocalGameMeta } from "@/lib/game/local/types";

const meta: LocalGameMeta = {
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
    { userId: 1, firstName: "A", username: null },
    { userId: 2, firstName: "B", username: null },
  ],
  createdBy: 1,
  tournamentMatchId: null,
  tournamentMatchType: null,
};

describe("local game replay", () => {
  it("locks visit after 3 throws and undo restores", () => {
    let record = createLocalGameRecord({ id: "g1", meta });
    record =
      localGameThrow(record, { segment: 20, multiplier: 3 })!;
    record =
      localGameThrow(record, { segment: 20, multiplier: 1 })!;
    record =
      localGameThrow(record, { segment: 5, multiplier: 1 })!;

    expect(record.snapshot.activeVisitThrows).toHaveLength(3);
    expect(record.snapshot.players[0].awaiting_visit_end).toBe(true);
    expect(localGameThrow(record, { segment: 1, multiplier: 1 })).toBeNull();

    record = localGameUndo(record)!;
    expect(record.snapshot.activeVisitThrows).toHaveLength(2);
    expect(record.snapshot.players[0].awaiting_visit_end).toBe(false);
  });

  it("undo after end visit returns to previous player", () => {
    let record = createLocalGameRecord({ id: "g2", meta });
    record = localGameThrow(record, { segment: 20, multiplier: 3 })!;
    record = localGameThrow(record, { segment: 20, multiplier: 3 })!;
    record = localGameThrow(record, { segment: 20, multiplier: 3 })!;
    record = localGameEndVisit(record)!;

    expect(record.snapshot.game.current_player_index).toBe(1);
    expect(record.events).toHaveLength(4);

    record = localGameUndo(record)!;
    expect(record.snapshot.game.current_player_index).toBe(0);
    expect(record.snapshot.activeVisitThrows).toHaveLength(3);
  });

  it("auto-finishes leg on valid double checkout", () => {
    const shortMeta: LocalGameMeta = {
      ...meta,
      settings: { ...meta.settings, legsToWin: 1 },
    };
    let record = createLocalGameRecord({ id: "g-checkout", meta: shortMeta });
    record = {
      ...record,
      snapshot: {
        ...record.snapshot,
        players: record.snapshot.players.map((p, i) =>
          i === 0
            ? {
                ...p,
                remaining_score: 32,
                score_at_visit_start: 32,
              }
            : p
        ),
      },
    };
    record = localGameThrow(record, { segment: 16, multiplier: 2 })!;
    expect(record.events.map((e) => e.type)).toEqual(["throw"]);
    expect(record.snapshot.game.status).toBe("active");

    record = localGameEndVisit(record)!;
    expect(record.events.map((e) => e.type)).toEqual(["throw", "endVisit"]);
    expect(record.snapshot.game.status).toBe("finished");
    expect(record.snapshot.players[0].legs_won).toBe(1);
    expect(record.snapshot.players[0].remaining_score).toBe(0);
  });

  it("replay matches incremental updates", () => {
    let record = createLocalGameRecord({ id: "g3", meta });
    record = localGameThrow(record, { segment: "miss", multiplier: 1 })!;
    record = localGameEndVisit(record)!;

    const initial = buildInitialSnapshot("g3", meta, null);
    const replayed = replayEvents(initial, record.events);
    expect(replayed.game.current_player_index).toBe(
      record.snapshot.game.current_player_index
    );
    expect(replayed.players[0].remaining_score).toBe(
      record.snapshot.players[0].remaining_score
    );
  });
});
