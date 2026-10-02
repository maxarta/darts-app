import Link from "next/link";
import type { CSSProperties } from "react";
import { StatsPlayerAvatar } from "@/components/stats/StatsPlayerAvatar";
import { ruLegsCount } from "@/lib/i18n/ru-plural";
import styles from "./statsScreen.module.css";

export type StatsGamePlayer = {
  name: string;
  legsWon: number;
  isWinner?: boolean;
  photoUrl?: string | null;
};

type StatsGameLinkProps = {
  href: string;
  mode: string;
  legsPlayed: number;
  players: StatsGamePlayer[];
  dateLabel: string;
  dateIso: string;
};

const GAME_CARD_AVATAR_SIZE = 40;
const GAME_CARD_AVATAR_DEFAULT_OVERLAP = 8;

function gameCardAvatarsWidthPx() {
  return (
    GAME_CARD_AVATAR_SIZE +
    (GAME_CARD_AVATAR_SIZE - GAME_CARD_AVATAR_DEFAULT_OVERLAP)
  );
}

function avatarOverlapPx(count: number) {
  if (count <= 1) return 0;
  if (count === 2) return GAME_CARD_AVATAR_DEFAULT_OVERLAP;
  const fixedWidth = gameCardAvatarsWidthPx();
  const overlap =
    GAME_CARD_AVATAR_SIZE -
    (fixedWidth - GAME_CARD_AVATAR_SIZE) / (count - 1);
  return Math.min(
    GAME_CARD_AVATAR_SIZE - 4,
    Math.ceil(overlap)
  );
}

export function StatsGameLink({
  href,
  mode,
  legsPlayed,
  players,
  dateLabel,
  dateIso,
}: StatsGameLinkProps) {
  const overlap = avatarOverlapPx(players.length);
  const avatarStyle = {
    "--game-card-avatars-width": `${gameCardAvatarsWidthPx()}px`,
    ...(overlap > 0
      ? { "--game-card-avatar-overlap": `-${overlap}px` }
      : {}),
  } as CSSProperties;

  return (
    <li>
      <Link href={href} className={styles.gameCardLink}>
        <div className={styles.gameCardAvatars} style={avatarStyle}>
          {players.map((player, index) => (
            <span
              key={`${player.name}-${index}`}
              className={styles.gameCardAvatarItem}
              style={{ zIndex: players.length - index }}
            >
              <span className={styles.gameCardAvatar}>
                <StatsPlayerAvatar
                  name={player.name}
                  photoUrl={player.photoUrl}
                  size="lg"
                />
              </span>
              {player.isWinner ? (
                <span className={styles.gameCardAvatarCrown} aria-hidden>
                  👑
                </span>
              ) : null}
            </span>
          ))}
        </div>

        <div className={styles.gameCardCenter}>
          <p className={styles.gameCardPlayersLine}>
            {players.map((player, index) => (
              <span key={`${player.name}-${index}`}>
                {index > 0 ? (
                  <span className={styles.gameCardSep}> / </span>
                ) : null}
                <span className={styles.gameCardPlayerChunk}>
                  {player.isWinner ? (
                    <span className={styles.gameCardCrown} aria-hidden>
                      👑
                    </span>
                  ) : null}
                  <span>{player.name}</span>
                  <span className={styles.gameCardLegsWon}>
                    {player.legsWon}
                  </span>
                </span>
              </span>
            ))}
          </p>
          <div className={styles.gameCardMetaRow}>
            <span className={styles.gameCardModeSub}>
              {mode} • {ruLegsCount(legsPlayed)}
            </span>
            <time className={styles.gameCardDate} dateTime={dateIso}>
              {dateLabel}
            </time>
          </div>
        </div>
      </Link>
    </li>
  );
}
