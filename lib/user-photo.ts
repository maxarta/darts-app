/** Club / profile photos — no Telegram Bot API. */

/** Same-origin avatar proxy (serves club data-URL JPEGs from DB). */
export function avatarPath(userId: number): string {
  return `/api/avatar/${userId}`;
}

/** @deprecated use avatarPath */
export const telegramAvatarPath = avatarPath;

/** Club-edited avatars (data URLs) must never be overwritten by sync. */
export function isCustomClubPhoto(
  photoUrl: string | null | undefined
): boolean {
  return Boolean(photoUrl?.startsWith("data:image/"));
}

/**
 * Decode a club `data:image/...;base64,...` photo for the avatar HTTP route.
 */
export function decodeDataImageUrl(
  dataUrl: string
): { contentType: string; body: Uint8Array } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(
    dataUrl.trim()
  );
  if (!match) return null;
  const contentType = match[1]!;
  const b64 = match[2]!.replace(/\s+/g, "");
  try {
    const binary = atob(b64);
    const body = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      body[i] = binary.charCodeAt(i);
    }
    return { contentType, body };
  } catch {
    return null;
  }
}

/**
 * Club UI clears username on rename. Preserve that custom first_name.
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

/** Display URL: club photos go through the avatar proxy for TV sharpness. */
export function resolveStoredPhotoUrl(
  userId: number,
  photoUrl: string | null | undefined
): string | null {
  if (!photoUrl || photoUrl.length === 0) return null;
  if (isCustomClubPhoto(photoUrl)) {
    return avatarPath(userId);
  }
  if (photoUrl.startsWith("/api/avatar/") || photoUrl.startsWith("/api/telegram/avatar/")) {
    return avatarPath(userId);
  }
  // Legacy external URLs — still prefer proxy if we only have club storage.
  return photoUrl;
}

/** What to write into users.photo_url. */
export function pickPhotoUrlToStore(
  userId: number,
  incomingPhotoUrl: string | null | undefined,
  existingPhotoUrl: string | null | undefined
): string {
  if (isCustomClubPhoto(existingPhotoUrl)) {
    return existingPhotoUrl as string;
  }
  if (isCustomClubPhoto(incomingPhotoUrl)) {
    return incomingPhotoUrl as string;
  }
  if (existingPhotoUrl?.startsWith("/api/avatar/")) {
    return existingPhotoUrl;
  }
  if (existingPhotoUrl?.startsWith("/api/telegram/avatar/")) {
    return avatarPath(userId);
  }
  if (existingPhotoUrl && existingPhotoUrl.length > 0) {
    return existingPhotoUrl;
  }
  return avatarPath(userId);
}

/** No-op: Telegram profile sync removed. */
export async function syncUserProfilePhoto(
  user: { id: number; photo_url?: string | null },
  existingPhotoUrl?: string | null
): Promise<string> {
  if (isCustomClubPhoto(existingPhotoUrl)) {
    return existingPhotoUrl as string;
  }
  return pickPhotoUrlToStore(user.id, user.photo_url, existingPhotoUrl);
}

export async function syncUserProfilePhotos(
  users: ({ id: number; photo_url?: string | null } & {
    existingPhotoUrl?: string | null;
  })[]
): Promise<void> {
  await Promise.all(
    users
      .filter((u) => u.id > 0 && !isCustomClubPhoto(u.existingPhotoUrl))
      .map((u) => syncUserProfilePhoto(u, u.existingPhotoUrl))
  );
}
