export type TournamentVariant = "standard" | "kenny";

/** Фон экранов и кнопки «Турнир Кенни» (green-700). */
export const KENNY_THEME_COLOR = "#15803d";

export function normalizeTournamentVariant(
  value: unknown
): TournamentVariant {
  return value === "kenny" ? "kenny" : "standard";
}

export function variantFromTournamentRow(row: {
  variant?: unknown;
  settings?: unknown;
}): TournamentVariant {
  if (row.variant != null && row.variant !== "") {
    return normalizeTournamentVariant(row.variant);
  }
  if (row.settings && typeof row.settings === "object") {
    const v = (row.settings as { variant?: unknown }).variant;
    if (v != null) return normalizeTournamentVariant(v);
  }
  return "standard";
}

export function isMissingVariantColumnError(error: {
  message?: string;
}): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("variant") && msg.includes("column");
}

export const TOURNAMENT_VARIANT_LABEL: Record<TournamentVariant, string> = {
  standard: "Турнир",
  kenny: "Турнир Кенни",
};
