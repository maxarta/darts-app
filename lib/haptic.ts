export type HapticImpact = "light" | "medium" | "heavy" | "rigid" | "soft";

let lastAt = 0;
let lastStyle: HapticImpact | "" = "";

/** Device tap. On iPhone this is a native impact; elsewhere a short vibration. */
export function hapticImpact(style: HapticImpact = "light") {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (style === lastStyle && now - lastAt < 90) return;
  lastAt = now;
  lastStyle = style;

  if (typeof window !== "undefined" && window.webkit?.messageHandlers?.dartsNative) {
    try {
      window.webkit.messageHandlers.dartsNative.postMessage({
        type: "haptic",
        style,
      });
      return;
    } catch {
      /* fall through */
    }
  }

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

/** Light tick for every enabled button press. */
export function installButtonHaptics() {
  if (typeof document === "undefined") return;
  const host = window as Window & { __dartsButtonHaptics?: boolean };
  if (host.__dartsButtonHaptics) return;
  host.__dartsButtonHaptics = true;
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button, [role='button']");
      if (!button) return;
      if (button instanceof HTMLButtonElement && button.disabled) return;
      if (button.getAttribute("aria-disabled") === "true") return;
      hapticImpact("light");
    },
    true
  );
}
