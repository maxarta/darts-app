import { describe, expect, it } from "vitest";
import { stableRoundRobinOrder } from "@/lib/tournament/stable-match-order";

describe("stableRoundRobinOrder", () => {
  it("keeps first-seen order when server returns shuffled updates", () => {
    const orderRef = { current: [] as string[] };
    const initial = [
      { id: "a", played: false },
      { id: "b", played: false },
      { id: "c", played: false },
    ];

    stableRoundRobinOrder(initial, orderRef);
    const updated = [
      { id: "c", played: true },
      { id: "a", played: false },
      { id: "b", played: true },
    ];

    expect(stableRoundRobinOrder(updated, orderRef).map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("appends newly drawn matches at the end", () => {
    const orderRef = { current: ["a", "b"] };
    const next = [
      { id: "a", played: false },
      { id: "b", played: false },
      { id: "c", played: false },
    ];

    expect(stableRoundRobinOrder(next, orderRef).map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
