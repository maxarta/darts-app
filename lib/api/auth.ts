import { NextRequest } from "next/server";
import {
  validateInitData,
  type TelegramUser,
} from "@/lib/telegram/init-data";

export type AuthContext = {
  user: TelegramUser;
  initData: string;
};

/** Local club chat id used for plain web sessions (not a Telegram chat). */
export const WEB_CLUB_CHAT_ID = -1000000000001;

export function getInitDataFromRequest(req: NextRequest): string | null {
  const header = req.headers.get("x-telegram-init-data");
  if (header) return header;
  const url = new URL(req.url);
  return url.searchParams.get("initData");
}

function isWebAuthHeader(req: NextRequest): boolean {
  const web = req.headers.get("x-web-auth");
  const legacy = req.headers.get("x-dev-auth");
  return web === "local" || legacy === "local";
}

/** Browser / web app guest — no Telegram required. */
function webAuthUser(req: NextRequest): TelegramUser | null {
  if (!isWebAuthHeader(req)) return null;
  // Prefer Telegram when both are present
  const initData = getInitDataFromRequest(req);
  if (initData && initData.length > 0 && initData !== "dev") return null;

  return {
    id: 1,
    first_name: "Игрок",
  };
}

export function authenticateRequest(
  req: NextRequest
): { ok: true; ctx: AuthContext } | { ok: false; error: string; status: number } {
  const webUser = webAuthUser(req);
  if (webUser) {
    return { ok: true, ctx: { user: webUser, initData: "web" } };
  }

  const initData = getInitDataFromRequest(req);
  if (!initData) {
    return { ok: false, error: "Missing auth", status: 401 };
  }

  const botToken = process.env.BOT_TOKEN?.trim();
  if (!botToken) {
    return { ok: false, error: "Server misconfigured", status: 500 };
  }

  const { valid, user } = validateInitData(initData, botToken);
  if (!valid || !user) {
    return { ok: false, error: "Invalid init data", status: 401 };
  }

  return { ok: true, ctx: { user, initData } };
}

export function isWebSession(initData: string): boolean {
  return initData === "web" || initData === "dev";
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
