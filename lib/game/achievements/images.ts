import type { StaticImageData } from "next/image";
import type { AchievementId } from "./types";

import imgTriple1 from "@/assets/achievements/1x3.webp";
import imgTriple7 from "@/assets/achievements/7x3.webp";
import imgTriple20 from "@/assets/achievements/20x3.webp";
import imgBull from "@/assets/achievements/bull.webp";
import imgDirecthit from "@/assets/achievements/directhit.webp";
import imgGagarin from "@/assets/achievements/gagarin.webp";
import imgHuzpaClassic from "@/assets/achievements/huzpa-classic.webp";
import imgHuzpaSpecial from "@/assets/achievements/huzpa-special.webp";
import imgHuzpaUnder from "@/assets/achievements/huzpa-under.webp";
import imgMiss from "@/assets/achievements/miss.webp";
import imgStefan from "@/assets/achievements/stefan.webp";
import imgStefanZero from "@/assets/achievements/stefan-zero.webp";

export const ACHIEVEMENT_IMAGES: Record<AchievementId, StaticImageData> = {
  "triple-1": imgTriple1,
  "triple-7": imgTriple7,
  "triple-20": imgTriple20,
  bull: imgBull,
  directhit: imgDirecthit,
  gagarin: imgGagarin,
  "huzpa-classic": imgHuzpaClassic,
  "huzpa-special": imgHuzpaSpecial,
  "huzpa-under": imgHuzpaUnder,
  miss: imgMiss,
  stefan: imgStefan,
  "stefan-zero": imgStefanZero,
};

const ALL_IMAGES = Object.values(ACHIEVEMENT_IMAGES);

let preloadPromise: Promise<void> | null = null;

/** Декодирует все ачивки в память (бандл Next, без сетевых запросов). */
export function preloadAchievementImages(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (preloadPromise) return preloadPromise;

  preloadPromise = Promise.all(
    ALL_IMAGES.map(
      (img) =>
        new Promise<void>((resolve, reject) => {
          const el = new window.Image();
          el.onload = () => resolve();
          el.onerror = () =>
            reject(new Error(`Failed to preload achievement: ${img.src}`));
          el.src = img.src;
        })
    )
  ).then(() => undefined);

  return preloadPromise;
}

export function getAchievementImage(id: AchievementId): StaticImageData {
  return ACHIEVEMENT_IMAGES[id];
}
