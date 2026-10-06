import { defaultSettings, type GameSettings } from "@/lib/darts/rules";

export type TournamentLegsToWin = 1 | 2;

export type TournamentSettings = {
  legsToWin: TournamentLegsToWin;
  /** Random-pair knockout with re-draws (Kenny + standard). */
  format?: "pair_ko" | "legacy";
};

/** Финал / серии пар — всегда до двух побед. */
export const FINAL_MATCH_LEGS_TO_WIN: TournamentLegsToWin = 2;

/** Default for new tournaments: first to 2 (best of 3). */
export const DEFAULT_TOURNAMENT_LEGS_TO_WIN: TournamentLegsToWin = 2;

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
    (raw as { legsToWin: unknown }).legsToWin === 1
      ? 1
      : 2;
  const format =
    raw &&
    typeof raw === "object" &&
    (raw as { format?: unknown }).format === "pair_ko"
      ? "pair_ko"
      : raw &&
          typeof raw === "object" &&
          (raw as { format?: unknown }).format === "legacy"
        ? "legacy"
        : undefined;
  return { legsToWin, format };
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
  return value === 1 ? 1 : 2;
}
