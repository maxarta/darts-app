import { authenticateRequest, isWebSession, jsonError } from "@/lib/api/auth";
import {
import { getChannelMembers } from "@/lib/db/channels";
import { resolveStoredPhotoUrl } from "@/lib/telegram/user-photo";

export async function GET(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId } = await params;
  const isMember = await assertChannelMembership(channelId, auth.ctx.user.id);
  if (!isMember && !isWebSession(auth.ctx.initData)) {
    return jsonError("Not a channel member", 403);
  }
  const members = await getChannelMembers(channelId);
  const membersWithPhotos = members.map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    if (!u) return m;
    return {
      ...m,
      users: {
        ...u,
        photo_url: resolveStoredPhotoUrl(m.user_id, u.photo_url)
      }
    };
  });
  return Response.json({ members: membersWithPhotos });
}
export async function POST(req: Request, { params }: { params: Promise<Record<string, string>> }) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  const { channelId } = await params;
  const isMember = await assertChannelMembership(channelId, auth.ctx.user.id);
  if (!isMember && !isWebSession(auth.ctx.initData)) {
    return jsonError("Not a channel member", 403);
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "";
  const photoUrl = body.photo_url === null || typeof body.photo_url === "string" ? body.photo_url : undefined;
  try {
    const player = await createManualChannelPlayer(channelId, name, photoUrl);
    return Response.json({ member: player }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430";
    return jsonError(message, 400);
  }
}
