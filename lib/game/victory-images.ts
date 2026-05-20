import type { StaticImageData } from "next/image";

import imgVictoryVampire from "@/assets/game/victory-vampire.webp";

export const VICTORY_VAMPIRE_IMAGE: StaticImageData = imgVictoryVampire;

let preloadPromise: Promise<void> | null = null;

/** Декодирует картинку вампира в память (бандл, без /public). */
export function preloadVictoryVampireImage(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (preloadPromise) return preloadPromise;

  preloadPromise = new Promise<void>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve();
    el.onerror = () =>
      reject(new Error("Failed to preload victory vampire image"));
    el.src = VICTORY_VAMPIRE_IMAGE.src;
  });

  return preloadPromise;
}
