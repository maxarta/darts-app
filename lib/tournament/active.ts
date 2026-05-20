import type { TournamentVariant } from "@/lib/tournament/variant";

export type ActiveTournament = {
  id: string;
  name: string;
  status: string;
  variant?: TournamentVariant;
};
