"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ACHIEVEMENT_STACK_RANK } from "@/lib/game/achievements";
import type { ActiveAchievement } from "./useVisitAchievementQueue";
import { GameAchievementBadge } from "./GameAchievementBadge";
import styles from "./achievements.module.css";

const BASE_Z = 100;
const Z_STEP = 12;

type Props = {
  active: ActiveAchievement[];
  onRemove: (instanceId: string) => void;
  tv?: boolean;
};

export function GameAchievements({ active, onRemove, tv = false }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || active.length === 0) return null;

  return createPortal(
    <div className={styles.stack} data-game-achievement-stack aria-hidden>
      {active.map((item, index) => (
        <GameAchievementBadge
          key={item.instanceId}
          achievementId={item.id}
          zIndex={
            BASE_Z + ACHIEVEMENT_STACK_RANK[item.id] * Z_STEP + index
          }
          spreadIndex={index}
          spreadTotal={active.length}
          tv={tv}
          onDone={() => onRemove(item.instanceId)}
        />
      ))}
    </div>,
    document.body
  );
}
