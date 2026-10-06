"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectVisitAchievements,
  REPEATABLE_ACHIEVEMENT_IDS,
  sortAchievementsForStacking,
  type AchievementId,
} from "@/lib/game/achievements";
import { preloadAchievementImages } from "@/lib/game/achievements/images";
import type { ThrowInput } from "@/lib/darts/rules";
import { hapticImpact } from "@/lib/haptic";

export type ActiveAchievement = {
  instanceId: string;
  id: AchievementId;
};

type Options = {
  throws: ThrowInput[];
  enabled: boolean;
  onUnlock?: (ids: AchievementId[]) => void;
};

/** Пауза между ачивками в одной «пачке» (низкий слой → высокий). */
export const ACHIEVEMENT_STAGGER_MS = 480;

let instanceCounter = 0;

function createInstance(id: AchievementId): ActiveAchievement {
  return {
    id,
    instanceId: `${id}-${++instanceCounter}-${Date.now()}`,
  };
}

const repeatableSet = new Set<AchievementId>(REPEATABLE_ACHIEVEMENT_IDS);

export function useVisitAchievementQueue({
  throws,
  enabled,
  onUnlock,
}: Options) {
  const shownRef = useRef<Set<AchievementId>>(new Set());
  const prevThrowCountRef = useRef(0);
  const staggerTimersRef = useRef<number[]>([]);
  const [active, setActive] = useState<ActiveAchievement[]>([]);
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const clearStaggerTimers = useCallback(() => {
    for (const t of staggerTimersRef.current) window.clearTimeout(t);
    staggerTimersRef.current = [];
  }, []);

  useEffect(() => {
    if (throws.length === 0) {
      shownRef.current = new Set();
      prevThrowCountRef.current = 0;
    }
  }, [throws.length]);

  useEffect(() => {
    if (!enabled || throws.length === 0) return;

    const throwCountIncreased = throws.length > prevThrowCountRef.current;
    prevThrowCountRef.current = throws.length;

    const detected = detectVisitAchievements(throws);
    const novel = detected.filter((id) => {
      if (repeatableSet.has(id)) {
        return throwCountIncreased && throws.at(-1)?.segment === "miss";
      }
      return !shownRef.current.has(id);
    });

    if (novel.length === 0) return;

    for (const id of novel) {
      if (!repeatableSet.has(id)) shownRef.current.add(id);
    }

    const stacked = sortAchievementsForStacking(novel);
    let cancelled = false;

    void preloadAchievementImages()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;

        hapticImpact("medium");
        onUnlockRef.current?.(stacked);

        stacked.forEach((id, index) => {
          const timer = window.setTimeout(() => {
            if (cancelled) return;
            setActive((prev) => [...prev, createInstance(id)]);
          }, index * ACHIEVEMENT_STAGGER_MS);
          staggerTimersRef.current.push(timer);
        });
      });

    return () => {
      cancelled = true;
    };
  }, [throws, enabled, clearStaggerTimers]);

  useEffect(() => {
    return () => clearStaggerTimers();
  }, [clearStaggerTimers]);

  const removeInstance = useCallback((instanceId: string) => {
    setActive((prev) => prev.filter((a) => a.instanceId !== instanceId));
  }, []);

  const clearAll = useCallback(() => {
    clearStaggerTimers();
    setActive([]);
  }, [clearStaggerTimers]);

  return {
    active,
    removeInstance,
    clearAll,
  };
}
