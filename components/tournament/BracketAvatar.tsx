"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./tournament.module.css";

type Props = {
  name: string;
  photoUrl?: string | null;
  size?: "default" | "large" | "xlarge";
  isWinner?: boolean;
  /** Crown + top notch (e.g. both finalists in the final card). */
  showCrownNotch?: boolean;
  isLoser?: boolean;
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

export function BracketAvatar({
  name,
  photoUrl,
  size = "default",
  isWinner = false,
  showCrownNotch = false,
  isLoser = false,
}: Props) {
  const crownNotch = !isLoser && (isWinner || showCrownNotch);
  const [imgFailed, setImgFailed] = useState(false);
  const xlarge = size === "xlarge";
  const large = size === "large" || xlarge;
  const px = xlarge ? 96 : large ? 80 : 48;
  const showImage = Boolean(photoUrl) && !imgFailed;

  return (
    <div
      className={[
        styles.bracketAvatar,
        isLoser ? styles.bracketAvatarLoser : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          styles.avatarWrap,
          xlarge
            ? styles.avatarWrapXlarge
            : large
              ? styles.avatarWrapLarge
              : "",
          crownNotch ? styles.avatarWrapWinner : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {crownNotch && (
          <span className={styles.crown} aria-hidden>
            👑
          </span>
        )}
        <div
          className={[
            styles.avatarCircle,
            xlarge
              ? styles.avatarCircleXlarge
              : large
                ? styles.avatarCircleLarge
                : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {showImage ? (
            <Image
              src={photoUrl!}
              alt=""
              width={px}
              height={px}
              className={styles.avatarImg}
              unoptimized
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span
              className={[
                styles.avatarFallback,
                xlarge
                  ? styles.avatarFallbackXlarge
                  : large
                    ? styles.avatarFallbackLarge
                    : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {initials(name)}
            </span>
          )}
        </div>
      </div>
      <span
        className={[
          styles.avatarName,
          xlarge
            ? styles.avatarNameXlarge
            : large
              ? styles.avatarNameLarge
              : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {name}
      </span>
    </div>
  );
}
