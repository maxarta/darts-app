import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { deleteTournament, getTournament } from "@/lib/db/tournaments";
import { resolveStoredPhotoUrl } from "@/lib/user-photo";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { tournamentId } = await params;
  try {
    const data = await getTournament(tournamentId);

    const participants = data.participants.map((p) => {
      const u = Array.isArray(p.users) ? p.users[0] : p.users;
      if (!u) return p;
      return {
        ...p,
        users: {
          ...u,
          photo_url: resolveStoredPhotoUrl(
            p.user_id as number,
            u.photo_url
          ),
        },
      };
    });

    return Response.json({ ...data, participants });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tournament not found";
    return jsonError(message, 404);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { tournamentId } = await params;
  await deleteTournament(tournamentId);
  return Response.json({ ok: true });
}
