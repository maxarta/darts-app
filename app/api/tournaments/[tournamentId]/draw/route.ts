import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { drawRoundRobin, getTournament } from "@/lib/db/tournaments";

export async function POST(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    await drawRoundRobin(tournamentId);
    const data = await getTournament(tournamentId);
    return Response.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to run round robin draw";
    const status = message.includes("not found") ? 404 : message.includes("already") ? 409 : 400;
    return jsonError(message, status);
  }
}
