import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { TelegramUser } from "@/lib/telegram/init-data";
import {
  pickPhotoUrlToStore,
  syncUserProfilePhoto,
} from "@/lib/telegram/user-photo";

export async function getUserPhotoUrl(
  telegramId: number
): Promise<string | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("photo_url")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (error) throw error;
  return data?.photo_url ?? null;
}

export async function upsertUser(user: TelegramUser) {
  const db = getSupabaseAdmin();
  const existingPhotoUrl = await getUserPhotoUrl(user.id);
  const photo_url = pickPhotoUrlToStore(
    user.id,
    user.photo_url,
    existingPhotoUrl
  );

  const { error } = await db.from("users").upsert(
    {
      telegram_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      photo_url,
    },
    { onConflict: "telegram_id" }
  );
  if (error) throw error;

  try {
    await syncUserProfilePhoto(user, existingPhotoUrl);
  } catch (e) {
    console.warn("[users] syncUserProfilePhoto", user.id, e);
  }

  return user.id;
}
