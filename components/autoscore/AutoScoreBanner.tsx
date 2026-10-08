"use client";

import styles from "./autoscore.module.css";

type Props = {
  mode: "listening" | "countdown" | "correcting" | "removal" | "calibrating";
  secondsLeft?: number;
  /** When true, copy mentions real LiDAR instead of camera. */
  lidar?: boolean;
  /** Optional status line (e.g. ML calib progress). */
  detail?: string | null;
  onStop: () => void;
};

export function AutoScoreBanner({
  mode,
  secondsLeft = 0,
  lidar = false,
  detail = null,
  onStop,
}: Props) {
  const className = [
    styles.banner,
    mode === "countdown" ? styles.bannerCountdown : "",
    mode === "removal" ? styles.bannerCountdown : "",
    mode === "correcting" || mode === "calibrating" ? styles.bannerMuted : "",
  ]
    .filter(Boolean)
    .join(" ");

  let text = lidar
    ? "LiDAR · ждёт дротик"
    : "Автоскоринг · ждёт дротик";
  if (mode === "removal") {
    text = "Достаньте дротики с мишени";
  } else if (mode === "countdown") {
    text = `Следующий игрок через ${secondsLeft}…`;
  } else if (mode === "correcting") {
    text = "Корректировка · введите счёт и нажмите «Следующий»";
  } else if (mode === "calibrating") {
    text = detail ?? "Калибровка доски…";
  } else if (detail) {
    text = detail;
  }

  return (
    <div className={className} role="status">
      <span>{text}</span>
      <button type="button" className={styles.bannerStop} onClick={onStop}>
        Выкл
      </button>
    </div>
  );
}
