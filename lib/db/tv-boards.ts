import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  generateTvCode,
  isValidTvCode,
  normalizeTvCode,
} from "@/lib/tournament/tv-code";
import type { TvLivePayload } from "@/lib/tournament/tv-live";
import { findTournamentIdByTvCode } from "@/lib/db/tournament-tv-code";
import {
  gameBoardKey,
  tournamentBoardKey,
} from "@/lib/tournament/tv-board-key";

export type TvBoardKind = "tournament" | "game";

export type TvBoardRow = {
  board_key: string;
  code: string;
  kind: TvBoardKind;
  ref_id: string;
  channel_id: string | null;
  title: string;
  live: TvLivePayload | null;
  updated_at: string;
};

export { gameBoardKey, tournamentBoardKey };

async function codeTakenOnBoards(code: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("tv_boards")
    .select("board_key")
    .eq("code", code)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function allocateCode(): Promise<string> {
  for (let i = 0; i < 32; i++) {
    const code = generateTvCode();
    if (await codeTakenOnBoards(code)) continue;
    const legacy = await findTournamentIdByTvCode(code);
    if (legacy) continue;
    return code;
  }
  throw new Error("Не удалось выделить TV-код");
}

export async function ensureTvBoard(params: {
  boardKey: string;
  kind: TvBoardKind;
  refId: string;
  channelId?: string | null;
  title?: string;
  preferredCode?: string | null;
}): Promise<{ code: string; boardKey: string }> {
  const db = getSupabaseAdmin();
  const { data: existing, error } = await db
    .from("tv_boards")
    .select("code, title")
    .eq("board_key", params.boardKey)
    .maybeSingle();
  if (error) throw error;

  if (existing?.code) {
    if (params.title && params.title !== existing.title) {
      await db
        .from("tv_boards")
        .update({ title: params.title, updated_at: new Date().toISOString() })
        .eq("board_key", params.boardKey);
    }
    return { code: existing.code, boardKey: params.boardKey };
  }

  const preferred = params.preferredCode
    ? normalizeTvCode(params.preferredCode)
    : "";
  const code =
    preferred &&
    isValidTvCode(preferred) &&
    !(await codeTakenOnBoards(preferred))
      ? preferred
      : await allocateCode();

  const { error: insertErr } = await db.from("tv_boards").insert({
    board_key: params.boardKey,
    code,
    kind: params.kind,
    ref_id: params.refId,
    channel_id: params.channelId || null,
    title: params.title ?? "",
    live: null,
    updated_at: new Date().toISOString(),
  });
  if (insertErr) {
    const { data: again } = await db
      .from("tv_boards")
      .select("code")
      .eq("board_key", params.boardKey)
      .maybeSingle();
    if (again?.code) return { code: again.code, boardKey: params.boardKey };
    throw insertErr;
  }
  return { code, boardKey: params.boardKey };
}

export async function setTvBoardLive(
  boardKey: string,
  live: TvLivePayload | null
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("tv_boards")
    .update({
      live,
      updated_at: new Date().toISOString(),
    })
    .eq("board_key", boardKey);
  if (error) throw error;
}

export async function getTvBoardLive(
  boardKey: string
): Promise<TvLivePayload | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("tv_boards")
    .select("live")
    .eq("board_key", boardKey)
    .maybeSingle();
  if (error) throw error;
  const live = data?.live;
  if (!live || typeof live !== "object") return null;
  return live as TvLivePayload;
}

export async function findTvBoardByCode(
  rawCode: string
): Promise<TvBoardRow | null> {
  const code = normalizeTvCode(rawCode);
  if (!isValidTvCode(code)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("tv_boards")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as TvBoardRow;

  const tournamentId = await findTournamentIdByTvCode(code);
  if (!tournamentId) return null;

  await ensureTvBoard({
    boardKey: tournamentBoardKey(tournamentId),
    kind: "tournament",
    refId: tournamentId,
    preferredCode: code,
    title: "",
  });

  const { data: row } = await db
    .from("tv_boards")
    .select("*")
    .eq("board_key", tournamentBoardKey(tournamentId))
    .maybeSingle();
  return (row as TvBoardRow | null) ?? null;
}
