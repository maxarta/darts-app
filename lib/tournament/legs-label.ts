import type { TournamentLegsToWin } from "@/lib/tournament/settings";

export function formatLegsToWinLabel(legsToWin: TournamentLegsToWin): string {
  return legsToWin === 1 ? "До 1 победы" : "До 2 побед";
}
