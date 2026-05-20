import type { GameSettings, ThrowInput } from "@/lib/darts/rules";
import type { GameSnapshot } from "@/lib/game/optimistic";
import type { GameTournamentContext } from "@/lib/tournament/game-context";

export type GameEvent =
  | { type: "throw"; input: ThrowInput }
  | { type: "endVisit" };

export type LocalPlayerMeta = {
  userId: number;
  firstName: string;
  username: string | null;
  photoUrl?: string | null;
};

export type LocalGameMeta = {
  channelId: string;
  mode: "301" | "501";
  settings: GameSettings;
  playerIds: number[];
  players: LocalPlayerMeta[];
  createdBy: number;
  tournamentMatchId: string | null;
  tournamentMatchType: "rr" | "playoff" | null;
};

export type LocalGameSyncStatus =
  | "local"
  | "syncing"
  | "synced"
  | "failed";

export type LocalGameRecord = {
  id: string;
  serverId: string | null;
  meta: LocalGameMeta;
  events: GameEvent[];
  snapshot: GameSnapshot;
  tournamentContext: GameTournamentContext | null;
  syncStatus: LocalGameSyncStatus;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
};
