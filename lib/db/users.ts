import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/api/auth";
import {
  isCustomClubPhoto,
  pickPhotoUrlToStore,
  shouldPreserveClubDisplayName,
  syncUserProfilePhoto,
} from "@/lib/user-photo";

export type StoredUserProfile = {
  /** Legacy column name in Supabase (`users.telegram_id`). */
  telegram_id: number;
  first_name: string;
  username: string | null;
  photo_url: string | null;
};

export async function getUserPhotoUrl(
  userId: number
): Promise<string | null> {
  const profile = await getUserProfile(userId);
  return profile?.photo_url ?? null;
}

export async function getUserProfile(
  userId: number
): Promise<StoredUserProfile | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("telegram_id, first_name, username, photo_url")
    .eq("telegram_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    telegram_id: data.telegram_id as number,
    first_name: (data.first_name as string) ?? String(userId),
    username: (data.username as string | null) ?? null,
    photo_url: (data.photo_url as string | null) ?? null,
  };
}

export async function upsertUser(user: AppUser) {
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

  const nameFields = {
    username: preserveName ? existing?.username ?? null : (user.username ?? null),
    first_name: preserveName
      ? (existing?.first_name ?? user.first_name)
      : user.first_name,
    last_name: user.last_name ?? null,
  };

  if (!existing) {
    const { error } = await db.from("users").insert({
      telegram_id: user.id,
      ...nameFields,
      photo_url,
    });
    if (error) throw error;
  } else if (isCustomClubPhoto(existingPhotoUrl)) {
    const { error } = await db
      .from("users")
      .update(nameFields)
      .eq("telegram_id", user.id);
    if (error) throw error;
  } else {
    const freshPhoto = await getUserPhotoUrl(user.id);
    if (isCustomClubPhoto(freshPhoto)) {
      const { error } = await db
        .from("users")
        .update(nameFields)
        .eq("telegram_id", user.id);
      if (error) throw error;
    } else {
      const { error } = await db
        .from("users")
        .update({ ...nameFields, photo_url })
        .eq("telegram_id", user.id);
      if (error) throw error;
    }
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
