"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./animatedNumber.module.css";

/** Короче этой паузы между изменениями — серия быстрых вводов, без анимации счётчика */
const BURST_GAP_MS = 450;

/** Максимальная длительность анимации счётчика */
const MAX_DURATION_MS = 220;

type Props = {
  value: number;
  className?: string;
};

export function AnimatedNumber({ value, className }: Props) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const frameRef = useRef<number | null>(null);
  const lastChangeAtRef = useRef(0);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (value === displayRef.current) return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const now = performance.now();
    const gap =
      lastChangeAtRef.current === 0 ? 0 : now - lastChangeAtRef.current;
    lastChangeAtRef.current = now;

    if (gap < BURST_GAP_MS) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    const from = displayRef.current;
    const diff = value - from;
    const duration = Math.min(MAX_DURATION_MS, 60 + Math.abs(diff) * 8);
    const start = now;
    const target = value;

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      const next = Math.round(from + diff * eased);
      displayRef.current = next;
      setDisplay(next);

      if (p < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = target;
        setDisplay(target);
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [value]);

  return (
    <span className={[styles.root, className].filter(Boolean).join(" ")}>
      {display}
    </span>
  );
}
