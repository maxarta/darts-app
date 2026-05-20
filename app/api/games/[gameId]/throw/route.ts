import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { recordThrow } from "@/lib/db/games";
import type { ThrowInput } from "@/lib/darts/rules";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { gameId } = await params;
  const body = await req.json();
  const input = body.throw as ThrowInput;

  if (!input?.segment) return jsonError("Invalid throw", 400);

  const result = await recordThrow(gameId, input);
  return Response.json(result);
}
