import { authenticateRequest, isWebSession, jsonError } from "@/lib/api/auth";
import {
  assertChannelMembership,
  removeChannelPlayer,
  updateChannelPlayer,
} from "@/lib/channel/manual-players";

type RouteParams = { params: Promise<{ channelId: string; userId: string }> };

async function requireMember(
  channelId: string,
  authUserId: number,
  initData: string
) {
  const isMember = await assertChannelMembership(channelId, authUserId);
  if (!isMember && !isWebSession(initData)) {
    return false;
  }
  return true;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { channelId, userId: raw } = await params;
  const userId = Number(raw);
  if (!Number.isFinite(userId)) return jsonError("Некорректный игрок", 400);

  if (
    !(await requireMember(channelId, auth.ctx.user.id, auth.ctx.initData))
  ) {
    return jsonError("Not a channel member", 403);
  }

  const body = await req.json().catch(() => ({}));
  const patch: { name?: string; photo_url?: string | null } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if ("photo_url" in body) {
    patch.photo_url =
      body.photo_url === null || typeof body.photo_url === "string"
        ? body.photo_url
        : undefined;
  }

  try {
    const member = await updateChannelPlayer(channelId, userId, patch);
    return Response.json({ member });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка";
    const status = message.includes("не в этом") ? 404 : 400;
    return jsonError(message, status);
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { channelId, userId: raw } = await params;
  const userId = Number(raw);
  if (!Number.isFinite(userId)) return jsonError("Некорректный игрок", 400);

  if (userId === auth.ctx.user.id) {
    return jsonError("Нельзя удалить себя из списка", 400);
  }

  if (
    !(await requireMember(channelId, auth.ctx.user.id, auth.ctx.initData))
  ) {
    return jsonError("Not a channel member", 403);
  }

  try {
    await removeChannelPlayer(channelId, userId);
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка";
    const status = message.includes("не в этом") ? 404 : 400;
    return jsonError(message, status);
  }
}
