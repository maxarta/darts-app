import { WEB_CLUB_CHAT_ID } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTelegramBot } from "@/lib/telegram/bot";

const MEMBER_STATUSES = new Set([
  "creator",
  "administrator",
  "member",
]);

export const ADMIN_ROLES = new Set(["creator", "administrator"]);

export type ChannelMemberRole = "creator" | "administrator" | "member";

export function roleFromTelegramStatus(status: string): ChannelMemberRole {
  if (status === "creator" || status === "administrator") return status;
  return "member";
}

export async function fetchTelegramMemberRole(
  telegramChatId: number,
  userId: number
): Promise<ChannelMemberRole> {
  try {
    const bot = getTelegramBot();
    const member = await bot.api.getChatMember(telegramChatId, userId);
    return roleFromTelegramStatus(member.status);
  } catch {
    return "member";
  }
}

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
      title: title ?? `Channel ${telegramChatId}`,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function verifyChannelMembership(
  telegramChatId: number,
  userId: number
): Promise<boolean> {
  try {
    const bot = getTelegramBot();
    const member = await bot.api.getChatMember(telegramChatId, userId);
    return MEMBER_STATUSES.has(member.status);
  } catch {
    return false;
  }
}

export async function registerChannelMember(
  channelId: string,
  telegramChatId: number,
  userId: number,
  role?: ChannelMemberRole
) {
  const skipVerify =
    telegramChatId === WEB_CLUB_CHAT_ID ||
    (process.env.NODE_ENV === "development" &&
      process.env.ALLOW_DEV_AUTH === "true");

  let resolvedRole = role;
  if (!skipVerify) {
    const isMember = await verifyChannelMembership(telegramChatId, userId);
    if (!isMember) {
      throw new Error("NOT_CHANNEL_MEMBER");
    }
    resolvedRole = await fetchTelegramMemberRole(telegramChatId, userId);
  } else if (!resolvedRole) {
    resolvedRole = userId === 1 ? "creator" : "member";
  }

  const db = getSupabaseAdmin();
  const { error } = await db.from("channel_members").upsert(
    {
      channel_id: channelId,
      user_id: userId,
      role: resolvedRole ?? "member",
      last_verified_at: new Date().toISOString(),
    },
    { onConflict: "channel_id,user_id" }
  );
  if (error) throw error;
  return resolvedRole ?? "member";
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
