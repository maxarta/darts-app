"use client";

import { hapticImpact } from "@/lib/haptic";
import styles from "./victory.module.css";

type Props = {
  title: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function GameConfirmOverlay({
  title,
  confirmLabel,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div
      className={styles.backdrop}
      data-victory-overlay
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-confirm-title"
    >
      <div className={[styles.panel, styles.panelConfirm].join(" ")}>
        <h2 id="game-confirm-title" className={styles.title}>
          {title}
        </h2>
        <div className={[styles.actions, styles.actionsConfirm].join(" ")}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              hapticImpact("light");
              onCancel();
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              hapticImpact("medium");
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
