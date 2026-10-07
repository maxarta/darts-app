"use client";

import styles from "./autoscore.module.css";

type Props = {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
};

/** Camera toggle placed next to the ⋯ menu. */
export function AutoScoreButton({ active, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      className={[styles.autoBtn, active ? styles.autoBtnActive : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={active ? "Выключить автоскоринг" : "Включить автоскоринг"}
      aria-pressed={active}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      <svg
        className={styles.autoBtnSvg}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <path
          d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.6A1.5 1.5 0 0 1 10.9 4h2.2a1.5 1.5 0 0 1 1.2.4L15.5 6H17.5A2.5 2.5 0 0 1 20 8.5v7A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5v-7Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  );
}
