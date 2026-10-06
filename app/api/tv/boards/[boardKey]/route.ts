import { authenticateRequest, jsonError } from "@/lib/api/auth";
import {
  ensureChannelTvBoard,
  ensureTvBoard,
  getTvBoardLive,
  setTvBoardLive,
  type TvBoardKind,
} from "@/lib/db/tv-boards";
import { parseTvBoardKey } from "@/lib/tournament/tv-board-key";
import type { TvLivePayload } from "@/lib/tournament/tv-live";

function parseBoardKey(raw: string): {
  boardKey: string;
  kind: TvBoardKind;
  refId: string;
} | null {
  return parseTvBoardKey(raw);
}

async function ensureParsedBoard(
  parsed: { boardKey: string; kind: TvBoardKind; refId: string },
  opts?: { channelId?: string | null; title?: string }
) {
  if (parsed.kind === "channel") {
    return ensureChannelTvBoard({
      channelId: parsed.refId,
      title: opts?.title,
    });
  }
  return ensureTvBoard({
    boardKey: parsed.boardKey,
    kind: parsed.kind,
    refId: parsed.refId,
    channelId: opts?.channelId,
    title: opts?.title,
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ boardKey: string }> }
) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { boardKey: raw } = await params;
  const parsed = parseBoardKey(raw);
  if (!parsed) return jsonError("Invalid board key", 400);

  const url = new URL(req.url);
  const want = url.searchParams.get("want");

  try {
    if (want === "code") {
      const channelId = url.searchParams.get("channelId");
      const title = url.searchParams.get("title") ?? "";
      const ensured = await ensureParsedBoard(parsed, { channelId, title });
      return Response.json({
        code: ensured.code,
        boardKey: ensured.boardKey,
        kind: parsed.kind,
        display: "artdart.vercel.app/tv",
        url: "https://artdart.vercel.app/tv",
      });
    }

    await ensureParsedBoard(parsed);
    const live = await getTvBoardLive(parsed.boardKey);
    return Response.json({ live });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return jsonError(message, 400);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ boardKey: string }> }
) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { boardKey: raw } = await params;
  const parsed = parseBoardKey(raw);
  if (!parsed) return jsonError("Invalid board key", 400);

  try {
    const body = (await req.json().catch(() => ({}))) as {
      live?: TvLivePayload | null;
      channelId?: string;
      title?: string;
    };

    await ensureParsedBoard(parsed, {
      channelId: body.channelId,
      title: body.title,
    });

    if (body.live === null) {
      await setTvBoardLive(parsed.boardKey, null);
      return Response.json({ live: null });
    }
    if (!body.live || typeof body.live !== "object") {
      return jsonError("live payload required", 400);
    }
    const live: TvLivePayload = {
      ...body.live,
      updatedAt: Date.now(),
    };
    await setTvBoardLive(parsed.boardKey, live);
    return Response.json({ live });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update live";
    return jsonError(message, 400);
  }
}

