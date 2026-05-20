"use client";

import { defaultSettings, type GameSettings } from "@/lib/darts/rules";
import type { GameTournamentContext } from "@/lib/tournament/game-context";
import { createLocalGameRecord } from "./actions";
import { buildPlayerMetas } from "./initial";
import { saveLocalGame } from "./store";
import type { LocalGameMeta, LocalPlayerMeta } from "./types";

export async function createAndSaveLocalGame(params: {
  channelId: string;
  mode: "301" | "501";
  playerIds: number[];
  players: LocalPlayerMeta[];
  createdBy: number;
  settings?: Partial<GameSettings>;
  tournamentMatchId?: string | null;
  tournamentMatchType?: "rr" | "playoff" | null;
  tournamentContext?: GameTournamentContext | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  const settings = {
    ...defaultSettings(params.mode),
    ...params.settings,
  };

  const meta: LocalGameMeta = {
    channelId: params.channelId,
    mode: params.mode,
    settings,
    playerIds: params.playerIds,
    players: params.players,
    createdBy: params.createdBy,
    tournamentMatchId: params.tournamentMatchId ?? null,
    tournamentMatchType: params.tournamentMatchType ?? null,
  };

  const record = createLocalGameRecord({
    id,
    meta,
    tournamentContext: params.tournamentContext ?? null,
  });

  await saveLocalGame(record);
  return id;
}

export { buildPlayerMetas };
