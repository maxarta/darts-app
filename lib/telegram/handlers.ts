import { Bot, type Context } from "grammy";

function webAppBaseUrl(): string {
  return (process.env.WEBAPP_URL ?? "https://artdart.vercel.app")
    .trim()
    .replace(/\/$/, "");
}

function botUsername(): string {
  return (process.env.BOT_USERNAME ?? "darts_kenny_bot").trim().replace(/^@/, "");
}

function channelStartParam(chatId: number): string {
  return `ch_${chatId}`;
}

function miniAppUrl(chatId: number): string {
  const base = webAppBaseUrl();
  const param = encodeURIComponent(channelStartParam(chatId));
  return `${base}?tgWebAppStartParam=${param}`;
}

function miniAppDeepLink(chatId: number): string {
  const param = encodeURIComponent(channelStartParam(chatId));
  return `https://t.me/${botUsername()}?startapp=${param}`;
}

const PLAY_BUTTON = "Играть в дартс";

function playKeyboard(chatId: number) {
  return {
    inline_keyboard: [
      [{ text: PLAY_BUTTON, web_app: { url: miniAppUrl(chatId) } }],
    ],
  };
}

const WELCOME_TEXT =
  "Я бот с приложением для подсчёта очков в дартс. Любой в этой группе может использовать его для игры. Участники выбираются только из этой группы. Ещё я умею делать турниры для участников группы.\n\n" +
  "Нажмите «Играть в дартс», чтобы считать очки, вести турниры и статистику для этой группы.\n" +
  "Статистика сквозная — все, кто играет просто или в турнире, попадают в статистику.\n\n" +
  "<b>Внимание!</b> Каждый желающий играть должен открыть приложение хотя бы один раз из этой группы.";

async function sendWelcome(ctx: Context) {
  const chat = ctx.chat;
  if (!chat) return;

  try {
    await ctx.reply(WELCOME_TEXT, {
      parse_mode: "HTML",
      reply_markup: playKeyboard(chat.id),
    });
    return;
  } catch (e) {
    console.error("[telegram] welcome with web_app failed", e);
  }

  try {
    await ctx.reply(WELCOME_TEXT, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: PLAY_BUTTON, url: miniAppDeepLink(chat.id) }],
        ],
      },
    });
    return;
  } catch (e) {
    console.error("[telegram] welcome with url button failed", e);
  }

  await ctx.reply(
    `${WELCOME_TEXT}\n\nОткройте ссылку:\n${miniAppDeepLink(chat.id)}`,
    { parse_mode: "HTML" }
  );
}

export function createBotWithHandlers(): Bot {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("BOT_TOKEN is not configured");
  }

  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    try {
      await sendWelcome(ctx);
    } catch (e) {
      console.error("[telegram] /start failed", e);
    }
  });

  bot.on("my_chat_member", async (ctx) => {
    const next = ctx.myChatMember.new_chat_member.status;
    if (next !== "member" && next !== "administrator") return;
    const prev = ctx.myChatMember.old_chat_member.status;
    if (prev === "member" || prev === "administrator") return;
    try {
      await sendWelcome(ctx);
    } catch (e) {
      console.error("[telegram] my_chat_member failed", e);
    }
  });

  bot.catch((err) => {
    console.error("[telegram] bot error", err);
  });

  return bot;
}
