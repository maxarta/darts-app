"use client";

/** Compress image file to a small JPEG data URL for avatar storage. */
export async function compressImageToDataUrl(
  file: File,
  maxSide = 256,
  quality = 0.72
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

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  if (dataUrl.length > 180_000) {
    throw new Error("Фото слишком большое — выберите другое");
  }
  return dataUrl;
}
