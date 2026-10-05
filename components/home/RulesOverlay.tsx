"use client";

import { useEffect } from "react";
import { RulesBoard } from "./RulesBoard";
import styles from "./home.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function RulesOverlay({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.rulesFullscreen}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
    >
      <header className={styles.rulesHeader}>
        <h2 id="rules-title" className={styles.rulesFullscreenTitle}>
          Правила
        </h2>
        <button
          type="button"
          className={styles.rulesClose}
          aria-label="Закрыть"
          onClick={onClose}
        >
          <svg
            className={styles.rulesCloseIcon}
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden
          >
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>
      <div className={styles.rulesFullscreenBody}>
        <RulesBoard />
      </div>
    </div>
  );
}
