import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { ensureTournamentTvCode } from "@/lib/db/tournament-tv-code";
import { getTournament } from "@/lib/db/tournaments";
import { tvPublicDisplay, tvPublicUrl } from "@/lib/tournament/tv-live";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { tournamentId } = await params;
  try {
    await getTournament(tournamentId);
    const code = await ensureTournamentTvCode(tournamentId);
    return Response.json({
      code,
      url: tvPublicUrl(),
      display: tvPublicDisplay(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return jsonError(message, message.includes("not found") ? 404 : 400);
  }
}
