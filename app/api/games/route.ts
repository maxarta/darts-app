import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { createGame } from "@/lib/db/games";
import { registerChannelMember } from "@/lib/db/channels";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const body = await req.json();
  const { channelId, mode, playerIds, settings, telegramChatId } = body;

  if (!channelId || !mode || !Array.isArray(playerIds) || playerIds.length < 1) {
    return jsonError("Invalid payload", 400);
  }

  if (telegramChatId) {
    await registerChannelMember(
      channelId,
      Number(telegramChatId),
      auth.ctx.user.id
    );
  }

  const db = getSupabaseAdmin();
  for (const pid of playerIds) {
    const { data: m } = await db
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .eq("user_id", pid)
      .maybeSingle();
    if (!m) return jsonError(`Player ${pid} not in channel registry`, 400);
  }

  const result = await createGame({
    channelId,
    mode: mode === "301" ? "301" : "501",
    playerIds,
    createdBy: auth.ctx.user.id,
    settings,
  });

  return Response.json(result);
}
