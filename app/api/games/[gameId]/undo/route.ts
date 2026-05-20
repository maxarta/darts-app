import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { undoLastThrow } from "@/lib/db/games";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { gameId } = await params;
  const result = await undoLastThrow(gameId);
  return Response.json(result);
}
