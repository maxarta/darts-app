import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { TelegramUser } from "@/lib/telegram/init-data";
import {
  isCustomClubPhoto,
  pickPhotoUrlToStore,
  shouldPreserveClubDisplayName,
  syncUserProfilePhoto,
} from "@/lib/telegram/user-photo";

export type StoredUserProfile = {
  telegram_id: number;
  first_name: string;
  username: string | null;
  photo_url: string | null;
};

export async function getUserPhotoUrl(
  telegramId: number
): Promise<string | null> {
  const profile = await getUserProfile(telegramId);
  return profile?.photo_url ?? null;
}

export async function getUserProfile(
  telegramId: number
): Promise<StoredUserProfile | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("telegram_id, first_name, username, photo_url")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    telegram_id: data.telegram_id as number,
    first_name: (data.first_name as string) ?? String(telegramId),
    username: (data.username as string | null) ?? null,
    photo_url: (data.photo_url as string | null) ?? null,
  };
}

export async function upsertUser(user: TelegramUser) {
  const db = getSupabaseAdmin();
  const existing = await getUserProfile(user.id);
  const existingPhotoUrl = existing?.photo_url ?? null;
  const photo_url = pickPhotoUrlToStore(
    user.id,
    user.photo_url,
    existingPhotoUrl
  );
  const preserveName = shouldPreserveClubDisplayName(
    existing,
    user.first_name
  );

  if (!existing) {
    const { error } = await db.from("users").insert({
      telegram_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      photo_url,
    });
    if (error) throw error;
  } else {
    const { error } = await db
      .from("users")
      .update({
        username: preserveName ? existing.username : (user.username ?? null),
        first_name: preserveName ? existing.first_name : user.first_name,
        last_name: user.last_name ?? null,
        photo_url,
      })
      .eq("telegram_id", user.id);
    if (error) throw error;
  }

  if (!isCustomClubPhoto(photo_url) && !isCustomClubPhoto(existingPhotoUrl)) {
    try {
      await syncUserProfilePhoto(user, existingPhotoUrl);
    } catch (e) {
      console.warn("[users] syncUserProfilePhoto", user.id, e);
    }
  }

  return user.id;
}
