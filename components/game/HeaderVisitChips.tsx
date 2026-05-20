"use client";

import Image from "next/image";
import { AnimatedNumber } from "./AnimatedNumber";
import { ScoreChip } from "./ScoreChip";
import chipStyles from "./scoreChip.module.css";
import styles from "./game.module.css";

type ThrowChip = { label: string; points: number };

type Props = {
  visitScore: number;
  throws: ThrowChip[];
  dartsThrownInVisit: number;
  bust?: boolean;
};

/** Броски визита в шапке (landscape, Figma header right). */
export function HeaderVisitChips({
  visitScore,
  throws,
  dartsThrownInVisit,
  bust = false,
}: Props) {
  const dartsLeft = Math.max(0, 3 - dartsThrownInVisit);

  return (
    <div className={styles.headerVisit} aria-live="polite">
      <div className={styles.headerVisitChips}>
        {bust ? (
          <ScoreChip variant="bust" className={chipStyles.chipPortrait}>
            ПЕРЕБОР!
          </ScoreChip>
        ) : (
          <>
            {dartsThrownInVisit > 0 ? (
              <ScoreChip
                variant="white"
                whiteTone="visitBar"
                className={chipStyles.chipPortrait}
              >
                <AnimatedNumber value={visitScore} />
              </ScoreChip>
            ) : null}
            {throws.map((t, i) => (
              <ScoreChip
                key={`${t.label}-${i}`}
                variant="dark"
                className={chipStyles.chipPortrait}
              >
                {t.label}
              </ScoreChip>
            ))}
          </>
        )}
        {Array.from({ length: dartsLeft }).map((_, i) => (
          <ScoreChip
            key={`dart-${i}`}
            variant="slot"
            className={chipStyles.chipPortrait}
            aria-hidden
          >
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
  );
}
