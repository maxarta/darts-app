import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { deleteTournament, getTournament } from "@/lib/db/tournaments";
import {

export async function GET(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    const data = await getTournament(tournamentId);
    const toSync = data.participants.flatMap((p) => {
      const u = Array.isArray(p.users) ? p.users[0] : p.users;
      if (!u) return [];
      const userId = p.user_id;
      if (isManualPlayerId(userId) || isCustomClubPhoto(u.photo_url)) {
        return [];
      }
      return [
        {
          id: userId,
          photo_url: u.photo_url ?? undefined,
          existingPhotoUrl: u.photo_url ?? null
        }
      ];
    });
    void syncUserProfilePhotos(toSync).catch(
      (e) => console.warn("[tournaments/get] sync photos", e)
    );
    const participants = data.participants.map((p) => {
      const u = Array.isArray(p.users) ? p.users[0] : p.users;
      if (!u) return p;
      return {
        ...p,
        users: {
          ...u,
          photo_url: resolveStoredPhotoUrl(
            p.user_id,
            u.photo_url
          )
        }
      };
    });
    return Response.json({ ...data, participants });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tournament not found";
    return jsonError(message, 404);
  }
}
export async function DELETE(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  await deleteTournament(tournamentId);
  return Response.json({ ok: true });
}
