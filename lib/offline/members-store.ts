"use client";

import type { ChannelMember } from "@/lib/channel/members";
import {
  idbRequest,
  idbTxDone,
  openOfflineDb,
  STORE_MEMBERS,
  STORE_PENDING_MEMBERS,
} from "./db";

export type MembersCacheRow = {
  channelId: string;
  members: ChannelMember[];
  updatedAt: number;
};

export type PendingMemberOp =
  | {
      id: string;
      channelId: string;
      type: "create";
      localUserId: number;
      name: string;
      photo_url: string | null;
      createdAt: number;
    }
  | {
      id: string;
      channelId: string;
      type: "update";
      userId: number;
      name?: string;
      photo_url?: string | null;
      createdAt: number;
    }
  | {
      id: string;
      channelId: string;
      type: "delete";
      userId: number;
      createdAt: number;
    };

export function allocateLocalPlayerId(): number {
  return -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
}

export async function readCachedMembers(
  channelId: string
): Promise<ChannelMember[]> {
  const db = await openOfflineDb();
  try {
    const row = await idbRequest<MembersCacheRow | undefined>(
      db.transaction(STORE_MEMBERS, "readonly").objectStore(STORE_MEMBERS).get(channelId)
    );
    return row?.members ?? [];
  } finally {
    db.close();
  }
}

export async function writeCachedMembers(
  channelId: string,
  members: ChannelMember[]
): Promise<void> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(STORE_MEMBERS, "readwrite");
    tx.objectStore(STORE_MEMBERS).put({
      channelId,
      members,
      updatedAt: Date.now(),
    } satisfies MembersCacheRow);
    await idbTxDone(tx);
  } finally {
    db.close();
  }
}

export async function listPendingMemberOps(
  channelId?: string
): Promise<PendingMemberOp[]> {
  const db = await openOfflineDb();
  try {
    const all = await idbRequest<PendingMemberOp[]>(
      db
        .transaction(STORE_PENDING_MEMBERS, "readonly")
        .objectStore(STORE_PENDING_MEMBERS)
        .getAll()
    );
    const list = all ?? [];
    return channelId
      ? list.filter((op) => op.channelId === channelId)
      : list.sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}

export async function enqueuePendingMemberOp(
  op: PendingMemberOp
): Promise<void> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(STORE_PENDING_MEMBERS, "readwrite");
    tx.objectStore(STORE_PENDING_MEMBERS).put(op);
    await idbTxDone(tx);
  } finally {
    db.close();
  }
}

export async function removePendingMemberOp(id: string): Promise<void> {
  const db = await openOfflineDb();
  try {
    const tx = db.transaction(STORE_PENDING_MEMBERS, "readwrite");
    tx.objectStore(STORE_PENDING_MEMBERS).delete(id);
    await idbTxDone(tx);
  } finally {
    db.close();
  }
}

export function upsertMemberInList(
  members: ChannelMember[],
  member: ChannelMember
): ChannelMember[] {
  const idx = members.findIndex((m) => m.user_id === member.user_id);
  if (idx === -1) return [member, ...members];
  const next = members.slice();
  next[idx] = member;
  return next;
}

export function removeMemberFromList(
  members: ChannelMember[],
  userId: number
): ChannelMember[] {
  return members.filter((m) => m.user_id !== userId);
}

export function remapMemberIdInList(
  members: ChannelMember[],
  fromId: number,
  toId: number
): ChannelMember[] {
  return members.map((m) =>
    m.user_id === fromId ? { ...m, user_id: toId } : m
  );
}
