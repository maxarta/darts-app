import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { getChannelLeaderboard } from "@/lib/db/stats";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const auth = authenticateRequest(req as import("next/server").NextRequest);
    if (!auth.ok) return jsonError(auth.error, auth.status);

    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId");
    if (!channelId) return jsonError("channelId required", 400);

    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .eq("user_id", auth.ctx.user.id)
      .maybeSingle();

    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);

    const leaderboard = await getChannelLeaderboard(channelId);
    return Response.json({ leaderboard });
  } catch (e) {
    console.error("[stats/leaderboard]", e);
    const message =
      e instanceof Error ? e.message : "Ошибка загрузки участников";
    return jsonError(message, 500);
  }
}
