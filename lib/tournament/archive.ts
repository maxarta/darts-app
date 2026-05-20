import type { TournamentVariant } from "@/lib/tournament/variant";

export type ArchivedTournament = {
  id: string;
  name: string;
  status: string;
  variant?: TournamentVariant;
  created_at: string;
};

export function tournamentArchiveHref(
  tournamentId: string,
  channelId: string,
  variant?: TournamentVariant
) {
  const q = new URLSearchParams({ channelId });
  if (variant === "kenny") q.set("variant", "kenny");
  return `/tournament/${tournamentId}?${q.toString()}`;
}

export function tournamentArchiveMeta(t: ArchivedTournament): string {
  if (t.variant === "kenny") return "Kenny Pub · завершён";
  return "Турнир · завершён";
}
