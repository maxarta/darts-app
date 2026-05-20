"use client";

import "@/components/dotmatrix-loader.css";
import { DotmSquare14 } from "@/components/ui/dotm-square-14";

import styles from "./loadingSpinner.module.css";

type LoadingSpinnerProps = {
  /** Screen reader label and optional visible caption */
  label?: string;
  className?: string;
  inline?: boolean;
};

/** Dot Matrix «Prism Bloom» animation, black dots (`dotm-square-14`). */
export function LoadingSpinner({
  label = "Загрузка…",
  className,
  inline = false,
}: LoadingSpinnerProps) {
  return (
    <div
      className={[styles.root, inline ? styles.inline : null, className]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <DotmSquare14
        size={40}
        dotSize={5}
        color="#000"
        animated
        opacityBase={0.08}
        opacityMid={0.52}
        opacityPeak={1}
        ariaLabel={label || "Загрузка"}
      />
      {label ? <p className={styles.label}>{label}</p> : null}
    </div>
  );
}
