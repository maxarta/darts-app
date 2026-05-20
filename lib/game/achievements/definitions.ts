import { ACHIEVEMENT_IMAGES } from "./images";
import type { AchievementDefinition, AchievementId } from "./types";

export const ACHIEVEMENTS: Record<AchievementId, AchievementDefinition> = {
  "triple-1": {
    id: "triple-1",
    imageSrc: ACHIEVEMENT_IMAGES["triple-1"],
    imageAlt: "Утроение 1",
    ariaLabel: "Утроение 1!",
  },
  "triple-20": {
    id: "triple-20",
    imageSrc: ACHIEVEMENT_IMAGES["triple-20"],
    imageAlt: "Утроение 20",
    ariaLabel: "Утроение 20!",
  },
  "triple-7": {
    id: "triple-7",
    imageSrc: ACHIEVEMENT_IMAGES["triple-7"],
    imageAlt: "Утроение 7",
    ariaLabel: "Утроение 7!",
  },
  bull: {
    id: "bull",
    imageSrc: ACHIEVEMENT_IMAGES.bull,
    imageAlt: "Булл",
    ariaLabel: "Булл!",
  },
  directhit: {
    id: "directhit",
    imageSrc: ACHIEVEMENT_IMAGES.directhit,
    imageAlt: "Прямое попадание",
    ariaLabel: "Два утроения 20!",
  },
  gagarin: {
    id: "gagarin",
    imageSrc: ACHIEVEMENT_IMAGES.gagarin,
    imageAlt: "Гагарин",
    ariaLabel: "Утроение 12 — Гагарин!",
  },
  "huzpa-classic": {
    id: "huzpa-classic",
    imageSrc: ACHIEVEMENT_IMAGES["huzpa-classic"],
    imageAlt: "Хутспа — классическая",
    ariaLabel: "Хутспа — классическая!",
  },
  "huzpa-special": {
    id: "huzpa-special",
    imageSrc: ACHIEVEMENT_IMAGES["huzpa-special"],
    imageAlt: "Хутспа — специальная",
    ariaLabel: "Хутспа — специальная!",
  },
  "huzpa-under": {
    id: "huzpa-under",
    imageSrc: ACHIEVEMENT_IMAGES["huzpa-under"],
    imageAlt: "Хутспа — недобор",
    ariaLabel: "Хутспа — недобор!",
  },
  miss: {
    id: "miss",
    imageSrc: ACHIEVEMENT_IMAGES.miss,
    imageAlt: "Промах",
    ariaLabel: "Промах!",
  },
  stefan: {
    id: "stefan",
    imageSrc: ACHIEVEMENT_IMAGES.stefan,
    imageAlt: "Стефан",
    ariaLabel: "Три утроения 20 — Стефан!",
  },
  "stefan-zero": {
    id: "stefan-zero",
    imageSrc: ACHIEVEMENT_IMAGES["stefan-zero"],
    imageAlt: "Стефан ноль",
    ariaLabel: "Три промаха подряд — Стефан ноль!",
  },
};

export function getAchievement(id: AchievementId): AchievementDefinition {
  return ACHIEVEMENTS[id];
}
