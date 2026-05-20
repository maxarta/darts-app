"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./statsScreen.module.css";

type StatsPlayerAvatarSize = "md" | "lg" | "profile";

const AVATAR_PX: Record<StatsPlayerAvatarSize, number> = {
  md: 40,
  lg: 40,
  profile: 64,
};

type StatsPlayerAvatarProps = {
  name: string;
  photoUrl?: string | null;
  size?: StatsPlayerAvatarSize;
};

function initials(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

export function StatsPlayerAvatar({
  name,
  photoUrl,
  size = "md",
}: StatsPlayerAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const px = AVATAR_PX[size];
  const sizeClass =
    size === "profile"
      ? styles.listAvatarProfile
      : size === "lg"
        ? styles.listAvatarLg
        : undefined;
  const showImage = Boolean(photoUrl) && !imgFailed;

  return (
    <span
      className={[styles.listAvatar, sizeClass].filter(Boolean).join(" ")}
      aria-hidden
    >
      {showImage ? (
        <Image
          src={photoUrl!}
          alt=""
          width={px}
          height={px}
          className={styles.listAvatarImg}
          unoptimized
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className={styles.listAvatarFallback}>{initials(name)}</span>
      )}
    </span>
  );
}
