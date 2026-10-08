import { getUserPhotoUrl } from "@/lib/db/users";
import {
  decodeDataImageUrl,
  isCustomClubPhoto,
} from "@/lib/user-photo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: raw } = await params;
  const userId = Number(raw);
  if (!Number.isFinite(userId) || !Number.isInteger(userId)) {
    return new Response(null, { status: 404 });
  }

  const storedPhotoUrl = await getUserPhotoUrl(userId);

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

  return new Response(null, { status: 404 });
}
