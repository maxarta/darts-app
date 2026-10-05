"use client";

import { apiFetch } from "@/lib/api/client";
import { isGuestMode } from "@/lib/app-mode";
import type { ChannelMember } from "@/lib/channel/members";
import { isOnline } from "@/lib/game/sync/client";
import { isProbablyOfflineError } from "./session-cache";
import {
  allocateLocalPlayerId,
  enqueuePendingMemberOp,
  listPendingMemberOps,
  readCachedMembers,
  removeMemberFromList,
  removePendingMemberOp,
  upsertMemberInList,
  writeCachedMembers,
  type PendingMemberOp,
} from "./members-store";
import { remapLocalPlayerId } from "./remap-player";

function memberFromFields(
  userId: number,
  name: string,
  photoUrl: string | null
): ChannelMember {
  return {
    user_id: userId,
    users: {
      first_name: name.trim(),
      username: null,
      photo_url: photoUrl,
    },
  };
}

async function saveLocalOnly(
  channelId: string,
  name: string,
  photoUrl: string | null
): Promise<ChannelMember> {
  const localUserId = allocateLocalPlayerId();
  const member = memberFromFields(localUserId, name, photoUrl);
  const members = await readCachedMembers(channelId);
  await writeCachedMembers(channelId, upsertMemberInList(members, member));
  return member;
}

export async function loadChannelMembers(
  channelId: string
): Promise<ChannelMember[]> {
  const cached = await readCachedMembers(channelId);

  // Temporary (guest) mode never reads/writes members on the server.
  if (isGuestMode() || !isOnline()) return cached;

  try {
    const data = await apiFetch<{ members: ChannelMember[] }>(
      `/api/channels/${channelId}/members`
    );
    await writeCachedMembers(channelId, data.members);
    return data.members;
  } catch (err) {
    if (cached.length > 0 || isProbablyOfflineError(err)) return cached;
    throw err;
  }
}

export async function createChannelPlayerOfflineFirst(
  channelId: string,
  name: string,
  photoUrl: string | null
): Promise<ChannelMember> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Введите имя");

  if (isGuestMode()) {
    return saveLocalOnly(channelId, trimmed, photoUrl);
  }

  if (isOnline()) {
    try {
      const data = await apiFetch<{ member: ChannelMember }>(
        `/api/channels/${channelId}/players`,
        {
          method: "POST",
          body: JSON.stringify({ name: trimmed, photo_url: photoUrl }),
        }
      );
      const members = await readCachedMembers(channelId);
      await writeCachedMembers(
        channelId,
        upsertMemberInList(members, data.member)
      );
      return data.member;
    } catch (err) {
      if (!isProbablyOfflineError(err)) throw err;
    }
  }

  const member = await saveLocalOnly(channelId, trimmed, photoUrl);
  await enqueuePendingMemberOp({
    id: crypto.randomUUID(),
    channelId,
    type: "create",
    localUserId: member.user_id,
    name: trimmed,
    photo_url: photoUrl,
    createdAt: Date.now(),
  });
  return member;
}

export async function updateChannelPlayerOfflineFirst(
  channelId: string,
  userId: number,
  patch: { name?: string; photo_url?: string | null }
): Promise<ChannelMember> {
  const guest = isGuestMode();

  if (!guest && isOnline()) {
    try {
      const data = await apiFetch<{ member: ChannelMember }>(
        `/api/channels/${channelId}/players/${userId}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        }
      );
      const members = await readCachedMembers(channelId);
      await writeCachedMembers(
        channelId,
        upsertMemberInList(members, data.member)
      );
      return data.member;
    } catch (err) {
      if (!isProbablyOfflineError(err)) throw err;
    }
  }

  const members = await readCachedMembers(channelId);
  const existing = members.find((m) => m.user_id === userId);
  const current = Array.isArray(existing?.users)
    ? existing?.users[0]
    : existing?.users;
  const nextName =
    patch.name?.trim() || current?.first_name || String(userId);
  const nextPhoto =
    patch.photo_url !== undefined ? patch.photo_url : current?.photo_url ?? null;
  const member = memberFromFields(userId, nextName, nextPhoto);
  await writeCachedMembers(channelId, upsertMemberInList(members, member));
  if (!guest) {
    await enqueuePendingMemberOp({
      id: crypto.randomUUID(),
      channelId,
      type: "update",
      userId,
      name: patch.name,
      photo_url: patch.photo_url,
      createdAt: Date.now(),
    });
  }
  return member;
}

export async function deleteChannelPlayerOfflineFirst(
  channelId: string,
  userId: number
): Promise<void> {
  const guest = isGuestMode();

  if (!guest && isOnline()) {
    try {
      await apiFetch(`/api/channels/${channelId}/players/${userId}`, {
        method: "DELETE",
      });
      const members = await readCachedMembers(channelId);
      await writeCachedMembers(
        channelId,
        removeMemberFromList(members, userId)
      );
      return;
    } catch (err) {
      if (!isProbablyOfflineError(err)) throw err;
    }
  }

  const members = await readCachedMembers(channelId);
  await writeCachedMembers(channelId, removeMemberFromList(members, userId));
  if (!guest) {
    await enqueuePendingMemberOp({
      id: crypto.randomUUID(),
      channelId,
      type: "delete",
      userId,
      createdAt: Date.now(),
    });
  }
}

async function flushOp(op: PendingMemberOp): Promise<void> {
  if (op.type === "create") {
    const data = await apiFetch<{ member: ChannelMember }>(
      `/api/channels/${op.channelId}/players`,
      {
        method: "POST",
        body: JSON.stringify({ name: op.name, photo_url: op.photo_url }),
      }
    );
    await remapLocalPlayerId(
      op.channelId,
      op.localUserId,
      data.member.user_id
    );
    const members = await readCachedMembers(op.channelId);
    await writeCachedMembers(
      op.channelId,
      upsertMemberInList(members, data.member)
    );
    return;
  }

  if (op.type === "update") {
    const body: { name?: string; photo_url?: string | null } = {};
    if (op.name !== undefined) body.name = op.name;
    if (op.photo_url !== undefined) body.photo_url = op.photo_url;
    const data = await apiFetch<{ member: ChannelMember }>(
      `/api/channels/${op.channelId}/players/${op.userId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
    const members = await readCachedMembers(op.channelId);
    await writeCachedMembers(
      op.channelId,
      upsertMemberInList(members, data.member)
    );
    return;
  }

  await apiFetch(`/api/channels/${op.channelId}/players/${op.userId}`, {
    method: "DELETE",
  });
  const members = await readCachedMembers(op.channelId);
  await writeCachedMembers(
    op.channelId,
    removeMemberFromList(members, op.userId)
  );
}

export async function syncPendingMembers(): Promise<void> {
  if (isGuestMode() || !isOnline()) return;
  const ops = await listPendingMemberOps();
  for (const op of ops) {
    try {
      await flushOp(op);
      await removePendingMemberOp(op.id);
    } catch (err) {
      console.warn("[offline] member sync failed", op.id, err);
      // Stop on first hard failure so order stays consistent.
      if (!isProbablyOfflineError(err)) {
        // Keep going for 404/validation on stale deletes.
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("не в этом") && !msg.includes("Not a channel")) {
          break;
        }
        await removePendingMemberOp(op.id);
      } else {
        break;
      }
    }
  }
}
