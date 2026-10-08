"use client";

import {
  CLUB_AVATAR_MAX_SIDE,
  CLUB_AVATAR_QUALITY,
  MAX_PHOTO_DATA_URL_CHARS,
} from "@/lib/channel/player-photo";

/** Compress image file to a JPEG data URL sized for TV + phone avatars. */
export async function compressImageToDataUrl(
  file: File,
  maxSide = CLUB_AVATAR_MAX_SIDE,
  quality = CLUB_AVATAR_QUALITY
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Не удалось обработать фото");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Prefer higher quality first; step down only if the data URL won't fit.
  const qualities = [quality, 0.85, 0.78, 0.7, 0.62];
  for (const q of qualities) {
    const dataUrl = canvas.toDataURL("image/jpeg", q);
    if (dataUrl.length <= MAX_PHOTO_DATA_URL_CHARS) return dataUrl;
  }

  throw new Error("Фото слишком большое — выберите другое");
}
