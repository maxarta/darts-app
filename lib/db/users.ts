import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { TelegramUser } from "@/lib/telegram/init-data";
import {
  syncUserProfilePhoto,
  telegramAvatarPath,
} from "@/lib/telegram/user-photo";

export async function upsertUser(user: TelegramUser) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("users").upsert(
    {
      telegram_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      photo_url:
        user.photo_url?.startsWith("https://") &&
        !user.photo_url.includes("api.telegram.org/file/bot")
          ? user.photo_url
          : telegramAvatarPath(user.id),
    },
    { onConflict: "telegram_id" }
  );
  if (error) throw error;

  try {
    await syncUserProfilePhoto(user);
  } catch (e) {
    console.warn("[users] syncUserProfilePhoto", user.id, e);
  }

  return user.id;
}
