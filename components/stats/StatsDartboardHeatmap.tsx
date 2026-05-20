"use client";

import { VictoryDartboardHeatmap } from "@/components/game/VictoryDartboardHeatmap";
import type { ThrowInput } from "@/lib/darts/rules";
import { ruDartsCount, ruDartsWord } from "@/lib/i18n/ru-plural";
import styles from "./statsScreen.module.css";

type StatsDartboardHeatmapProps = {
  throws: ThrowInput[];
  /** Inline card heatmap without section title */
  compact?: boolean;
};

export function StatsDartboardHeatmap({
  throws,
  compact = false,
}: StatsDartboardHeatmapProps) {
  if (throws.length === 0) return null;

  return (
    <section
      className={
        compact ? styles.heatmapSectionCompact : styles.heatmapSection
      }
      aria-label={compact ? undefined : "Карта бросков"}
    >
      {!compact ? (
        <h2 className={styles.sectionTitle}>Карта бросков</h2>
      ) : null}
      <div
        className={
          compact ? styles.heatmapCard : styles.heatmapBoardWrap
        }
      >
        <VictoryDartboardHeatmap throws={throws} tightViewport />
      </div>
      {compact ? (
        <p className={styles.heatmapDartCountInline}>
          {ruDartsCount(throws.length)}
        </p>
      ) : (
        <div className={styles.heatmapDartCountCard}>
          <div className={styles.statValue}>{throws.length}</div>
          <div className={styles.statLabel}>{ruDartsWord(throws.length)}</div>
        </div>
      )}
    </section>
  );
}
