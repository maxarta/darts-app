import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { listChannelGames } from "@/lib/db/games";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const { channelId } = await params;
    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db.from("channel_members").select("user_id").eq("channel_id", channelId).eq("user_id", auth.ctx.user.id).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);
    const games = await listChannelGames(channelId);
    return Response.json({ games });
  } catch (e) {
    console.error("[channels/games]", e);
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0430\u0440\u0445\u0438\u0432\u0430 \u0438\u0433\u0440";
    return jsonError(message, 500);
  }
}
