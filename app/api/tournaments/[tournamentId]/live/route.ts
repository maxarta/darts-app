import { authenticateRequest, jsonError } from "@/lib/api/auth";
import {
  getTournamentTvLive,
  setTournamentTvLive,
} from "@/lib/db/tournament-live";
import { getTournament } from "@/lib/db/tournaments";
import type { TvLivePayload } from "@/lib/tournament/tv-live";

export async function GET(
  _req: Request,
  { params }: { params: Promise<Record<string, string>> }
) {
  const auth = authenticateRequest(_req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    await getTournament(tournamentId);
    const live = await getTournamentTvLive(tournamentId);
    return Response.json({ live });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Not found";
    return jsonError(message, message.includes("not found") ? 404 : 400);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<Record<string, string>> }
) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    await getTournament(tournamentId);
    const body = (await req.json().catch(() => ({}))) as {
      live?: TvLivePayload | null;
    };
    if (body.live === null) {
      await setTournamentTvLive(tournamentId, null);
      return Response.json({ live: null });
    }
    if (!body.live || typeof body.live !== "object") {
      return jsonError("live payload required", 400);
    }
    const live: TvLivePayload = {
      ...body.live,
      updatedAt: Date.now(),
    };
    await setTournamentTvLive(tournamentId, live);
    return Response.json({ live });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update live";
    return jsonError(message, 400);
  }
}
