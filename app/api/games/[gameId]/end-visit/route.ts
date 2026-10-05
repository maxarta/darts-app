import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { endVisit } from "@/lib/db/games";

export async function POST(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { gameId } = await params;
  const result = await endVisit(gameId);
  return Response.json(result);
}
