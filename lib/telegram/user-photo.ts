import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { TelegramUser } from "@/lib/telegram/init-data";
import { getTelegramBot } from "@/lib/telegram/bot";

/** Публичный путь к прокси-аватарке (same-origin, без BOT_TOKEN в URL). */
export function telegramAvatarPath(telegramId: number): string {
  return `/api/telegram/avatar/${telegramId}`;
}

/** Club-edited avatars (data URLs) must never be overwritten by Telegram sync. */
export function isCustomClubPhoto(
  photoUrl: string | null | undefined
): boolean {
  return Boolean(photoUrl?.startsWith("data:image/"));
}

/**
 * Club UI clears username on rename. Preserve that custom first_name so
 * Telegram session upserts don't wipe the player's club identity.
 */
export function shouldPreserveClubDisplayName(
  existing: {
    first_name: string;
    username: string | null;
    photo_url: string | null;
  } | null,
  telegramFirstName: string
): boolean {
  if (!existing) return false;
  if (isCustomClubPhoto(existing.photo_url)) return true;
  if (
    existing.username == null &&
    existing.first_name.trim().length > 0 &&
    existing.first_name !== telegramFirstName
  ) {
    return true;
  }
  return false;
}

export function resolveStoredPhotoUrl(
  _userId: number,
  photoUrl: string | null | undefined
): string | null {
  if (!photoUrl || photoUrl.length === 0) return null;
  // Keep Telegram proxy paths — avatar UI falls back to initials on 404.
  return photoUrl;
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

/** Какой URL писать в users.photo_url: клубное фото → initData → уже сохранённый → прокси. */
export function pickPhotoUrlToStore(
  telegramId: number,
  initPhotoUrl: string | null | undefined,
  existingPhotoUrl: string | null | undefined
): string {
  // Manual club photo always wins over Telegram profile sync.
  if (isCustomClubPhoto(existingPhotoUrl)) {
    return existingPhotoUrl as string;
  }
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
  if (isCustomClubPhoto(existingPhotoUrl)) {
    return existingPhotoUrl as string;
  }

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
    users
      .filter((u) => !isCustomClubPhoto(u.existingPhotoUrl))
      .map((u) => syncUserProfilePhoto(u, u.existingPhotoUrl))
  );
}
