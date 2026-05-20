import { describe, expect, it } from "vitest";
import { normalizeTournamentParticipantIds } from "@/lib/db/tournaments";

describe("normalizeTournamentParticipantIds", () => {
  it("removes duplicates while preserving order", () => {
    expect(normalizeTournamentParticipantIds([3, 1, 2, 1, 3])).toEqual([
      3, 1, 2,
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeTournamentParticipantIds([])).toEqual([]);
  });
});
