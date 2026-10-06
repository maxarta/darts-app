"use client";

import { useState } from "react";
import styles from "./tv.module.css";

type Props = {
  name: string;
  photoUrl: string | null;
  size?: "default" | "hero" | "board";
};

function initials(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

export function TvAvatar({ name, photoUrl, size = "default" }: Props) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(photoUrl) && !failed;
  const sizeClass =
    size === "hero"
      ? styles.tvAvatarHero
      : size === "board"
        ? styles.tvAvatarBoard
        : "";

  return (
    <div className={[styles.tvAvatar, sizeClass].filter(Boolean).join(" ")}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl!}
          alt=""
          className={styles.tvAvatarImg}
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}
