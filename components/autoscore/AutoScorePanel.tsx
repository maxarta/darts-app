"use client";

import { useEffect, useRef, useState } from "react";
import { hapticImpact } from "@/lib/haptic";
import { formatThrowLabel } from "@/lib/darts/format";
import { throwPoints, type ThrowInput } from "@/lib/darts/rules";
import type { NativeThrowPrompt } from "@/lib/autoscore/native-bridge";
import { ScoringKeypad } from "@/components/game/ScoringKeypad";
import { reportCameraHole } from "@/lib/autoscore/native-bridge";
import styles from "./autoscore-panel.module.css";

type Props = {
  throws: ThrowInput[];
  /** Slots scored as a miss because the dart wasn't found — worth a check. */
  unseen: number[];
  prompt: NativeThrowPrompt;
  status: string | null;
  countdown: number | null;
  bust: boolean;
  onThrown: () => void;
  onClear: () => void;
  onReplace: (index: number, input: ThrowInput) => void;
  onAdd: (input: ThrowInput) => void;
  onUndo: () => void;
};

export function AutoScorePanel({
  throws,
  unseen,
  prompt,
  status,
  countdown,
  bust,
  onThrown,
  onClear,
  onReplace,
  onAdd,
  onUndo,
}: Props) {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  // The button changes meaning with the prompt — swallow taps right after a change
  // so a late tap meant for the old label doesn't fire the new action.
  const promptChangedAt = useRef(0);
  const holeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    promptChangedAt.current = Date.now();
  }, [prompt]);
  useEffect(() => {
    const el = holeRef.current;
    if (!el || editIndex != null) {
      reportCameraHole(null);
      return;
    }
    const send = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) {
        reportCameraHole(null);
        return;
      }
      reportCameraHole({ x: r.x, y: r.y, w: r.width, h: r.height });
    };
    send();
    const observer = new ResizeObserver(send);
    observer.observe(el);
    window.addEventListener("resize", send);
    const id = window.setInterval(send, 400);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", send);
      window.clearInterval(id);
      reportCameraHole(null);
    };
  }, [editIndex]);
  const total = throws.reduce((s, t) => s + throwPoints(t), 0);

  const action =
    countdown != null
      ? { label: `СЛЕДУЮЩИЙ ЧЕРЕЗ ${countdown}`, run: null, tone: styles.actionIdle }
      : prompt === "scoring"
        ? { label: "СЧИТАЮ…", run: null, tone: styles.actionIdle }
        : prompt === "pullDarts"
          ? { label: "ЧИСТО — ДАЛЬШЕ", run: onClear, tone: styles.actionClear }
          : { label: "ЗАКОНЧИТЬ ПОДХОД", run: onThrown, tone: styles.actionThrow };

  return (
    <div className={styles.panel}>
      {status ? <p className={styles.status}>{status}</p> : null}
      <div ref={holeRef} className={styles.camera} />

      <div className={styles.darts}>
        {[0, 1, 2].map((i) => {
          const t = throws[i];
          const editable = i <= throws.length && prompt !== "scoring";
          return (
            <button
              key={i}
              type="button"
              className={[
                styles.slot,
                t ? styles.slotFilled : "",
                unseen.includes(i) ? styles.slotUnseen : "",
              ].join(" ")}
              disabled={!editable}
              onClick={() => {
                hapticImpact("light");
                setEditIndex(i);
              }}
              aria-label={t ? `Исправить дротик ${i + 1}` : `Ввести дротик ${i + 1}`}
            >
              <span className={styles.slotLabel}>{t ? formatThrowLabel(t) : "—"}</span>
              <span className={styles.slotPoints}>
                {unseen.includes(i) ? "не увидел" : t ? throwPoints(t) : ""}
              </span>
            </button>
          );
        })}
        <div className={[styles.total, bust ? styles.totalBust : ""].join(" ")}>
          <span className={styles.totalLabel}>{bust ? "ПЕРЕБОР" : "ЗА ПОДХОД"}</span>
          <span className={styles.totalValue}>{total}</span>
        </div>
      </div>

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.undo}
          disabled={throws.length === 0}
          onClick={() => {
            if (throws.length === 0) return;
            hapticImpact("light");
            onUndo();
          }}
          aria-label="Отменить последний дротик"
        >
          ОТМЕНА
        </button>
        <button
          type="button"
          className={[styles.action, action.tone].join(" ")}
          disabled={!action.run}
          onClick={() => {
            if (!action.run) return;
            if (Date.now() - promptChangedAt.current < 800) return;
            hapticImpact("medium");
            action.run();
          }}
        >
          {action.label}
        </button>
      </div>

      {editIndex != null ? (
        <div className={styles.picker} role="dialog" aria-modal="true">
          <div className={styles.pickerHead}>
            <span className={styles.pickerTitle}>Дротик {editIndex + 1}</span>
            {throws[editIndex] ? (
              <span className={styles.pickerCurrent}>
                сейчас: {formatThrowLabel(throws[editIndex])}
              </span>
            ) : null}
          </div>
          <ScoringKeypad
            onThrow={(input) => {
              const i = editIndex;
              setEditIndex(null);
              if (i < throws.length) onReplace(i, input);
              else onAdd(input);
            }}
            onUndo={() => setEditIndex(null)}
            onNextPlayer={() => setEditIndex(null)}
            onCancel={() => setEditIndex(null)}
            visitReady={false}
          />
        </div>
      ) : null}
    </div>
  );
}
