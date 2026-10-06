import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { findTournamentIdByTvCode } from "@/lib/db/tournament-tv-code";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { code } = await params;
  try {
    const tournamentId = await findTournamentIdByTvCode(code);
    if (!tournamentId) return jsonError("Турнир не найден", 404);
    return Response.json({ tournamentId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lookup failed";
    return jsonError(message, 400);
  }
}
