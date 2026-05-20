"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTelegramEnv } from "@/lib/telegram/use-is-telegram";
import styles from "./game.module.css";

type TournamentHeader = {
  name: string;
  subtitle: string;
};

type Props = {
  mode: "301" | "501";
  round: number;
  maxRounds: number;
  leg: number;
  legsToWin: number;
  showLegCounter?: boolean;
  tournament?: TournamentHeader | null;
  onRestart?: () => void;
  onLeave?: () => void;
  disabled?: boolean;
  /** Броски визита справа в шапке (landscape). */
  visitSlot?: ReactNode;
};

function HeaderCounter({
  prefix,
  value,
  max,
}: {
  prefix: string;
  value: number;
  max: number;
}) {
  return (
    <span className={styles.headerRound}>
      <span className={styles.headerRoundCurrent}>
        {prefix}
        {value}
      </span>
      <span className={styles.headerRoundMax}>/{max}</span>
    </span>
  );
}

export function GameHeader({
  mode,
  round,
  maxRounds,
  leg,
  legsToWin,
  showLegCounter = true,
  tournament,
  onRestart,
  onLeave,
  disabled,
  visitSlot,
}: Props) {
  const telegramEnv = useTelegramEnv();
  const [open, setOpen] = useState(false);
  const [showBrowserMenu, setShowBrowserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowBrowserMenu(telegramEnv === "browser");
  }, [telegramEnv]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const meta = tournament ? (
  <>
      <div className={styles.headerTournament}>
        <span className={styles.headerTournamentTitle}>{tournament.name}</span>
        <span className={styles.headerTournamentSubtitle}>
          {tournament.subtitle}
        </span>
      </div>
      <div className={styles.headerStats}>
        <HeaderCounter prefix="Р" value={round} max={maxRounds} />
        {showLegCounter ? (
          <HeaderCounter prefix="И" value={leg} max={legsToWin} />
        ) : null}
      </div>
    </>
  ) : (
    <div className={styles.headerMeta}>
      <span className={styles.headerMode}>{mode}</span>
      <span className={styles.headerDivider} aria-hidden />
      <div className={styles.headerStats}>
        <HeaderCounter prefix="Р" value={round} max={maxRounds} />
        {showLegCounter ? (
          <HeaderCounter prefix="И" value={leg} max={legsToWin} />
        ) : null}
      </div>
    </div>
  );

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>{meta}</div>
      {visitSlot}

      {showBrowserMenu ? (
        <div ref={menuRef} className={styles.menuWrap}>
          <button
            type="button"
            className={styles.menuBtnFallback}
            aria-label="Меню"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
          >
            ⋯
          </button>
          {open && (
            <div className={styles.menuDropdown} role="menu">
              <button
                type="button"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onRestart?.();
                }}
              >
                Заново
              </button>
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLeave?.();
                }}
              >
                Покинуть игру
              </button>
            </div>
          )}
        </div>
      ) : null}
    </header>
  );
}
