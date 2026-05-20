import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { getGame } from "@/lib/db/games";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { gameId } = await params;
  const result = await getGame(gameId);
  return Response.json(result);
}
