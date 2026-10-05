"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { hapticImpact } from "@/lib/haptic";
import { useBodyScrollLock } from "@/lib/ui/use-body-scroll-lock";
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
      aria-labelledby="game-confirm-title"
    >
      <div className={[styles.panel, styles.panelConfirm].join(" ")}>
        <div className={styles.panelScroll}>
          <h2 id="game-confirm-title" className={styles.title}>
            {title}
          </h2>
        </div>
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
    </div>,
    document.body
  );
}
