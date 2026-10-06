import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  generateTvCode,
  isValidTvCode,
  normalizeTvCode,
  readTvCodeFromSettings,
} from "@/lib/tournament/tv-code";

async function tvCodeTaken(code: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("tournaments")
    .select("id")
    .contains("settings", { tvCode: code })
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function allocateUniqueTvCode(): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const code = generateTvCode();
    if (!(await tvCodeTaken(code))) return code;
  }
  throw new Error("Не удалось выделить TV-код");
}

export async function findTournamentIdByTvCode(
  rawCode: string
): Promise<string | null> {
  const code = normalizeTvCode(rawCode);
  if (!isValidTvCode(code)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("tournaments")
    .select("id")
    .contains("settings", { tvCode: code })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Ensure tournament has a short TV code; persist if missing. */
export async function ensureTournamentTvCode(
  tournamentId: string
): Promise<string> {
  const db = getSupabaseAdmin();
  const { data: row, error } = await db
    .from("tournaments")
    .select("settings")
    .eq("id", tournamentId)
    .single();
  if (error) throw error;

  const existing = readTvCodeFromSettings(row.settings);
  if (existing) return existing;

  const code = await allocateUniqueTvCode();
  const prev =
    row.settings && typeof row.settings === "object"
      ? { ...(row.settings as Record<string, unknown>) }
      : {};
  prev.tvCode = code;

  const { error: writeErr } = await db
    .from("tournaments")
    .update({ settings: prev })
    .eq("id", tournamentId);
  if (writeErr) throw writeErr;
  return code;
}
