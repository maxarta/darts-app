import Link from "next/link";
import { BracketAvatar } from "./BracketAvatar";
import { MatchVsIcon } from "./MatchVsIcon";
import styles from "./tournament.module.css";

export type BracketPlayer = {
  userId: number;
  name: string;
  photoUrl: string | null;
};

type Props = {
  player1: BracketPlayer | null;
  player2: BracketPlayer | null;
  played?: boolean;
  preview?: boolean;
  scoreLabel?: string | null;
  gameId?: string | null;
  canPlay?: boolean;
  onPlay?: () => void;
  /** Круговой этап: завершённый матч */
  roundRobinComplete?: boolean;
  winnerUserId?: number | null;
  avatarSize?: "default" | "large";
};

export function MatchupCard({
  player1,
  player2,
  played = false,
  preview = false,
  scoreLabel,
  gameId,
  canPlay = false,
  onPlay,
  roundRobinComplete = false,
  winnerUserId = null,
  avatarSize = "default",
}: Props) {
  const ready = Boolean(player1 && player2);
  const showCompleted =
    winnerUserId != null || (roundRobinComplete && played);
  const showPlay = !preview && canPlay && ready && onPlay && !showCompleted;
  const showPlayLocked =
    preview && ready && !played && !gameId && !showCompleted;
  const showContinue =
    !preview &&
    !showCompleted &&
    gameId &&
    !showPlay &&
    winnerUserId == null;

  const p1Winner = winnerUserId != null && player1?.userId === winnerUserId;
  const p2Winner = winnerUserId != null && player2?.userId === winnerUserId;
  const p1Loser = winnerUserId != null && player1 && !p1Winner;
  const p2Loser = winnerUserId != null && player2 && !p2Winner;

  return (
    <article
      className={[
        styles.matchCard,
        played && !roundRobinComplete ? styles.matchCardPlayed : "",
        preview ? styles.matchCardPreview : "",
        avatarSize === "large" ? styles.matchCardLarge : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          styles.matchPlayers,
          avatarSize === "large" ? styles.matchPlayersLarge : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {player1 ? (
          <BracketAvatar
            name={player1.name}
            photoUrl={player1.photoUrl}
            size={avatarSize}
            isWinner={p1Winner}
            isLoser={Boolean(p1Loser)}
          />
        ) : (
          <span
            className={[
              styles.avatarPlaceholder,
              avatarSize === "large" ? styles.avatarPlaceholderLarge : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title="Ожидание"
          >
            <span className={styles.placeholderMark}>?</span>
          </span>
        )}
        <MatchVsIcon />
        {player2 ? (
          <BracketAvatar
            name={player2.name}
            photoUrl={player2.photoUrl}
            size={avatarSize}
            isWinner={p2Winner}
            isLoser={Boolean(p2Loser)}
          />
        ) : (
          <span
            className={[
              styles.avatarPlaceholder,
              avatarSize === "large" ? styles.avatarPlaceholderLarge : "",
            ]
              .filter(Boolean)
              .join(" ")}
            title="Ожидание"
          >
            <span className={styles.placeholderMark}>?</span>
          </span>
        )}
      </div>

      {scoreLabel && <p className={styles.matchScore}>{scoreLabel}</p>}

      {showPlay && (
        <button type="button" className={styles.playBtn} onClick={onPlay}>
          Играть
        </button>
      )}

      {showPlayLocked && (
        <button
          type="button"
          className={styles.playBtn}
          disabled
          title="Сначала начните плей-офф"
        >
          Играть
        </button>
      )}

      {showCompleted && (
        <button type="button" className={styles.playBtnDone} disabled>
          Игра завершена
        </button>
      )}

      {showContinue && (
        <Link href={`/game/${gameId}`} className={styles.playBtnSecondary}>
          Продолжить
        </Link>
      )}
    </article>
  );
}
