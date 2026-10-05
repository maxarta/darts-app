import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { finishTournament, getTournament } from "@/lib/db/tournaments";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { tournamentId } = await params;
  try {
    const { tournament } = await getTournament(tournamentId);
    const db = getSupabaseAdmin();
    const { data: member, error: memberErr } = await db.from("channel_members").select("user_id").eq("channel_id", tournament.channel_id).eq("user_id", auth.ctx.user.id).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return jsonError("Not a channel member", 403);
    await finishTournament(tournamentId);
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0442\u0443\u0440\u043D\u0438\u0440";
    const status = message.includes("Not found") ? 404 : 400;
    return jsonError(message, status);
  }
}
