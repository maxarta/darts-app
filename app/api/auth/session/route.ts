import { authenticateRequest, jsonError } from "@/lib/api/auth";
import { upsertUser } from "@/lib/db/users";
import { telegramAvatarPath } from "@/lib/telegram/user-photo";
import {
  ADMIN_ROLES,
  ensureChannel,
  registerChannelMember,
  type ChannelMemberRole,
} from "@/lib/db/channels";
import { ensureDevGuestsInChannel } from "@/lib/dev/guest-players";
import { parseStartParam } from "@/lib/telegram/init-data";
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
    const startParam =
      (body.startParam as string) ||
      (body.start_param as string) ||
      undefined;
    const { channelChatId } = parseStartParam(startParam);

    await upsertUser(auth.ctx.user);
    const user = {
      ...auth.ctx.user,
      photo_url:
        auth.ctx.user.photo_url &&
        auth.ctx.user.photo_url.startsWith("https://") &&
        !auth.ctx.user.photo_url.includes("api.telegram.org/file/bot")
          ? auth.ctx.user.photo_url
          : telegramAvatarPath(auth.ctx.user.id),
    };

    let channel = null;
    let isChannelAdmin = false;
    const chatId =
      channelChatId ??
      (auth.ctx.initData === "dev" ? -1000000000001 : undefined);

    if (chatId) {
      channel = await ensureChannel(
        chatId,
        body.channelTitle ??
          (auth.ctx.initData === "dev" ? "Dev Channel" : undefined)
      );
      const role: ChannelMemberRole = await registerChannelMember(
        channel.id,
        chatId,
        auth.ctx.user.id
      );
      isChannelAdmin = ADMIN_ROLES.has(role);
      if (auth.ctx.initData === "dev") {
        await ensureDevGuestsInChannel(channel.id, chatId);
      }
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
      return jsonError(
        "Откройте приложение из группы, где вы участник, через кнопку «Играть» после /start",
        403
      );
    }
    if (
      message.includes("Invalid URL") ||
      message.includes("SUPABASE_URL")
    ) {
      return jsonError(
        "Неверный SUPABASE_URL на сервере (нужен https://….supabase.co)",
        503
      );
    }
    if (
      message.includes("PGRST") ||
      message.includes("relation") ||
      message.includes("schema cache")
    ) {
      return jsonError(
        "Таблицы в Supabase не созданы — выполните supabase/migrations/001_initial.sql",
        503
      );
    }

    return jsonError(message, 500);
  }
}
