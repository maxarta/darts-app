"use client";

import type { DisplayPlayoffMatch } from "@/lib/tournament/playoff-display";
import { MatchupCard, type BracketPlayer } from "./MatchupCard";
import styles from "./tournament.module.css";

type Props = {
  rounds: number[];
  totalRounds: number;
  matches: DisplayPlayoffMatch[];
  player: (id: number | null) => BracketPlayer | null;
  matchLoading: string | null;
  avatarSize?: "default" | "large";
  layout?: "stack" | "row";
  onPlay: (matchId: string) => void;
};

export function PlayoffBracket({
  rounds,
  totalRounds,
  matches,
  player,
  matchLoading,
  avatarSize = "default",
  layout = "stack",
  onPlay,
}: Props) {
  if (rounds.length === 0) {
    return <p className={styles.playoffEmpty}>Нет матчей на этом этапе</p>;
  }

  const rootClass = layout === "row" ? styles.bracket : styles.bracketStack;
  const roundClass = layout === "row" ? styles.roundColumn : styles.roundBlock;

  return (
    <div className={rootClass}>
      {rounds.map((round) => {
        const roundMatches = matches
          .filter((m) => m.round === round)
          .sort((a, b) => a.slot - b.slot);
        if (roundMatches.length === 0) return null;

        return (
          <div key={round} className={roundClass}>
            <div className={styles.roundMatches}>
              {roundMatches.map((m) => {
                const p1 = player(m.player1_id);
                const p2 = player(m.player2_id);
                const ready = Boolean(m.player1_id && m.player2_id);
                const canPlay =
                  !m.isPreview &&
                  ready &&
                  !m.winner_id &&
                  !m.game_id &&
                  matchLoading !== m.id;

                return (
                  <MatchupCard
                    key={m.id}
                    player1={p1}
                    player2={p2}
                    played={Boolean(m.winner_id)}
                    preview={m.isPreview}
                    gameId={m.game_id}
                    winnerUserId={m.winner_id}
                    avatarSize={avatarSize}
                    canPlay={canPlay}
                    onPlay={canPlay ? () => onPlay(m.id) : undefined}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
