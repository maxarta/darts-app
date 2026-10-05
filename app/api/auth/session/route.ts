import {
import { getUserPhotoUrl, upsertUser } from "@/lib/db/users";
import { pickPhotoUrlToStore } from "@/lib/telegram/user-photo";
import {
import { parseStartParam } from "@/lib/telegram/init-data";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!isSupabaseConfigured()) {
      return jsonError(
        "\u0411\u0430\u0437\u0430 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0430: \u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 SUPABASE_URL \u0438 SUPABASE_SERVICE_ROLE_KEY \u043D\u0430 Vercel",
        503
      );
    }
    const body = await req.json().catch(() => ({}));
    const startParam = body.startParam || body.start_param || undefined;
    const { channelChatId } = parseStartParam(startParam);
    await upsertUser(auth.ctx.user);
    const stored = await getUserProfile(auth.ctx.user.id);
    const user = {
      ...auth.ctx.user,
      first_name: stored?.first_name || auth.ctx.user.first_name,
      username: stored?.username ?? auth.ctx.user.username,
      photo_url: resolveStoredPhotoUrl(auth.ctx.user.id, stored?.photo_url) ?? auth.ctx.user.photo_url
    };
    let channel = null;
    let isChannelAdmin2 = false;
    const web = isWebSession(auth.ctx.initData);
    const chatId = channelChatId ?? (web ? WEB_CLUB_CHAT_ID : undefined);
    if (chatId) {
      channel = await ensureChannel(
        chatId,
        body.channelTitle ?? (web ? "\u041A\u043B\u0443\u0431" : undefined)
      );
      const role = await registerChannelMember(
        channel.id,
        chatId,
        auth.ctx.user.id,
        web ? "creator" : undefined
      );
      isChannelAdmin2 = ADMIN_ROLES.has(role);
    }
    return Response.json({
      user,
      channel,
      isChannelAdmin: isChannelAdmin2
    });
  } catch (e) {
    console.error("[auth/session]", e);
    const message = e instanceof Error ? e.message : "Server error";
    if (message === "NOT_CHANNEL_MEMBER") {
      return jsonError("\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u044D\u0442\u043E\u043C\u0443 \u043A\u043B\u0443\u0431\u0443", 403);
    }
    if (message.includes("Invalid URL") || message.includes("SUPABASE_URL")) {
      return jsonError(
        "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 SUPABASE_URL \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435 (\u043D\u0443\u0436\u0435\u043D https://\u2026.supabase.co)",
        503
      );
    }
    if (message.includes("PGRST") || message.includes("relation") || message.includes("schema cache")) {
      return jsonError(
        "\u0422\u0430\u0431\u043B\u0438\u0446\u044B \u0432 Supabase \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u044B \u2014 \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0435 supabase/migrations/001_initial.sql",
        503
      );
    }
    return jsonError(message, 500);
  }
}
