"use client";

import { useCallback, useState } from "react";
import { hapticImpact } from "@/lib/haptic";
import { LANDSCAPE_KEYPAD_GRID } from "@/lib/game/landscape-keypad-grid";
import { DART_NUMBERS, type ThrowInput } from "@/lib/darts/rules";
import styles from "./game.module.css";

type Props = {
  onThrow: (input: ThrowInput) => void;
  onUndo: () => void;
  onNextPlayer: () => void;
  visitReady: boolean;
  scoringLocked?: boolean;
  solo?: boolean;
};

export function ScoringKeypad({
  onThrow,
  onUndo,
  onNextPlayer,
  visitReady,
  scoringLocked = false,
  solo,
}: Props) {
  const nextLabel = solo ? "СЛЕДУЮЩИЙ РАУНД" : "СЛЕДУЮЩИЙ ИГРОК";
  const [pressedId, setPressedId] = useState<string | null>(null);

  const tap = useCallback(
    (
      id: string,
      fn: () => void,
      haptic: "light" | "medium" = "light",
      disabled = false
    ) => {
      if (disabled) return;
      hapticImpact(haptic);
      setPressedId(id);
      window.setTimeout(() => setPressedId(null), 140);
      fn();
    },
    []
  );

  const keyClass = (id: string, ...extra: string[]) =>
    [styles.keyBtn, ...extra, pressedId === id ? styles.keyBtnPressed : ""]
      .filter(Boolean)
      .join(" ");

  return (
    <div className={styles.keypadArea}>
      <div className={styles.bullColumn}>
        <button
          type="button"
          className={keyClass("miss", styles.keySingle)}
          disabled={scoringLocked}
          onClick={() =>
            tap("miss", () => onThrow({ segment: "miss", multiplier: 1 }), "light", scoringLocked)
          }
        >
          МИМО
        </button>
        <button
          type="button"
          className={keyClass("b25", styles.keySingle)}
          disabled={scoringLocked}
          onClick={() =>
            tap("b25", () => onThrow({ segment: "bull25", multiplier: 1 }), "light", scoringLocked)
          }
        >
          ПОЛУБУЛЛ
          <span className={styles.keyScore}>25</span>
        </button>
        <button
          type="button"
          className={keyClass("b50", styles.keyDouble)}
          disabled={scoringLocked}
          onClick={() =>
            tap("b50", () => onThrow({ segment: "bull50", multiplier: 1 }), "light", scoringLocked)
          }
        >
          БУЛЛ
          <span className={styles.keyScore}>50</span>
        </button>
      </div>

      <div className={styles.keypadGridPortrait}>
        <NumberRows
          multiplier={1}
          tone={styles.keySingle}
          onThrow={onThrow}
          pressedId={pressedId}
          tap={tap}
          scoringLocked={scoringLocked}
        />
        <NumberRows
          multiplier={2}
          tone={styles.keyDouble}
          dots={2}
          onThrow={onThrow}
          pressedId={pressedId}
          tap={tap}
          scoringLocked={scoringLocked}
        />
        <NumberRows
          multiplier={3}
          tone={styles.keyTriple}
          dots={3}
          onThrow={onThrow}
          pressedId={pressedId}
          tap={tap}
          scoringLocked={scoringLocked}
        />
      </div>

      <div className={styles.keypadGridLandscape}>
        {LANDSCAPE_KEYPAD_GRID.flat().map((cell) => {
          const id = `${cell.multiplier}-${cell.segment}`;
          const tone =
            cell.multiplier === 1
              ? styles.keySingle
              : cell.multiplier === 2
                ? styles.keyDouble
                : styles.keyTriple;
          return (
            <NumKey
              key={id}
              id={id}
              n={cell.segment}
              multiplier={cell.multiplier}
              tone={tone}
              dots={cell.multiplier > 1 ? cell.multiplier : undefined}
              onThrow={onThrow}
              pressedId={pressedId}
              tap={tap}
              scoringLocked={scoringLocked}
            />
          );
        })}
      </div>

      <div className={styles.keypadActions}>
        <button
          type="button"
          className={keyClass("undo", styles.undoAction)}
          onClick={() => tap("undo", onUndo)}
          aria-label="Отменить бросок"
        >
          ←
        </button>
        <button
          type="button"
          className={[
            styles.keyBtn,
            styles.nextAction,
            visitReady ? styles.nextActionReady : styles.nextActionIdle,
            pressedId === "next" ? styles.keyBtnPressed : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => tap("next", onNextPlayer, "medium")}
          aria-label={nextLabel}
        >
          <span className={styles.nextActionLabelFull}>{nextLabel}</span>
          <span className={styles.nextActionLabelCompact} aria-hidden>
            <span>СЛ.</span>
            <span>{solo ? "РАУНД" : "ИГРОК"}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function NumberRows({
  multiplier,
  tone,
  dots,
  onThrow,
  pressedId,
  tap,
  scoringLocked,
}: {
  multiplier: 1 | 2 | 3;
  tone: string;
  dots?: number;
  onThrow: (input: ThrowInput) => void;
  pressedId: string | null;
  tap: (
    id: string,
    fn: () => void,
    haptic?: "light" | "medium",
    disabled?: boolean
  ) => void;
  scoringLocked: boolean;
}) {
  const top = DART_NUMBERS.slice(0, 10);
  const bottom = DART_NUMBERS.slice(10);

  return (
    <>
      <div className={styles.numRow}>
        {top.map((n) => (
          <NumKey
            key={`${multiplier}-${n}`}
            id={`${multiplier}-${n}`}
            n={n}
            multiplier={multiplier}
            tone={tone}
            dots={dots}
            onThrow={onThrow}
            pressedId={pressedId}
            tap={tap}
            scoringLocked={scoringLocked}
          />
        ))}
      </div>
      <div className={styles.numRow}>
        {bottom.map((n) => (
          <NumKey
            key={`${multiplier}-${n}`}
            id={`${multiplier}-${n}`}
            n={n}
            multiplier={multiplier}
            tone={tone}
            dots={dots}
            onThrow={onThrow}
            pressedId={pressedId}
            tap={tap}
            scoringLocked={scoringLocked}
          />
        ))}
      </div>
    </>
  );
}

function NumKey({
  id,
  n,
  multiplier,
  tone,
  dots,
  onThrow,
  pressedId,
  tap,
  scoringLocked,
}: {
  id: string;
  n: number;
  multiplier: 1 | 2 | 3;
  tone: string;
  dots?: number;
  onThrow: (input: ThrowInput) => void;
  pressedId: string | null;
  tap: (
    id: string,
    fn: () => void,
    haptic?: "light" | "medium",
    disabled?: boolean
  ) => void;
  scoringLocked: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        styles.keyBtn,
        tone,
        pressedId === id ? styles.keyBtnPressed : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={scoringLocked}
      onClick={() =>
        tap(id, () => onThrow({ segment: n, multiplier }), "light", scoringLocked)
      }
    >
      {n}
      {dots ? (
        <span className={styles.keyDots} aria-hidden>
          {Array.from({ length: dots }).map((_, i) => (
            <span key={i} />
          ))}
        </span>
      ) : null}
    </button>
  );
}
