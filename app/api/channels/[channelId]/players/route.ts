import { authenticateRequest, isWebSession, jsonError } from "@/lib/api/auth";
import {
  assertChannelMembership,
  createManualChannelPlayer,
} from "@/lib/channel/manual-players";
import { getChannelMembers } from "@/lib/db/channels";
import { resolveStoredPhotoUrl } from "@/lib/user-photo";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
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
        photo_url: resolveStoredPhotoUrl(m.user_id as number, u.photo_url),
      },
    };
  });

  return Response.json({ members: membersWithPhotos });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = authenticateRequest(req as import("next/server").NextRequest);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { channelId } = await params;
  const isMember = await assertChannelMembership(channelId, auth.ctx.user.id);
  if (!isMember && !isWebSession(auth.ctx.initData)) {
    return jsonError("Not a channel member", 403);
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "";
  const photoUrl =
    body.photo_url === null || typeof body.photo_url === "string"
      ? body.photo_url
      : undefined;

  try {
    const player = await createManualChannelPlayer(channelId, name, photoUrl);
    return Response.json({ member: player }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка";
    return jsonError(message, 400);
  }
}
