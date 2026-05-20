"use client";

import Link from "next/link";
import Image from "next/image";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { TournamentConfetti } from "./TournamentConfetti";
import type { DisplayPlayoffMatch } from "@/lib/tournament/playoff-display";
import {
  FINAL_MATCH_LEGS_TO_WIN,
} from "@/lib/tournament/settings";
import { formatLegsToWinLabel } from "@/lib/tournament/legs-label";
import { BracketAvatar } from "./BracketAvatar";
import type { BracketPlayer } from "./MatchupCard";
import { MatchVsIcon } from "./MatchVsIcon";
import { KennyGrandPrizeBanner } from "./KennyGrandPrizeBanner";
import styles from "./tournament.module.css";

type Props = {
  match: DisplayPlayoffMatch | null;
  player: (id: number | null) => BracketPlayer | null;
  matchLoading: string | null;
  onPlay: (matchId: string) => void;
  /** Показать блок главного приза (турнир Кенни) */
  showKennyPrize?: boolean;
  confettiVariant?: "kenny" | "default";
  celebrating?: boolean;
  championSaluteRef?: RefObject<HTMLDivElement | null>;
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

function ChampionPortrait({
  champion,
  circleRef,
}: {
  champion: BracketPlayer | null;
  circleRef?: RefObject<HTMLDivElement | null>;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [champion?.userId, champion?.photoUrl]);

  const showImage = Boolean(champion?.photoUrl) && !imgFailed;

  if (!champion) {
    return (
      <div className={styles.championPortrait}>
        <div
          ref={circleRef}
          className={`${styles.championCircle} ${styles.championCircleEmpty}`}
        >
          <span className={styles.championPlaceholderMark}>?</span>
        </div>
        <span className={styles.championName}>Пока неизвестно</span>
      </div>
    );
  }

  return (
    <div className={styles.championPortrait}>
      <div ref={circleRef} className={styles.championCircle}>
        {showImage ? (
          <Image
            src={champion.photoUrl!}
            alt=""
            width={120}
            height={120}
            className={styles.avatarImg}
            unoptimized
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className={styles.championFallback}>
            {initials(champion.name)}
          </span>
        )}
      </div>
      <span className={styles.championName}>{champion.name}</span>
    </div>
  );
}

export const FinalStageCard = forwardRef<HTMLElement, Props>(function FinalStageCard(
  {
    match,
    player,
    matchLoading,
    onPlay,
    showKennyPrize = false,
    confettiVariant = "default",
    celebrating = false,
    championSaluteRef,
  },
  ref
) {
  const setCardRef = useCallback(
    (node: HTMLElement | null) => {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );

  const p1 = match ? player(match.player1_id) : null;
  const p2 = match ? player(match.player2_id) : null;
  const ready = Boolean(p1 && p2);
  const canPlay =
    match &&
    !match.isPreview &&
    ready &&
    !match.winner_id &&
    !match.game_id &&
    matchLoading !== match.id;

  const championId = match?.winner_id ?? null;
  const champion = championId ? player(championId) : null;
  const p1Loser = championId != null && p1 && p1.userId !== championId;
  const p2Loser = championId != null && p2 && p2.userId !== championId;

  return (
    <article
      ref={setCardRef}
      className={styles.finalCard}
      data-celebrating={celebrating ? "" : undefined}
      aria-label="Финал"
      id="tournament-final-card"
    >
      <h2 className={styles.finalTitle}>Финал</h2>
      <p className={styles.finalSubtitle}>
        {formatLegsToWinLabel(FINAL_MATCH_LEGS_TO_WIN)}
      </p>

      <div className={styles.finalMatchBlock}>
        {p1 ? (
          <BracketAvatar
            name={p1.name}
            photoUrl={p1.photoUrl}
            size="xlarge"
            showCrownNotch={ready}
            isWinner={championId != null && p1.userId === championId}
            isLoser={Boolean(p1Loser)}
          />
        ) : (
          <span className={styles.avatarPlaceholderXlarge} aria-hidden>
            <span className={styles.placeholderMark}>?</span>
          </span>
        )}
        <MatchVsIcon variant="final" />
        {p2 ? (
          <BracketAvatar
            name={p2.name}
            photoUrl={p2.photoUrl}
            size="xlarge"
            showCrownNotch={ready}
            isWinner={championId != null && p2.userId === championId}
            isLoser={Boolean(p2Loser)}
          />
        ) : (
          <span className={styles.avatarPlaceholderXlarge} aria-hidden>
            <span className={styles.placeholderMark}>?</span>
          </span>
        )}
      </div>

      {canPlay && match && (
        <button
          type="button"
          className={styles.playBtn}
          onClick={() => onPlay(match.id)}
        >
          Играть
        </button>
      )}

      {match?.game_id && !match.winner_id && (
        <Link href={`/game/${match.game_id}`} className={styles.playBtnSecondary}>
          Продолжить финал
        </Link>
      )}

      <div
        className={styles.finalChampionSection}
        data-celebrating={celebrating ? "" : undefined}
      >
        <p className={styles.championHeading}>Чемпион</p>
        <ChampionPortrait champion={champion} circleRef={championSaluteRef} />
      </div>

      {celebrating && championSaluteRef ? (
        <TournamentConfetti
          active
          originRef={championSaluteRef}
          variant={confettiVariant}
        />
      ) : null}

      {showKennyPrize ? <KennyGrandPrizeBanner /> : null}
    </article>
  );
});

FinalStageCard.displayName = "FinalStageCard";
