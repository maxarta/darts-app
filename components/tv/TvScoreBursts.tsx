"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import styles from "./tvScoreBurst.module.css";

export type TvScoreBurstItem = {
  instanceId: string;
  points: number;
};

type Props = {
  active: TvScoreBurstItem[];
  onRemove: (instanceId: string) => void;
};

export function TvScoreBursts({ active, onRemove }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || active.length === 0) return null;

  return createPortal(
    <div className={styles.stack} data-tv-score-burst-stack aria-hidden>
      {active.map((item, index) => (
        <TvScoreBurstBadge
          key={item.instanceId}
          points={item.points}
          spreadIndex={index}
          spreadTotal={active.length}
          onDone={() => onRemove(item.instanceId)}
        />
      ))}
    </div>,
    document.body
  );
}

function TvScoreBurstBadge({
  points,
  spreadIndex,
  spreadTotal,
  onDone,
}: {
  points: number;
  spreadIndex: number;
  spreadTotal: number;
  onDone: () => void;
}) {
  const lane =
    spreadTotal <= 1 ? 0.5 : spreadIndex / Math.max(1, spreadTotal - 1);
  const peakX = (lane - 0.5) * 28;
  const peakY = -(58 + (spreadIndex % 3) * 4);
  const launchRotate = -8 + lane * 16;

  return (
    <div
      className={styles.burst}
      style={
        {
          "--peak-x": `${peakX.toFixed(2)}vw`,
          "--peak-y": `${peakY.toFixed(2)}vh`,
          "--launch-rotate": `${launchRotate.toFixed(2)}deg`,
        } as CSSProperties
      }
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onDone();
      }}
    >
      <span className={styles.value}>+{points}</span>
    </div>
  );
}
