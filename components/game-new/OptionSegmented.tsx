import type { CSSProperties } from "react";
import styles from "./newGame.module.css";

export type SegmentOption<T extends string | number> = {
  value: T;
  label: string;
};

type Props<T extends string | number> = {
  name: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
};

export function OptionSegmented<T extends string | number>({
  name,
  value,
  options,
  onChange,
}: Props<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value)
  );

  const trackStyle = {
    "--segment-count": options.length,
    "--segment-index": activeIndex,
  } as CSSProperties;

  return (
    <div
      className={styles.segmented}
      role="group"
      aria-label={name}
      style={trackStyle}
    >
      <span className={styles.segmentThumb} aria-hidden />
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            name={name}
            className={`${styles.segment} ${active ? styles.segmentActive : styles.segmentIdle}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
