import { authenticateRequest, isWebSession, jsonError } from "@/lib/api/auth";
import {

async function requireMember(channelId, authUserId, initData) {
  const isMember = await assertChannelMembership(channelId, authUserId);
  if (!isMember && !isWebSession(initData)) {
    return false;
  }
  return true;
}
export async function PATCH(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId, userId: raw } = await params;
  const userId = Number(raw);
  if (!Number.isFinite(userId)) return jsonError("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0438\u0433\u0440\u043E\u043A", 400);
  if (!await requireMember(channelId, auth.ctx.user.id, auth.ctx.initData)) {
    return jsonError("Not a channel member", 403);
  }
  const body = await req.json().catch(() => ({}));
  const patch = {};
  if (typeof body.name === "string") patch.name = body.name;
  if ("photo_url" in body) {
    patch.photo_url = body.photo_url === null || typeof body.photo_url === "string" ? body.photo_url : undefined;
  }
  try {
    const member = await updateChannelPlayer(channelId, userId, patch);
    return Response.json({ member });
  } catch (e) {
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430";
    const status = message.includes("\u043D\u0435 \u0432 \u044D\u0442\u043E\u043C") ? 404 : 400;
    return jsonError(message, status);
  }
}
export async function DELETE(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId, userId: raw } = await params;
  const userId = Number(raw);
  if (!Number.isFinite(userId)) return jsonError("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0438\u0433\u0440\u043E\u043A", 400);
  if (userId === auth.ctx.user.id) {
    return jsonError("\u041D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0435\u0431\u044F \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430", 400);
  }
  if (!await requireMember(channelId, auth.ctx.user.id, auth.ctx.initData)) {
    return jsonError("Not a channel member", 403);
  }
  try {
    await removeChannelPlayer(channelId, userId);
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430";
    const status = message.includes("\u043D\u0435 \u0432 \u044D\u0442\u043E\u043C") ? 404 : 400;
    return jsonError(message, status);
  }
}
