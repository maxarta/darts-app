import { authenticateRequest, isWebSession, jsonError } from "@/lib/api/auth";
import { isManualPlayerId } from "@/lib/channel/manual-players";
import { getChannelMembers } from "@/lib/db/channels";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  isCustomClubPhoto,
  resolveStoredPhotoUrl,
  syncUserProfilePhotos,
} from "@/lib/telegram/user-photo";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { channelId } = await params;
  const db = getSupabaseAdmin();

  const { data: member } = await db
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", channelId)
    .eq("user_id", auth.ctx.user.id)
    .maybeSingle();

  if (!member) return jsonError("Not a channel member", 403);

  const members = await getChannelMembers(channelId);

  // Skip Telegram photo sync for web club + manual/club-edited avatars (data URLs).
  if (!isWebSession(auth.ctx.initData)) {
    const toSync = members.flatMap((m) => {
      const u = Array.isArray(m.users) ? m.users[0] : m.users;
      if (!u) return [];
      const userId = m.user_id as number;
      if (isManualPlayerId(userId) || isCustomClubPhoto(u.photo_url)) return [];
      return [
        {
          id: userId,
          photo_url: u.photo_url ?? undefined,
          existingPhotoUrl: u.photo_url ?? null,
        },
      ];
    });

    void syncUserProfilePhotos(toSync).catch((e) =>
      console.warn("[channels/members] sync photos", e)
    );
  }

  const membersWithPhotos = members.map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    if (!u) return m;
    return {
      ...m,
      users: {
        ...u,
        photo_url: resolveStoredPhotoUrl(m.user_id as number, u.photo_url),
      },
    };
  });

  return Response.json({ members: membersWithPhotos });
}
