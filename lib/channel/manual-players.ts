import { MAX_PHOTO_DATA_URL_CHARS } from "@/lib/channel/player-photo";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Manual player IDs are negative — club/web user ids are positive. */
export function isManualPlayerId(userId: number): boolean {
  return Number.isFinite(userId) && userId < 0;
}

export function allocateManualPlayerId(): number {
  return -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
}

export function assertPhotoUrl(photoUrl: string | null): string | null {
  if (photoUrl == null || photoUrl === "") return null;
  if (photoUrl.startsWith("data:image/")) {
    if (photoUrl.length > MAX_PHOTO_DATA_URL_CHARS) {
      throw new Error("Фото слишком большое — выберите другое");
    }
    return photoUrl;
  }
  if (
    photoUrl.startsWith("https://") ||
    photoUrl.startsWith("/api/telegram/avatar/")
  ) {
    return photoUrl;
  }
  throw new Error("Некорректный URL фото");
}

export async function assertChannelMembership(
  channelId: string,
  userId: number
): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function createManualChannelPlayer(
  channelId: string,
  name: string,
  photoUrl?: string | null
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Введите имя");
  if (trimmed.length > 40) throw new Error("Имя слишком длинное");
  const storedPhoto =
    photoUrl === undefined ? null : assertPhotoUrl(photoUrl ?? null);

  const db = getSupabaseAdmin();
  const telegramId = allocateManualPlayerId();

  const { error: userError } = await db.from("users").insert({
    telegram_id: telegramId,
    username: null,
    first_name: trimmed,
    last_name: null,
    photo_url: storedPhoto,
  });
  if (userError) throw userError;

  const { error: memberError } = await db.from("channel_members").insert({
    channel_id: channelId,
    user_id: telegramId,
    role: "member",
    last_verified_at: new Date().toISOString(),
  });
  if (memberError) {
    await db.from("users").delete().eq("telegram_id", telegramId);
    throw memberError;
  }

  return {
    user_id: telegramId,
    users: {
      first_name: trimmed,
      username: null as string | null,
      photo_url: storedPhoto,
    },
  };
}

export async function updateChannelPlayer(
  channelId: string,
  userId: number,
  patch: { name?: string; photo_url?: string | null }
) {
  const inChannel = await assertChannelMembership(channelId, userId);
  if (!inChannel) throw new Error("Игрок не в этом канале");

  const db = getSupabaseAdmin();
  const updates: {
    first_name?: string;
    username?: string | null;
    photo_url?: string | null;
  } = {};

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Введите имя");
    if (trimmed.length > 40) throw new Error("Имя слишком длинное");
    updates.first_name = trimmed;
    // Prefer display name over Telegram username after rename
    updates.username = null;
  }

  if (patch.photo_url !== undefined) {
    updates.photo_url = assertPhotoUrl(patch.photo_url);
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("Нечего обновлять");
  }

  const { data, error } = await db
    .from("users")
    .update(updates)
    .eq("telegram_id", userId)
    .select("telegram_id, first_name, username, photo_url")
    .single();
  if (error) throw error;

  return {
    user_id: data.telegram_id as number,
    users: {
      first_name: data.first_name as string,
      username: (data.username as string | null) ?? null,
      photo_url: (data.photo_url as string | null) ?? null,
    },
  };
}

export async function removeChannelPlayer(channelId: string, userId: number) {
  const inChannel = await assertChannelMembership(channelId, userId);
  if (!inChannel) throw new Error("Игрок не в этом канале");

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", userId);
  if (error) throw error;

  if (isManualPlayerId(userId)) {
    // Best-effort cleanup; keep row if FK history blocks delete
    const { error: userError } = await db
      .from("users")
      .delete()
      .eq("telegram_id", userId);
    if (userError) {
      console.warn("[manual-players] keep user after remove", userId, userError);
    }
  }
}
