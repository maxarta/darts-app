export type HapticImpact = "light" | "medium" | "heavy" | "rigid" | "soft";

export function hapticImpact(style: HapticImpact = "light") {
  void import("@twa-dev/sdk").then(({ default: WebApp }) => {
    WebApp.HapticFeedback?.impactOccurred(style);
  });
}
