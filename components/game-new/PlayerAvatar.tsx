"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./newGame.module.css";

type PlayerAvatarProps = {
  name: string;
  photoUrl?: string | null;
  selected?: boolean;
  onClick?: () => void;
  size?: "play" | "pick";
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

export function PlayerAvatar({
  name,
  photoUrl,
  selected = false,
  onClick,
  size = "pick",
}: PlayerAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [photoUrl]);
  const sizeClass = size === "play" ? styles.avatarPlay : styles.avatarPick;
  const showImage = Boolean(photoUrl) && !imgFailed;

  const inner = (
    <>
      <div className={`${styles.avatarCircle} ${sizeClass}`}>
        {showImage ? (
          photoUrl!.startsWith("data:") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl!}
              alt=""
              className={styles.avatarImg}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <Image
              src={photoUrl!}
              alt=""
              width={64}
              height={64}
              className={styles.avatarImg}
              unoptimized
              onError={() => setImgFailed(true)}
            />
          )
        ) : (
          <span className={styles.avatarFallback}>{initials(name)}</span>
        )}
        {selected && size === "pick" && (
          <span className={styles.avatarSelectedOverlay} aria-hidden>
            <Image
              src="/game-new/check.svg"
              alt=""
              width={28}
              height={28}
              className={styles.avatarCheck}
            />
          </span>
        )}
      </div>
      <span className={styles.avatarName}>{name}</span>
    </>
  );

  if (!onClick) {
    return <div className={styles.avatarCell}>{inner}</div>;
  }

  return (
    <button
      type="button"
      className={styles.avatarCell}
      onClick={onClick}
      aria-pressed={selected}
    >
      {inner}
    </button>
  );
}
