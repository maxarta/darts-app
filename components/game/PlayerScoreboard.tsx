"use client";

import { AnimatedNumber } from "./AnimatedNumber";
import { ScoreChip } from "./ScoreChip";
import styles from "./game.module.css";

export type PlayerDisplay = {
  id: string;
  name: string;
  remaining: number;
  /** Очки, набранные в текущем визите (белый чип) */
  visitScore: number;
  /** Счёт на начало визита (зачёркнутый) */
  visitStartScore: number;
  showVisitChip: boolean;
  bust?: boolean;
  ppr: number;
  active: boolean;
};

type Props = {
  players: PlayerDisplay[];
};

export function PlayerScoreboard({ players }: Props) {
  const multi = players.length > 2;

  if (multi) {
    return (
      <div className={styles.scoreboardMulti} role="list">
        {players.map((player) => (
          <PlayerColumnCompact key={player.id} player={player} />
        ))}
      </div>
    );
  }

  if (players.length === 1) {
    return (
      <div className={styles.scoreboardDuo}>
        <PlayerPanelDuo player={players[0]} side="left" solo />
      </div>
    );
  }

  const [left, right] = players;
  return (
    <div className={styles.scoreboardDuo}>
      <PlayerPanelDuo player={left} side="left" />
      <PlayerPanelDuo player={right} side="right" />
    </div>
  );
}

function PlayerColumnCompact({ player }: { player: PlayerDisplay }) {
  const panelClass = player.bust
    ? styles.playerCompactBust
    : player.active
      ? styles.playerCompactActive
      : styles.playerCompactIdle;

  return (
    <article
      className={`${styles.playerCompact} ${panelClass}`}
      role="listitem"
      aria-current={player.active ? "true" : undefined}
    >
      <div className={styles.playerCompactDisplay}>
        <AnimatedNumber
          value={player.remaining}
          className={styles.playerCompactScore}
        />
        <span className={styles.playerCompactName}>{player.name}</span>
      </div>
      <div className={styles.pprBar}>PPR: {player.ppr.toFixed(1)}</div>
    </article>
  );
}

function PlayerPanelDuo({
  player,
  side,
  solo,
}: {
  player: PlayerDisplay;
  side: "left" | "right";
  solo?: boolean;
}) {
  const active = player.active;
  const metaFirst = side === "left" || solo;

  const panelClass = player.bust
    ? styles.playerDuoBust
    : active
      ? styles.playerDuoActive
      : styles.playerDuoIdle;

  return (
    <article
      className={`${styles.playerDuo} ${panelClass}`}
      aria-current={active ? "true" : undefined}
    >
      <div
        className={`${styles.playerDuoRow}${metaFirst ? "" : ` ${styles.playerDuoRowScoreFirst}`}`}
      >
        {metaFirst ? (
          <>
            <div className={styles.playerDuoMeta}>
              <div className={styles.playerDuoMetaTop}>
                <span className={styles.startScoreStrike}>
                  {player.visitStartScore}
                </span>
                {player.showVisitChip && (
                  <ScoreChip variant="white" whiteTone="scoreboard">
                    <AnimatedNumber value={player.visitScore} />
                  </ScoreChip>
                )}
              </div>
              <span className={styles.playerDuoName}>{player.name}</span>
            </div>
            <AnimatedNumber
              value={player.remaining}
              className={styles.playerDuoBigScore}
            />
          </>
        ) : (
          <>
            <AnimatedNumber
              value={player.remaining}
              className={styles.playerDuoBigScore}
            />
            <div className={styles.playerDuoMeta}>
              <div className={styles.playerDuoMetaTop}>
                <span className={styles.startScoreStrike}>
                  {player.visitStartScore}
                </span>
                {player.showVisitChip && (
                  <ScoreChip variant="white" whiteTone="scoreboard">
                    <AnimatedNumber value={player.visitScore} />
                  </ScoreChip>
                )}
              </div>
              <span className={styles.playerDuoName}>{player.name}</span>
            </div>
          </>
        )}
      </div>
      <div className={styles.pprBar}>PPR: {player.ppr.toFixed(1)}</div>
    </article>
  );
}
