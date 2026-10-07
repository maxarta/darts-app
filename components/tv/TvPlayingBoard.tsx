"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Image from "next/image";
import { AnimatedNumber } from "@/components/game/AnimatedNumber";
import { formatCheckoutHint } from "@/lib/darts/checkout";
import { visitThrowSummary } from "@/lib/darts/format";
import type { TvLivePayload } from "@/lib/tournament/tv-live";
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
  const playerCount = live.players.length;
  const dense = playerCount >= 4;
  const activeId = active?.userId;
  const doubleOut = live.doubleOut !== false;
  const finishHint =
    doubleOut && active && dartsLeft > 0
      ? formatCheckoutHint(active.remaining, dartsLeft)
      : null;

  const gridRef = useRef<HTMLDivElement>(null);
  const prevRectsRef = useRef<Map<number, DOMRect>>(new Map());
  const prevActiveRef = useRef<number | undefined>(undefined);
  const [pulseId, setPulseId] = useState<number | null>(null);

  useEffect(() => {
    if (activeId == null) return;
    if (prevActiveRef.current === activeId) return;
    prevActiveRef.current = activeId;
    setPulseId(activeId);
    const t = window.setTimeout(() => setPulseId(null), 650);
    return () => window.clearTimeout(t);
  }, [activeId]);

  // FLIP: smooth slide/expand when the active seat changes.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = [
      ...grid.querySelectorAll<HTMLElement>("[data-tv-player]"),
    ];
    const nextRects = new Map<number, DOMRect>();

    for (const el of cards) {
      const id = Number(el.dataset.tvPlayer);
      if (!Number.isFinite(id)) continue;
      nextRects.set(id, el.getBoundingClientRect());
    }

    const prev = prevRectsRef.current;
    if (prev.size > 0) {
      for (const el of cards) {
        const id = Number(el.dataset.tvPlayer);
        const before = prev.get(id);
        const after = nextRects.get(id);
        if (!before || !after) continue;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        const sx = before.width / Math.max(after.width, 1);
        if (
          Math.abs(dx) < 0.5 &&
          Math.abs(dy) < 0.5 &&
          Math.abs(sx - 1) < 0.01
        ) {
          continue;
        }
        const inner = el.querySelector<HTMLElement>("[data-tv-inner]");
        el.style.transition = "none";
        el.style.transformOrigin = "left center";
        el.style.transform = `translate(${dx}px, ${dy}px) scaleX(${sx})`;
        if (inner && Math.abs(sx - 1) > 0.01) {
          inner.style.transition = "none";
          inner.style.transformOrigin = "left center";
          inner.style.transform = `scaleX(${1 / sx})`;
        }
        void el.offsetWidth;
        const ease = "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transition = ease;
        el.style.transform = "";
        if (inner) {
          inner.style.transition = ease;
          inner.style.transform = "";
        }
      }
    }

    prevRectsRef.current = nextRects;
  }, [activeId, playerCount]);

  return (
    <div
      className={styles.tvPlaying}
      data-players={playerCount}
      style={{ "--tv-cols": String(playerCount) } as CSSProperties}
    >
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
        <div className={styles.tvFinishHintSlot} aria-live="polite">
          {finishHint ? (
            <p className={styles.tvFinishHint}>{finishHint}</p>
          ) : null}
        </div>
      </header>

      <div
        ref={gridRef}
        className={
          playerCount > 2 ? styles.tvScoreGridMulti : styles.tvScoreGrid
        }
      >
        {live.players.map((p) => (
          <article
            key={p.userId}
            data-tv-player={p.userId}
            className={[
              styles.tvScoreCard,
              p.photoUrl ? styles.tvScoreCardHasPhoto : "",
              dense ? styles.tvScoreCardStacked : "",
              p.active ? styles.tvScoreCardActive : "",
              pulseId === p.userId ? styles.tvScoreCardPulse : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={p.active ? "true" : undefined}
          >
            {p.photoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.tvScoreCardBg}
                  src={p.photoUrl}
                  alt=""
                  decoding="async"
                />
                <div className={styles.tvScoreCardScrim} aria-hidden />
              </>
            ) : null}
            <div className={styles.tvScoreCardInner} data-tv-inner>
              {p.active ? (
                <div className={styles.tvCardDarts} aria-live="polite">
                  {visitChips.map((chip, i) => (
                    <span
                      key={`${chip.label}-${i}`}
                      className={styles.tvVisitChipDark}
                    >
                      {chip.label}
                    </span>
                  ))}
                  {Array.from({ length: dartsLeft }).map((_, i) => (
                    <span key={`slot-${i}`} className={styles.tvVisitChipSlot}>
                      <Image
                        src="/game/dart-flight-single.svg"
                        alt=""
                        width={dense ? 24 : 30}
                        height={dense ? 19 : 24}
                      />
                    </span>
                  ))}
                </div>
              ) : null}

              <div className={styles.tvScoreCardTop}>
                <div className={styles.tvScoreCardMeta}>
                  <p className={styles.tvPlayerName}>{p.name}</p>
                  {p.active ? (
                    <p className={styles.tvTurnHint}>Ход</p>
                  ) : null}
                  {p.active ? (
                    <div className={styles.tvVisitMeta}>
                      <span className={styles.tvStartStrike}>
                        {p.visitStartScore ?? p.remaining}
                      </span>
                      {dartsInVisit > 0 ? (
                        <span className={styles.tvVisitChipWhiteSm}>
                          <AnimatedNumber value={p.visitScore} />
                        </span>
                      ) : null}
                    </div>
                  ) : null}
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
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
