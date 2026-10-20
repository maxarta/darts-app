"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getAchievement } from "@/lib/game/achievements";
import type { AchievementId } from "@/lib/game/achievements";
import styles from "./achievements.module.css";

type Props = {
  achievementId: AchievementId;
  zIndex: number;
  spreadIndex: number;
  spreadTotal: number;
  onDone: () => void;
  /** Larger sticker for the TV. The phone keeps the compact size. */
  tv?: boolean;
};

/** Пик в видимой середине экрана (детерминировано — без Math.random для SSR). */
function computeToss(spreadIndex: number, spreadTotal: number) {
  if (spreadTotal <= 1) {
    return {
      peakX: 0,
      peakY: -68,
      launchRotate: 0,
      peakRotate: 0,
    };
  }

  const lane = spreadIndex / (spreadTotal - 1);

  return {
    peakX: (lane - 0.5) * 36,
    peakY: -(64 + (spreadIndex % 3) * 5),
    launchRotate: -14 + lane * 28,
    peakRotate: -12 + lane * 24,
  };
}

export function GameAchievementBadge({
  achievementId,
  zIndex,
  spreadIndex,
  spreadTotal,
  onDone,
  tv = false,
}: Props) {
  const def = getAchievement(achievementId);
  const toss = useRef(computeToss(spreadIndex, spreadTotal));
  if (!def) return null;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const src = def.imageSrc.src;
    const probe = new window.Image();
    probe.src = src;
    if (probe.complete && probe.naturalWidth > 0) setReady(true);
  }, [achievementId, def.imageSrc.src]);

  return (
    <div
      className={[
        styles.badge,
        tv ? styles.badgeTv : "",
        ready ? styles.badgeReady : styles.badgePending,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          zIndex,
          "--peak-x": `${toss.current.peakX.toFixed(2)}vw`,
          "--peak-y": `${toss.current.peakY.toFixed(2)}vh`,
          "--launch-rotate": `${toss.current.launchRotate.toFixed(2)}deg`,
          "--peak-rotate": `${toss.current.peakRotate.toFixed(2)}deg`,
        } as CSSProperties
      }
      role="status"
      aria-live="polite"
      aria-label={def.ariaLabel}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && ready) onDone();
      }}
    >
      <Image
        src={def.imageSrc}
        alt={def.imageAlt}
        className={styles.img}
        sizes={tv ? "460px" : "(max-width: 480px) 76vw, 300px"}
        priority
        onLoad={() => setReady(true)}
      />
    </div>
  );
}
