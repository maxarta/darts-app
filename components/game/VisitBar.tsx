"use client";

import Image from "next/image";
import { AnimatedNumber } from "./AnimatedNumber";
import { ScoreChip } from "./ScoreChip";
import styles from "./game.module.css";

type ThrowChip = { label: string; points: number };

type Props = {
  visitScore: number;
  throws: ThrowChip[];
  dartsThrownInVisit: number;
  bust?: boolean;
};

export function VisitBar({
  visitScore,
  throws,
  dartsThrownInVisit,
  bust = false,
}: Props) {
  const dartsLeft = Math.max(0, 3 - dartsThrownInVisit);

  return (
    <div
      className={bust ? styles.visitBarBust : styles.visitBar}
      aria-live="polite"
    >
      <div className={styles.visitBarInner}>
        <div className={styles.visitChips}>
          {bust ? (
            <ScoreChip variant="bust">ПЕРЕБОР!</ScoreChip>
          ) : (
            <>
              {dartsThrownInVisit > 0 && (
                <ScoreChip variant="white" whiteTone="visitBar">
                  <AnimatedNumber value={visitScore} />
                </ScoreChip>
              )}
              {throws.map((t, i) => (
                <ScoreChip key={`${t.label}-${i}`} variant="dark">
                  {t.label}
                </ScoreChip>
              ))}
            </>
          )}
          {Array.from({ length: dartsLeft }).map((_, i) => (
            <ScoreChip key={`dart-${i}`} variant="slot" aria-hidden>
              <Image
                src="/game/dart-flight-single.svg"
                alt=""
                width={25}
                height={20}
                className={styles.dartFlightIcon}
              />
            </ScoreChip>
          ))}
        </div>
      </div>
    </div>
  );
}
