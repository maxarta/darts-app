import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { createMatchGame } from "@/lib/db/tournaments";

export async function POST(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  const body = await req.json();
  const { matchId, matchType, channelId } = body;
  if (!matchId || !channelId) return jsonError("Invalid payload", 400);
  const game = await createMatchGame(
    tournamentId,
    matchId,
    matchType === "playoff" ? "playoff" : "rr",
    channelId,
    auth.ctx.user.id
  );
  return Response.json({ game });
}
