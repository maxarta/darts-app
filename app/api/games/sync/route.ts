import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { importLocalGame } from "@/lib/db/import-local-game";
import type { GameSettings } from "@/lib/darts/rules";

export async function POST(req: Request) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const body = await req.json();
  const {
    localId,
    channelId,
    mode,
    settings,
    playerIds,
    tournamentMatchId,
    tournamentMatchType,
    status,
    currentPlayerIndex,
    currentLeg,
    currentRound,
    players,
    throws,
  } = body;

  if (
    !localId ||
    !channelId ||
    !mode ||
    !Array.isArray(playerIds) ||
    playerIds.length < 1 ||
    !Array.isArray(players) ||
    !Array.isArray(throws)
  ) {
    return jsonError("Invalid payload", 400);
  }

  const result = await importLocalGame({
    localId,
    channelId,
    mode: mode === "301" ? "301" : "501",
    settings: settings as GameSettings,
    playerIds,
    createdBy: auth.ctx.user.id,
    tournamentMatchId: tournamentMatchId ?? null,
    tournamentMatchType: tournamentMatchType ?? null,
    status:
      status === "finished" || status === "cancelled" ? status : "finished",
    currentPlayerIndex: Number(currentPlayerIndex) || 0,
    currentLeg: Number(currentLeg) || 1,
    currentRound: Number(currentRound) || 1,
    players,
    throws,
  });

  return Response.json({
    gameId: result.game.id,
    game: result,
  });
}
