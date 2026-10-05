import { authenticateRequest, jsonError } from "@/lib/api/auth";
import {
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {

export async function GET(req: Request) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId");
    const userId = Number(url.searchParams.get("userId") ?? auth.ctx.user.id);
    if (!channelId) return jsonError("channelId required", 400);
    if (!Number.isFinite(userId)) return jsonError("Invalid userId", 400);
    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", auth.ctx.user.id).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);
    const stats = await getPlayerStats(channelId, userId);
    const history = await getPlayerGameHistory(channelId, userId);
    const throwsByGameList = await getPlayerThrowsByGame(channelId, userId);
    const throwsByGame = Object.fromEntries(
      throwsByGameList.map((g) => [g.gameId, g.throws])
    );
    const allThrows = throwsByGameList.flatMap((g) => g.throws);
    const { data: userRow, error: userErr } = await db.from("users").select("first_name, username, photo_url").eq("telegram_id", userId).maybeSingle();
    if (userErr) throw userErr;
    if (!isCustomClubPhoto(userRow?.photo_url)) {
      void syncUserProfilePhoto(
        {
          id: userId,
          photo_url: userRow?.photo_url ?? undefined
        },
        userRow?.photo_url ?? null
      ).catch((e) => console.warn("[stats/player] sync photo", e));
    }
    const profile = {
      name: userRow?.first_name ?? userRow?.username ?? `\u0418\u0433\u0440\u043E\u043A #${userId}`,
      photoUrl: resolveStoredPhotoUrl(userId, userRow?.photo_url)
    };
    return Response.json({
      stats,
      history,
      userId,
      profile,
      allThrows,
      throwsByGame
    });
  } catch (e) {
    console.error("[stats/player]", e);
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0438";
    return jsonError(message, 500);
  }
}
