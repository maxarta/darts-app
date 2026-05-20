import { resolveStoredPhotoUrl } from "@/lib/telegram/user-photo";

export type MemberUser = {
  first_name: string;
  username: string | null;
  photo_url: string | null;
};

export type ChannelMember = {
  user_id: number;
  users: MemberUser | MemberUser[] | null;
};

export function resolveUser(member: ChannelMember): MemberUser | null {
  const u = member.users;
  if (!u) return null;
  return Array.isArray(u) ? (u[0] ?? null) : u;
}

export function displayName(user: MemberUser | null, userId: number): string {
  if (!user) return String(userId);
  return user.username ?? user.first_name ?? String(userId);
}

export function photoFor(
  userId: number,
  user: MemberUser | null,
  session: { id: number; photo_url?: string } | undefined
): string {
  if (userId === session?.id && session.photo_url) {
    return resolveStoredPhotoUrl(userId, session.photo_url);
  }
  return resolveStoredPhotoUrl(userId, user?.photo_url);
}
