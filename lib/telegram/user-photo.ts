import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { TelegramUser } from "@/lib/telegram/init-data";
import { getTelegramBot } from "@/lib/telegram/bot";

/** Публичный путь к прокси-аватарке (same-origin, без BOT_TOKEN в URL). */
export function telegramAvatarPath(telegramId: number): string {
  return `/api/telegram/avatar/${telegramId}`;
}

export function resolveStoredPhotoUrl(
  telegramId: number,
  photoUrl: string | null | undefined
): string {
  if (photoUrl && photoUrl.length > 0) return photoUrl;
  return telegramAvatarPath(telegramId);
}

function botFileUrl(filePath: string): string {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) throw new Error("BOT_TOKEN is required");
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}

/** URL файла в Telegram (только для server-side fetch). */
export async function getTelegramProfilePhotoFileUrl(
  telegramUserId: number
): Promise<string | null> {
  try {
    const bot = getTelegramBot();
    const photos = await bot.api.getUserProfilePhotos(telegramUserId, {
      limit: 1,
    });
    if (!photos.total_count || photos.photos.length === 0) return null;

    const sizes = photos.photos[0];
    const largest = sizes[sizes.length - 1];
    if (!largest) return null;

    const file = await bot.api.getFile(largest.file_id);
    if (!file.file_path) return null;

    return botFileUrl(file.file_path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("user not found")) {
      console.warn("[telegram/user-photo] getUserProfilePhotos", telegramUserId, e);
    }
    return null;
  }
}

export function isPublicPhotoUrl(url: string): boolean {
  return (
    url.startsWith("https://") &&
    !url.includes("/bot") &&
    !url.includes("api.telegram.org/file/bot")
  );
}

/** Какой URL писать в users.photo_url: initData → уже сохранённый → прокси. */
export function pickPhotoUrlToStore(
  telegramId: number,
  initPhotoUrl: string | null | undefined,
  existingPhotoUrl: string | null | undefined
): string {
  if (initPhotoUrl && isPublicPhotoUrl(initPhotoUrl)) return initPhotoUrl;
  if (existingPhotoUrl && isPublicPhotoUrl(existingPhotoUrl)) {
    return existingPhotoUrl;
  }
  if (existingPhotoUrl?.startsWith("/api/telegram/avatar/")) {
    return existingPhotoUrl;
  }
  return telegramAvatarPath(telegramId);
}

/** URL для server-side fetch аватарки (Bot API или сохранённый t.me). */
export async function resolveAvatarUpstreamUrl(
  telegramId: number,
  storedPhotoUrl: string | null | undefined
): Promise<string | null> {
  const fileUrl = await getTelegramProfilePhotoFileUrl(telegramId);
  if (fileUrl) return fileUrl;

  if (storedPhotoUrl && isPublicPhotoUrl(storedPhotoUrl)) {
    return storedPhotoUrl;
  }

  return null;
}

/**
 * Сохраняет в users.photo_url публичный URL (из initData) или путь к нашему прокси.
 */
export async function syncUserProfilePhoto(
  user: Pick<TelegramUser, "id" | "photo_url">,
  existingPhotoUrl?: string | null
): Promise<string> {
  const db = getSupabaseAdmin();
  const stored = pickPhotoUrlToStore(
    user.id,
    user.photo_url,
    existingPhotoUrl
  );

  const { error } = await db
    .from("users")
    .update({ photo_url: stored })
    .eq("telegram_id", user.id);

  if (error) throw error;
  return stored;
}

export async function syncUserProfilePhotos(
  users: (Pick<TelegramUser, "id" | "photo_url"> & {
    existingPhotoUrl?: string | null;
  })[]
): Promise<void> {
  await Promise.all(
    users.map((u) => syncUserProfilePhoto(u, u.existingPhotoUrl))
  );
}
