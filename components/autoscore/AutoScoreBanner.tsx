"use client";

import styles from "./autoscore.module.css";

type Props = {
  mode: "listening" | "countdown" | "correcting";
  secondsLeft?: number;
  /** When true, copy mentions real LiDAR instead of camera. */
  lidar?: boolean;
  onStop: () => void;
};

export function AutoScoreBanner({
  mode,
  secondsLeft = 0,
  lidar = false,
  onStop,
}: Props) {
  const className = [
    styles.banner,
    mode === "countdown" ? styles.bannerCountdown : "",
    mode === "correcting" ? styles.bannerMuted : "",
  ]
    .filter(Boolean)
    .join(" ");

  let text = lidar
    ? "LiDAR · ждёт дротик"
    : "Автоскоринг · ждёт дротик";
  if (mode === "countdown") {
    text = `Следующий игрок через ${secondsLeft}…`;
  } else if (mode === "correcting") {
    text = "Корректировка · введите счёт и нажмите «Следующий»";
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
