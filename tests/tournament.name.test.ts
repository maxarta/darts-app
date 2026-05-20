import { describe, it, expect } from "vitest";
import { generateTournamentName } from "@/lib/tournament/name";

describe("generateTournamentName", () => {
  it("uses tournament label and capitalized Russian month year", () => {
    const name = generateTournamentName(new Date(2026, 4, 16));
    expect(name).toBe("Турнир • Май 2026");
  });
});
