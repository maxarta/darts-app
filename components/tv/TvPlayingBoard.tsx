"use client";

import Image from "next/image";
import { AnimatedNumber } from "@/components/game/AnimatedNumber";
import { visitThrowSummary } from "@/lib/darts/format";
import type { TvLivePayload } from "@/lib/tournament/tv-live";
import { TvAvatar } from "./TvAvatar";
import styles from "./tv.module.css";

type Props = {
  live: TvLivePayload;
  tournamentName: string;
};

export function TvPlayingBoard({ live, tournamentName }: Props) {
  const active = live.players.find((p) => p.active) ?? live.players[0];
  const visitChips = visitThrowSummary(live.visitThrows);
  const dartsInVisit = live.visitThrows.length;
  const dartsLeft = Math.max(0, 3 - dartsInVisit);
  const multiLeg = (live.legsToWin ?? 1) > 1;

  return (
    <div className={styles.tvPlaying}>
      <header className={styles.tvGameHeader}>
        <div className={styles.tvGameHeaderMain}>
          <p className={styles.tvGameTitle}>{tournamentName}</p>
          <p className={styles.tvGameSubtitle}>
            {live.stage ?? "Игра"} · {live.mode}
          </p>
        </div>
        <div className={styles.tvGameStats}>
          <span className={styles.tvGameStat}>
            <span className={styles.tvGameStatCur}>Р{live.currentRound}</span>
          </span>
          {multiLeg ? (
            <span className={styles.tvGameStat}>
              <span className={styles.tvGameStatCur}>И{live.currentLeg}</span>
              <span className={styles.tvGameStatMax}>/{live.legsToWin}</span>
            </span>
          ) : null}
        </div>
        <div className={styles.tvVisitStrip} aria-live="polite">
          {dartsInVisit > 0 ? (
            <span className={styles.tvVisitChipWhite}>
              <AnimatedNumber value={active?.visitScore ?? 0} />
            </span>
          ) : null}
          {visitChips.map((chip, i) => (
            <span key={`${chip.label}-${i}`} className={styles.tvVisitChipDark}>
              {chip.label}
            </span>
          ))}
          {Array.from({ length: dartsLeft }).map((_, i) => (
            <span key={`slot-${i}`} className={styles.tvVisitChipSlot}>
              <Image
                src="/game/dart-flight-single.svg"
                alt=""
                width={28}
                height={22}
              />
            </span>
          ))}
        </div>
      </header>

      <div
        className={
          live.players.length > 2 ? styles.tvScoreGridMulti : styles.tvScoreGrid
        }
      >
        {live.players.map((p) => (
          <article
            key={p.userId}
            className={[
              styles.tvScoreCard,
              p.active ? styles.tvScoreCardActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={p.active ? "true" : undefined}
          >
            <div className={styles.tvScoreCardTop}>
              <TvAvatar name={p.name} photoUrl={p.photoUrl} size="board" />
              <div className={styles.tvScoreCardMeta}>
                <p className={styles.tvPlayerName}>{p.name}</p>
                {p.active ? (
                  <p className={styles.tvTurnHint}>Ход</p>
                ) : (
                  <p className={styles.tvTurnHintIdle}> </p>
                )}
                <div className={styles.tvVisitMeta}>
                  <span className={styles.tvStartStrike}>
                    {p.active
                      ? (p.visitStartScore ?? p.remaining)
                      : p.remaining}
                  </span>
                  {p.active && dartsInVisit > 0 ? (
                    <span className={styles.tvVisitChipWhiteSm}>
                      <AnimatedNumber value={p.visitScore} />
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <p className={styles.tvScoreValue}>
              <AnimatedNumber value={p.remaining} />
            </p>

            <div className={styles.tvScoreFooter}>
              {multiLeg ? (
                <span className={styles.tvLegs}>Леги {p.legsWon}</span>
              ) : null}
              <span className={styles.tvPpr}>
                СРЕДН. {p.ppr.toFixed(1)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
