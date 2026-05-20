"use client";

import Image from "next/image";
import { useEffect } from "react";
import { hapticImpact } from "@/lib/haptic";
import { VICTORY_VAMPIRE_IMAGE } from "@/lib/game/victory-images";
import styles from "./victory.module.css";

type Props = {
  singleMatch: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function GameVictoryConfirmOverlay({
  singleMatch,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    hapticImpact("heavy");
  }, []);

  const title = singleMatch ? "Игра окончена" : "Раунд окончен";
  const confirmLabel = singleMatch ? "Завершить игру" : "Завершить раунд";

  return (
    <div
      className={styles.backdrop}
      data-victory-overlay
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-confirm-title"
    >
      <div className={[styles.panel, styles.panelConfirm].join(" ")}>
        <div className={styles.hero}>
          <div className={styles.vampireWrap} aria-hidden>
            <Image
              src={VICTORY_VAMPIRE_IMAGE}
              alt=""
              width={VICTORY_VAMPIRE_IMAGE.width}
              height={VICTORY_VAMPIRE_IMAGE.height}
              className={styles.vampireImg}
              priority
            />
          </div>
          <h2 id="victory-confirm-title" className={styles.title}>
            {title}
          </h2>
        </div>

        <div className={[styles.actions, styles.actionsConfirm].join(" ")}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              hapticImpact("light");
              onCancel();
            }}
          >
            Отменить
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              hapticImpact("medium");
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
