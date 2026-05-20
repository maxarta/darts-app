import { describe, expect, it } from "vitest";
import {
  createLocalGameRecord,
  localGameEndVisit,
  localGameThrow,
} from "@/lib/game/local/actions";
import { isHutspaVisit } from "@/lib/darts/hutspa";
import type { LocalGameMeta } from "@/lib/game/local/types";

const meta: LocalGameMeta = {
  channelId: "ch1",
  mode: "501",
  settings: {
    startingScore: 501,
    maxRounds: 20,
    legsToWin: 1,
    doubleOut: false,
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

describe("hutspa flow", () => {
  it("defers auto endVisit until visit is ended manually", () => {
    let record = createLocalGameRecord({ id: "h1", meta });
    record = {
      ...record,
      snapshot: {
        ...record.snapshot,
        players: record.snapshot.players.map((p, i) =>
          i === 0
            ? {
                ...p,
                remaining_score: 26,
                score_at_visit_start: 26,
              }
            : p
        ),
      },
    };

    record = localGameThrow(record, { segment: 1, multiplier: 1 })!;
    record = localGameThrow(record, { segment: 5, multiplier: 1 })!;
    record = localGameThrow(record, { segment: 20, multiplier: 1 })!;

    expect(isHutspaVisit(record.snapshot.activeVisitThrows)).toBe(true);
    expect(record.snapshot.game.status).toBe("active");
    expect(record.events.map((e) => e.type)).toEqual([
      "throw",
      "throw",
      "throw",
    ]);

    record = localGameEndVisit(record)!;
    expect(record.snapshot.game.status).toBe("finished");
  });
});
