import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { startPlayoff } from "@/lib/db/tournaments";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { tournamentId } = await params;
  const data = await startPlayoff(tournamentId);
  return Response.json(data);
}
