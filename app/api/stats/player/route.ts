import { authenticateRequest, jsonError } from "@/lib/api/auth";
import {
  getPlayerStats,
  getPlayerGameHistory,
  getPlayerThrowsByGame,
} from "@/lib/db/stats";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  resolveStoredPhotoUrl,
  syncUserProfilePhoto,
} from "@/lib/telegram/user-photo";

export async function GET(req: Request) {
  try {
    const auth = authenticateRequest(req as import("next/server").NextRequest);
    if (!auth.ok) return jsonError(auth.error, auth.status);

    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId");
    const userId = Number(url.searchParams.get("userId") ?? auth.ctx.user.id);

    if (!channelId) return jsonError("channelId required", 400);
    if (!Number.isFinite(userId)) return jsonError("Invalid userId", 400);

    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .eq("user_id", auth.ctx.user.id)
      .maybeSingle();

    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);

    const stats = await getPlayerStats(channelId, userId);
    const history = await getPlayerGameHistory(channelId, userId);
    const throwsByGameList = await getPlayerThrowsByGame(channelId, userId);
    const throwsByGame = Object.fromEntries(
      throwsByGameList.map((g) => [g.gameId, g.throws])
    );
    const allThrows = throwsByGameList.flatMap((g) => g.throws);

    const { data: userRow, error: userErr } = await db
      .from("users")
      .select("first_name, username, photo_url")
      .eq("telegram_id", userId)
      .maybeSingle();

    if (userErr) throw userErr;

    void syncUserProfilePhoto({
      id: userId,
      photo_url: userRow?.photo_url ?? undefined,
    }).catch((e) => console.warn("[stats/player] sync photo", e));

    const profile = {
      name:
        userRow?.first_name ??
        userRow?.username ??
        `Игрок #${userId}`,
      photoUrl: resolveStoredPhotoUrl(userId, userRow?.photo_url),
    };

    return Response.json({
      stats,
      history,
      userId,
      profile,
      allThrows,
      throwsByGame,
    });
  } catch (e) {
    console.error("[stats/player]", e);
    const message =
      e instanceof Error ? e.message : "Ошибка загрузки статистики";
    return jsonError(message, 500);
  }
}
