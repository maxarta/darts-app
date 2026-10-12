import { jsonError } from "@/lib/api/auth";
import { findTvBoardByCode } from "@/lib/db/tv-boards";

/** Public — club TV / Smart TV PIN pad has no login session. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  try {
    const board = await findTvBoardByCode(code);
    if (!board) return jsonError("Код не найден", 404);
    return Response.json({
      boardKey: board.board_key,
      kind: board.kind,
      refId: board.ref_id,
      title: board.title,
      tournamentId: board.kind === "tournament" ? board.ref_id : null,
      gameId: board.kind === "game" ? board.ref_id : null,
      channelId: board.kind === "channel" ? board.ref_id : board.channel_id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lookup failed";
    return jsonError(message, 400);
  }
}
