import { getUserPhotoUrl } from "@/lib/db/users";
import {
  decodeDataImageUrl,
  isCustomClubPhoto,
  resolveAvatarUpstreamUrl,
} from "@/lib/telegram/user-photo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ telegramId: string }> }
) {
  const { telegramId: raw } = await params;
  const userId = Number(raw);
  // Club roster includes manual (negative) player ids — they only have DB photos.
  if (!Number.isFinite(userId) || !Number.isInteger(userId)) {
    return new Response(null, { status: 404 });
  }

  const storedPhotoUrl = await getUserPhotoUrl(userId);

  // Club-edited avatars live as data URLs in users.photo_url. TV boards always
  // request this proxy path (payloads never ship base64), so serve them here.
  if (storedPhotoUrl && isCustomClubPhoto(storedPhotoUrl)) {
    const decoded = decodeDataImageUrl(storedPhotoUrl);
    if (!decoded) {
      return new Response(null, { status: 404 });
    }
    return new Response(decoded.body, {
      headers: {
        "Content-Type": decoded.contentType,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  }

  if (userId <= 0) {
    return new Response(null, { status: 404 });
  }

  const fileUrl = await resolveAvatarUpstreamUrl(userId, storedPhotoUrl);
  if (!fileUrl) {
    return new Response(null, { status: 404 });
  }

  const upstream = await fetch(fileUrl);
  if (!upstream.ok) {
    return new Response(null, { status: 404 });
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
