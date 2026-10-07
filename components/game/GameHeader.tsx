"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AutoScoreButton } from "@/components/autoscore/AutoScoreButton";
import styles from "./game.module.css";
import autoStyles from "@/components/autoscore/autoscore.module.css";

type TournamentHeader = {
  name: string;
  subtitle: string;
};

export type RemovablePlayer = {
  userId: number;
  name: string;
};

type Props = {
  mode: "301" | "501";
  round: number;
  leg: number;
  legsToWin: number;
  showLegCounter?: boolean;
  tournament?: TournamentHeader | null;
  removablePlayers?: RemovablePlayer[];
  onRemovePlayer?: (userId: number) => void;
  onRestart?: () => void;
  onLeave?: () => void;
  disabled?: boolean;
  visitSlot?: ReactNode;
  /** Club TV (extended free games only) — code for artdart.vercel.app/tv */
  tv?: {
    code: string | null;
    display: string;
  } | null;
  /** Gray finish hint in place of Rules (e.g. double-out checkout). */
  finishHint?: string | null;
  /** Camera auto-scoring toggle (next to ⋯). */
  autoScore?: {
    active: boolean;
    onToggle: () => void;
  } | null;
};

function HeaderCounter({
  prefix,
  value,
  max,
}: {
  prefix: string;
  value: number;
  max?: number;
}) {
  return (
    <span className={styles.headerRound}>
      <span className={styles.headerRoundCurrent}>
        {prefix}
        {value}
      </span>
      {max != null ? (
        <span className={styles.headerRoundMax}>/{max}</span>
      ) : null}
    </span>
  );
}

export function GameHeader({
  mode,
  round,
  leg,
  legsToWin,
  showLegCounter = true,
  tournament,
  removablePlayers = [],
  onRemovePlayer,
  onRestart,
  onLeave,
  disabled,
  visitSlot,
  tv = null,
  finishHint = null,
  autoScore = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const roundCounter = <HeaderCounter prefix="Р" value={round} />;
  const legCounter = showLegCounter ? (
    <HeaderCounter prefix="И" value={leg} max={legsToWin} />
  ) : null;

  const meta = tournament ? (
    <>
      <div className={styles.headerTournament}>
        <span className={styles.headerTournamentTitle}>{tournament.name}</span>
        <span className={styles.headerTournamentSubtitle}>
          {tournament.subtitle}
        </span>
      </div>
      <div className={styles.headerStats}>
        {roundCounter}
        {legCounter}
      </div>
    </>
  ) : (
    <div className={styles.headerMeta}>
      <span className={styles.headerMode}>{mode}</span>
      <span className={styles.headerDivider} aria-hidden />
      <div className={styles.headerStats}>
        {roundCounter}
        {legCounter}
      </div>
    </div>
  );

  const canRemove = removablePlayers.length > 0 && onRemovePlayer != null;

  return (
    <header className={styles.header}>
      <div ref={menuRef} className={styles.menuWrap}>
        <div className={autoStyles.menuRow}>
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
          {autoScore ? (
            <AutoScoreButton
              active={autoScore.active}
              disabled={disabled}
              onClick={autoScore.onToggle}
            />
          ) : null}
        </div>
        {open && (
          <div className={styles.menuDropdown} role="menu">
            {tv ? (
              <div className={styles.menuTv}>
                <p className={styles.tvAddressLabel}>На телевизоре откройте</p>
                <p className={styles.tvAddressUrl}>{tv.display}</p>
                <p className={styles.tvAddressLabel}>Код</p>
                <p className={styles.tvCodeHuge}>{tv.code ?? "····"}</p>
              </div>
            ) : null}
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
            {canRemove ? (
              <>
                <div className={styles.menuSectionLabel} role="presentation">
                  Убрать из игры
                </div>
                {removablePlayers.map((p) => (
                  <button
                    key={p.userId}
                    type="button"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onRemovePlayer(p.userId);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </>
            ) : null}
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

      <div className={styles.headerContent}>{meta}</div>

      {finishHint ? (
        <p className={styles.headerFinishHint}>{finishHint}</p>
      ) : null}

      {visitSlot}
    </header>
  );
}
