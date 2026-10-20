"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  onDone,
}: {
  points: number;
  spreadIndex: number;
  onDone: () => void;
}) {
  // Lock toss path at mount — later bursts must not rewrite CSS vars mid-flight.
  const tossRef = useRef<CSSProperties | null>(null);
  if (!tossRef.current) {
    const lane = (spreadIndex % 3) / 2;
    tossRef.current = {
      "--peak-x": `${((lane - 0.5) * 28).toFixed(2)}vw`,
      "--peak-y": `${(-(58 + (spreadIndex % 3) * 4)).toFixed(2)}vh`,
      "--launch-rotate": `${(-8 + lane * 16).toFixed(2)}deg`,
    } as CSSProperties;
  }

  return (
    <div
      className={styles.burst}
      style={tossRef.current}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onDone();
      }}
    >
      <span className={styles.value}>+{points}</span>
    </div>
  );
}
