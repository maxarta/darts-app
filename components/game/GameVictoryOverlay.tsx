"use client";

import { buildVictoryStats } from "@/lib/game/victory-stats";
import type { GameSnapshot } from "@/lib/game/optimistic";
import type { LocalGameRecord } from "@/lib/game/local/types";
import { formatThrowLabel } from "@/lib/darts/format";
import { ruDartsCount } from "@/lib/i18n/ru-plural";
import { hapticImpact } from "@/lib/haptic";
import { VictoryDartboardHeatmap } from "./VictoryDartboardHeatmap";
import styles from "./victory.module.css";

type Props = {
  snapshot: GameSnapshot;
  record: LocalGameRecord;
  endScopeMatch: boolean;
  matchFinished: boolean;
  onDone: () => void;
  onPlayAgain: () => void;
  onContinue?: () => void;
  playAgainLabel?: string;
};

function formatPpr(value: number): string {
  return value.toFixed(1);
}

export function GameVictoryOverlay({
  snapshot,
  record,
  endScopeMatch,
  matchFinished,
  onDone,
  onPlayAgain,
  onContinue,
  playAgainLabel = "Играть еще →",
}: Props) {
  const players = buildVictoryStats(snapshot, record);
  const statsTitle = endScopeMatch ? "Статистика игры" : "Статистика раунда";

  return (
    <div
      className={styles.backdrop}
      data-victory-overlay
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-stats-title"
    >
      <div className={[styles.panel, styles.panelStats].join(" ")}>
        <h2 id="victory-stats-title" className={styles.statsTitle}>
          {statsTitle}
        </h2>

        <div
          className={styles.playersGrid}
          data-count={players.length}
        >
          {players.map((p, index) => (
            <article
              key={p.userId}
              className={styles.playerCard}
              style={{ animationDelay: `${0.08 + index * 0.06}s` }}
            >
              <div className={styles.playerNameRow}>
                {p.isWinner ? (
                  <span className={styles.winnerChip}>{p.name}</span>
                ) : (
                  <span className={styles.playerName}>{p.name}</span>
                )}
              </div>

              <p className={styles.playerBigScore}>{p.remainingScore}</p>

              <span className={styles.pprChip}>
                СРЕДН. {formatPpr(p.ppr)}
              </span>

              <VictoryDartboardHeatmap throws={p.throws} />

              <p className={styles.dartCount}>{ruDartsCount(p.dartsThrown)}</p>

              {p.throws.length > 0 ? (
                <div className={styles.throwChips}>
                  {p.throws.map((t, i) => (
                    <span key={`${formatThrowLabel(t)}-${i}`} className={styles.throwChip}>
                      {formatThrowLabel(t)}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <div className={styles.actions}>
          {matchFinished ? (
            <>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  hapticImpact("light");
                  onDone();
                }}
              >
                Хватит
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  hapticImpact("medium");
                  onPlayAgain();
                }}
              >
                {playAgainLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                hapticImpact("medium");
                onContinue?.();
              }}
            >
              Продолжить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
