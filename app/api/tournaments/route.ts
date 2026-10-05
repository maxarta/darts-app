import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { isChannelAdmin } from "@/lib/db/channels";
import {
import { upsertUser } from "@/lib/db/users";
import { normalizeLegsToWin } from "@/lib/tournament/settings";
import {

export async function GET(req: Request) {
  const auth = authenticateRequest(req);
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
    const tournaments2 = rows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      variant: variantFromTournamentRow(t),
      created_at: t.created_at
    }));
    return Response.json({ tournaments: tournaments2 });
  }
  const tournaments = await listChannelTournaments(channelId);
  return Response.json({ tournaments });
}
export async function POST(req: Request) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try {
    const body = await req.json();
    const { channelId, name, participantIds, playoffSize, legsToWin, variant } = body;
    const tournamentVariant = normalizeTournamentVariant(variant);
    if (!channelId || !Array.isArray(participantIds) || participantIds.length < 1) {
      return jsonError("Invalid payload", 400);
    }
    const ids = normalizeTournamentParticipantIds(
      participantIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
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
        return jsonError("\u0422\u0443\u0440\u043D\u0438\u0440 \u041A\u0435\u043D\u043D\u0438 \u043C\u043E\u0433\u0443\u0442 \u0441\u043E\u0437\u0434\u0430\u0432\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0434\u043C\u0438\u043D\u044B \u0433\u0440\u0443\u043F\u043F\u044B", 403);
      }
    }
    const tournament = await createTournament({
      channelId,
      name,
      variant: tournamentVariant,
      participantIds: ids,
      playoffSize: playoff,
      legsToWin: normalizeLegsToWin(legsToWin),
      createdBy: auth.ctx.user.id
    });
    return Response.json(tournament);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create tournament";
    const status = message.includes("not found") ? 404 : 400;
    return jsonError(message, status);
  }
}
