import type { StaticImageData } from "next/image";

export type AchievementId =
  | "triple-1"
  | "triple-7"
  | "triple-20"
  | "bull"
  | "directhit"
  | "gagarin"
  | "huzpa-classic"
  | "huzpa-special"
  | "huzpa-under"
  | "miss"
  | "stefan"
  | "stefan-zero"
  | "getdown"
  | "bitch"
  | "shta"
  | "stephan"
  | "shtosh"
  | "hoba";

export type AchievementDefinition = {
  id: AchievementId;
  imageSrc: StaticImageData;
  imageAlt: string;
  ariaLabel: string;
};
