import { resolveStoredPhotoUrl } from "@/lib/user-photo";

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
  // Prefer first_name so manual rename always wins over username
  return user.first_name || user.username || String(userId);
}

export function photoFor(
  userId: number,
  user: MemberUser | null,
  session: { id: number; photo_url?: string } | undefined
): string | null {
  // Prefer the roster/DB photo (incl. manual data-URL avatars) over session.
  const fromUser = resolveStoredPhotoUrl(userId, user?.photo_url);
  if (fromUser) return fromUser;
  if (userId === session?.id && session.photo_url) {
    return resolveStoredPhotoUrl(userId, session.photo_url);
  }
  return null;
}
