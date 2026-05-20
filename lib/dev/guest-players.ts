import { registerChannelMember } from "@/lib/db/channels";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const DEV_GUEST_PLAYERS = [
  { id: 2, first_name: "Алекс", username: "alex_darts" },
  { id: 3, first_name: "Макс", username: "max_darts" },
  { id: 4, first_name: "Катя", username: "kate_darts" },
  { id: 5, first_name: "Олег", username: "oleg_darts" },
  { id: 6, first_name: "Вика", username: "vika_darts" },
] as const;

export function isDevAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_DEV_AUTH === "true"
  );
}

/** Регистрирует тестовых игроков в канале (только dev) */
export async function ensureDevGuestsInChannel(
  channelId: string,
  telegramChatId: number
): Promise<void> {
  if (!isDevAuthEnabled()) return;

  const db = getSupabaseAdmin();
  for (const guest of DEV_GUEST_PLAYERS) {
    await db.from("users").upsert(
      {
        telegram_id: guest.id,
        username: guest.username,
        first_name: guest.first_name,
        last_name: null,
        photo_url: null,
      },
      { onConflict: "telegram_id" }
    );
    await registerChannelMember(channelId, telegramChatId, guest.id);
  }
}
