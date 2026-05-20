import styles from "./tournament.module.css";

type Props = {
  variant?: "match" | "final";
};

/** Separator between opponents (× instead of “vs”). */
export function MatchVsIcon({ variant = "match" }: Props) {
  return (
    <span
      className={variant === "final" ? styles.finalVs : styles.matchVs}
      aria-hidden
    >
      ×
    </span>
  );
}
