import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { finishTournament, getTournament } from "@/lib/db/tournaments";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { tournamentId } = await params;
  try {
    const { tournament } = await getTournament(tournamentId);
    const db = getSupabaseAdmin();

    const { data: member, error: memberErr } = await db
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", tournament.channel_id)
      .eq("user_id", auth.ctx.user.id)
      .maybeSingle();

    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);

    await finishTournament(tournamentId);
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось завершить турнир";
    const status = message.includes("Not found") ? 404 : 400;
    return jsonError(message, status);
  }
}
