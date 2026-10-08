import {
  authenticateRequest,
  isWebSession,
  jsonError,
  WEB_CLUB_CHAT_ID,
} from "@/lib/api/auth";
import { getUserPhotoUrl, upsertUser } from "@/lib/db/users";
import { pickPhotoUrlToStore } from "@/lib/user-photo";
import {
  ADMIN_ROLES,
  ensureChannel,
  registerChannelMember,
  type ChannelMemberRole,
} from "@/lib/db/channels";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const auth = authenticateRequest(req as import("next/server").NextRequest);
    if (!auth.ok) return jsonError(auth.error, auth.status);

    if (!isSupabaseConfigured()) {
      return jsonError(
        "База не настроена: добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY на Vercel",
        503
      );
    }

    const body = await req.json().catch(() => ({}));

    await upsertUser(auth.ctx.user);
    const storedPhotoUrl = await getUserPhotoUrl(auth.ctx.user.id);
    const user = {
      ...auth.ctx.user,
      photo_url: pickPhotoUrlToStore(
        auth.ctx.user.id,
        auth.ctx.user.photo_url,
        storedPhotoUrl
      ),
    };

    let channel = null;
    let isChannelAdmin = false;
    const web = isWebSession(auth.ctx.initData);
    const chatId = WEB_CLUB_CHAT_ID;

    if (chatId) {
      channel = await ensureChannel(
        chatId,
        body.channelTitle ?? (web ? "Клуб" : undefined)
      );
      const role: ChannelMemberRole = await registerChannelMember(
        channel.id,
        chatId,
        auth.ctx.user.id,
        web ? "creator" : undefined
      );
      isChannelAdmin = ADMIN_ROLES.has(role);
    }

    return Response.json({
      user,
      channel,
      isChannelAdmin,
    });
  } catch (e) {
    console.error("[auth/session]", e);
    const message = e instanceof Error ? e.message : "Server error";

    if (message === "NOT_CHANNEL_MEMBER") {
      return jsonError("Нет доступа к этому клубу", 403);
    }
    if (
      message.includes("Invalid URL") ||
      message.includes("SUPABASE") ||
      message.includes("fetch failed")
    ) {
      return jsonError(
        "Не удалось подключиться к базе. Проверьте SUPABASE_URL на Vercel.",
        503
      );
    }
    return jsonError(message, 500);
  }
}
