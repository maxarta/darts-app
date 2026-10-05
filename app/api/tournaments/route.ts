import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { isChannelAdmin } from "@/lib/db/channels";
import {
  assertChannelTournamentParticipants,
  createTournament,
  listChannelTournaments,
  listCreatorActiveTournaments,
  normalizeTournamentParticipantIds,
} from "@/lib/db/tournaments";
import { upsertUser } from "@/lib/db/users";
import { normalizeLegsToWin } from "@/lib/tournament/settings";
import {
  normalizeTournamentVariant,
  variantFromTournamentRow,
} from "@/lib/tournament/variant";
export async function GET(req: Request) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const url = new URL(req.url);
  const channelId = url.searchParams.get("channelId");
  if (!channelId) return jsonError("channelId required", 400);

  const createdByParam = url.searchParams.get("createdBy");
  if (createdByParam) {
    const createdBy = Number(createdByParam);
    if (!Number.isFinite(createdBy)) {
      return jsonError("Invalid createdBy", 400);
    }
    const rows = await listCreatorActiveTournaments(channelId, createdBy);
    const tournaments = rows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      variant: variantFromTournamentRow(t),
      created_at: t.created_at,
    }));
    return Response.json({ tournaments });
  }

  const tournaments = await listChannelTournaments(channelId);
  return Response.json({ tournaments });
}

export async function POST(req: Request) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  try {
    const body = await req.json();
    const { channelId, name, participantIds, playoffSize, legsToWin, variant } =
      body;
    const tournamentVariant = normalizeTournamentVariant(variant);

    if (!channelId || !Array.isArray(participantIds) || participantIds.length < 1) {
      return jsonError("Invalid payload", 400);
    }

    const ids = normalizeTournamentParticipantIds(
      participantIds.map((id: unknown) => Number(id)).filter((id) => Number.isFinite(id))
    );

    if (ids.length < 3) {
      return jsonError("At least 3 participants required", 400);
    }

    const playoff = playoffSize === 8 ? 8 : 4;
    if (ids.length < playoff) {
      return jsonError(
        `At least ${playoff} participants required for top-${playoff} playoff`,
        400
      );
    }

    await upsertUser(auth.ctx.user);
    await assertChannelTournamentParticipants(channelId, ids);

    if (tournamentVariant === "kenny") {
      const admin = await isChannelAdmin(channelId, auth.ctx.user.id);
      if (!admin) {
        return jsonError("Турнир Кенни могут создавать только админы группы", 403);
      }
    }

    const tournament = await createTournament({
      channelId,
      name,
      variant: tournamentVariant,
      participantIds: ids,
      playoffSize: playoff,
      legsToWin: normalizeLegsToWin(legsToWin),
      createdBy: auth.ctx.user.id,
    });

    return Response.json(tournament);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create tournament";
    const status = message.includes("not found") ? 404 : 400;
    return jsonError(message, status);
  }
}
