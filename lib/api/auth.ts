export type AppUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export type AuthContext = {
  user: AppUser;
  /** Always `"web"` after Telegram removal. */
  initData: string;
};

/** Local club chat id used for plain web sessions. */
export const WEB_CLUB_CHAT_ID = -1000000000001;

/** Synthetic chat id for temporary (guest) local-only sessions. */
export const GUEST_CLUB_CHAT_ID = -1000000000002;

function isWebAuthHeader(req: Request): boolean {
  const web = req.headers.get("x-web-auth");
  const legacy = req.headers.get("x-dev-auth");
  return web === "local" || legacy === "local";
}

/** Browser / web app session — no Telegram. */
function webAuthUser(): AppUser {
  return {
    id: 1,
    first_name: "Игрок",
  };
}

export function authenticateRequest(
  req: Request
): { ok: true; ctx: AuthContext } | { ok: false; error: string; status: number } {
  if (!isWebAuthHeader(req)) {
    return { ok: false, error: "Missing auth", status: 401 };
  }

  return { ok: true, ctx: { user: webAuthUser(), initData: "web" } };
}

export function isWebSession(initData: string): boolean {
  return initData === "web" || initData === "dev";
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
