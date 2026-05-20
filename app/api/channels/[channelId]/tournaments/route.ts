import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { listChannelFinishedTournaments } from "@/lib/db/tournaments";
import { variantFromTournamentRow } from "@/lib/tournament/variant";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = authenticateRequest(req as import("next/server").NextRequest);
    if (!auth.ok) return jsonError(auth.error, auth.status);

    const { channelId } = await params;
    const db = getSupabaseAdmin();

    const { data: member, error: memberErr } = await db
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .eq("user_id", auth.ctx.user.id)
      .maybeSingle();

    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);

    const rows = await listChannelFinishedTournaments(channelId);
    const tournaments = rows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      variant: variantFromTournamentRow(t),
      created_at: t.created_at,
    }));

    return Response.json({ tournaments });
  } catch (e) {
    console.error("[channels/tournaments]", e);
    const message =
      e instanceof Error ? e.message : "Ошибка загрузки архива турниров";
    return jsonError(message, 500);
  }
}
