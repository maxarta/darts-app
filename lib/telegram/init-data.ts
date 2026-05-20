import crypto from "crypto";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export function parseInitData(initData: string): Record<string, string> {
  const params = new URLSearchParams(initData);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export function validateInitData(
  initData: string,
  botToken: string
): { valid: boolean; user?: TelegramUser } {
  if (!initData || !botToken) {
    return { valid: false };
  }

  const params = parseInitData(initData);
  const hash = params.hash;
  if (!hash) return { valid: false };

  const dataCheckString = Object.keys(params)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (calculatedHash !== hash) {
    return { valid: false };
  }

  const authDate = Number(params.auth_date);
  if (authDate && Date.now() / 1000 - authDate > 86400) {
    return { valid: false };
  }

  let user: TelegramUser | undefined;
  if (params.user) {
    try {
      user = JSON.parse(params.user) as TelegramUser;
    } catch {
      return { valid: false };
    }
  }

  return { valid: true, user };
}

export function parseStartParam(startParam?: string): {
  channelChatId?: number;
} {
  if (!startParam) return {};
  const match = startParam.match(/^ch_(-?\d+)$/);
  if (match) {
    return { channelChatId: Number(match[1]) };
  }
  return {};
}
