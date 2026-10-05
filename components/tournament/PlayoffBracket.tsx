"use client";

import type { DisplayPlayoffMatch } from "@/lib/tournament/playoff-display";
import type { LocalMatchOccupancy } from "@/lib/tournament/local-match-occupancy";
import { matchPlayControls } from "@/lib/tournament/local-match-occupancy";
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
  localOccupancy?: Map<string, LocalMatchOccupancy>;
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
  localOccupancy,
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
                const controls = matchPlayControls({
                  serverPlayed: Boolean(m.winner_id),
                  serverGameId: m.game_id,
                  serverWinnerId: m.winner_id,
                  local: localOccupancy?.get(m.id),
                });
                const canPlay =
                  !m.isPreview &&
                  ready &&
                  controls.canPlay &&
                  matchLoading !== m.id;

                return (
                  <MatchupCard
                    key={m.id}
                    player1={p1}
                    player2={p2}
                    played={Boolean(m.winner_id)}
                    preview={m.isPreview}
                    gameId={m.game_id}
                    continueGameId={controls.continueGameId}
                    localFinished={controls.showLocalFinished}
                    winnerUserId={controls.effectiveWinnerId ?? m.winner_id}
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
