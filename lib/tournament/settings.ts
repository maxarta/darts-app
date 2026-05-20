import { defaultSettings, type GameSettings } from "@/lib/darts/rules";

export type TournamentLegsToWin = 1 | 2;

export type TournamentSettings = {
  legsToWin: TournamentLegsToWin;
};

/** Финал всегда до двух побед, независимо от настроек турнира. */
export const FINAL_MATCH_LEGS_TO_WIN: TournamentLegsToWin = 2;

export const TOURNAMENT_LEGS_OPTIONS: Array<{
  value: TournamentLegsToWin;
  label: string;
}> = [
  { value: 1, label: "До 1 победы" },
  { value: 2, label: "До 2 побед" },
];

export function parseTournamentSettings(raw: unknown): TournamentSettings {
  const legsToWin =
    raw &&
    typeof raw === "object" &&
    "legsToWin" in raw &&
    (raw as { legsToWin: unknown }).legsToWin === 2
      ? 2
      : 1;
  return { legsToWin };
}

export function gameSettingsForTournament(
  mode: "301" | "501",
  tournamentSettings: TournamentSettings,
  options?: { final?: boolean }
): Partial<GameSettings> {
  const base = defaultSettings(mode);
  const legsToWin = options?.final
    ? FINAL_MATCH_LEGS_TO_WIN
    : tournamentSettings.legsToWin;
  return {
    legsToWin,
    doubleOut: base.doubleOut,
    maxRounds: base.maxRounds,
  };
}

export function normalizeLegsToWin(value: unknown): TournamentLegsToWin {
  return value === 2 ? 2 : 1;
}
