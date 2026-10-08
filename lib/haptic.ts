export type HapticImpact = "light" | "medium" | "heavy" | "rigid" | "soft";

/** Device vibration when available (no Telegram WebApp). */
export function hapticImpact(style: HapticImpact = "light") {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const ms =
    style === "heavy" || style === "rigid"
      ? 24
      : style === "medium"
        ? 14
        : 8;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
