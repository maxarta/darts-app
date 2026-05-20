import { getUserPhotoUrl } from "@/lib/db/users";
import { resolveAvatarUpstreamUrl } from "@/lib/telegram/user-photo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ telegramId: string }> }
) {
  const { telegramId: raw } = await params;
  const telegramId = Number(raw);
  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    return new Response(null, { status: 404 });
  }

  const storedPhotoUrl = await getUserPhotoUrl(telegramId);
  const fileUrl = await resolveAvatarUpstreamUrl(telegramId, storedPhotoUrl);
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
