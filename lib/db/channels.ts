import { WEB_CLUB_CHAT_ID } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const ADMIN_ROLES = new Set(["creator", "administrator"]);

export type ChannelMemberRole = "creator" | "administrator" | "member";

export async function ensureChannel(telegramChatId: number, title?: string) {
  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("channels")
    .select("*")
    .eq("telegram_chat_id", telegramChatId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await db
    .from("channels")
    .insert({
      telegram_chat_id: telegramChatId,
      title:
        title ??
        (telegramChatId === WEB_CLUB_CHAT_ID
          ? "Клуб"
          : `Club ${telegramChatId}`),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function registerChannelMember(
  channelId: string,
  telegramChatId: number,
  userId: number,
  role?: ChannelMemberRole
) {
  // Web-only club: membership is local DB — no Telegram Bot API.
  void telegramChatId;
  const resolvedRole: ChannelMemberRole =
    role ?? (userId === 1 ? "creator" : "member");

  const db = getSupabaseAdmin();
  const { error } = await db.from("channel_members").upsert(
    {
      channel_id: channelId,
      user_id: userId,
      role: resolvedRole,
      last_verified_at: new Date().toISOString(),
    },
    { onConflict: "channel_id,user_id" }
  );
  if (error) throw error;
  return resolvedRole;
}

export async function getChannelMemberRole(
  channelId: string,
  userId: number
): Promise<ChannelMemberRole | null> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("channel_members")
    .select("role")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.role) return null;
  const role = data.role as string;
  if (role === "creator" || role === "administrator" || role === "member") {
    return role;
  }
  return "member";
}

export async function isChannelAdmin(
  channelId: string,
  userId: number
): Promise<boolean> {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_DEV_AUTH === "true" &&
    userId === 1
  ) {
    return true;
  }
  const role = await getChannelMemberRole(channelId, userId);
  return role != null && ADMIN_ROLES.has(role);
}

export async function getChannelMembers(channelId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("channel_members")
    .select(
      `
      user_id,
      role,
      last_verified_at,
      users (
        telegram_id,
        username,
        first_name,
        last_name,
        photo_url
      )
    `
    )
    .eq("channel_id", channelId)
    .order("last_verified_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
