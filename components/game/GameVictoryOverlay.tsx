"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { buildVictoryStats } from "@/lib/game/victory-stats";
import type { GameSnapshot } from "@/lib/game/optimistic";
import type { LocalGameRecord } from "@/lib/game/local/types";
import { ruDartsCount } from "@/lib/i18n/ru-plural";
import { hapticImpact } from "@/lib/haptic";
import { useBodyScrollLock } from "@/lib/ui/use-body-scroll-lock";
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
  busy?: boolean;
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
  busy = false,
}: Props) {
  const players = buildVictoryStats(snapshot, record);
  const statsTitle = endScopeMatch ? "Статистика игры" : "Статистика раунда";
  const [mounted, setMounted] = useState(false);
  useBodyScrollLock(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      data-victory-overlay
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-stats-title"
    >
      <div className={[styles.panel, styles.panelStats].join(" ")}>
        <div className={styles.panelScroll}>
          <h2 id="victory-stats-title" className={styles.statsTitle}>
            {statsTitle}
          </h2>

          <div className={styles.playersGrid} data-count={players.length}>
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

                <VictoryDartboardHeatmap throws={p.throws} tightViewport />

                <p className={styles.dartCount}>
                  {ruDartsCount(p.dartsThrown)}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          {matchFinished ? (
            <>
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={busy}
                onClick={() => {
                  if (busy) return;
                  hapticImpact("light");
                  onDone();
                }}
              >
                Хватит
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy}
                onClick={() => {
                  if (busy) return;
                  hapticImpact("medium");
                  onPlayAgain();
                }}
              >
                {busy ? "Секунду…" : playAgainLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={busy}
              onClick={() => {
                if (busy) return;
                hapticImpact("medium");
                onContinue?.();
              }}
            >
              Продолжить
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
