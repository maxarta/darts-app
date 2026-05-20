import { Bot } from "grammy";

let bot: Bot | null = null;

export function getTelegramBot(): Bot {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is required");
  if (!bot) {
    bot = new Bot(token);
  }
  return bot;
}
