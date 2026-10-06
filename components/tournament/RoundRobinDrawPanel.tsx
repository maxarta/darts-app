"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/Button";
import { MatchupCard, type BracketPlayer } from "./MatchupCard";
import styles from "./tournament.module.css";

const DRAW_SPIN_MS = 5000;
const REVEAL_STEP_MS = 480;

export type RoundRobinMatchRow = {
  id: string;
  player1_id: number;
  player2_id: number;
  game_id: string | null;
  played: boolean;
  points_p1: number | null;
  points_p2: number | null;
};

type DrawPhase = "idle" | "spinning" | "revealing" | "done";

type DrawResponse = {
  roundRobinMatches?: RoundRobinMatchRow[];
  playoffMatches?: Array<{
    id: string;
    player1_id: number | null;
    player2_id: number | null;
    game_id: string | null;
    winner_id: number | null;
  }>;
};

type Props = {
  tournamentId: string;
  player: (id: number) => BracketPlayer | null;
  onDrawn: (matches: RoundRobinMatchRow[]) => void;
  onPhaseChange?: (phase: DrawPhase) => void;
  /** pair_ko: subtitle about random pairs / byes */
  pairKnockout?: boolean;
};

export function RoundRobinDrawPanel({
  tournamentId,
  player,
  onDrawn,
  onPhaseChange,
  pairKnockout = false,
}: Props) {
  const [phase, setPhase] = useState<DrawPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<RoundRobinMatchRow[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);

  const setPhaseSafe = useCallback(
    (next: DrawPhase) => {
      setPhase(next);
      onPhaseChange?.(next);
    },
    [onPhaseChange]
  );

  const runDraw = async () => {
    setError(null);
    setMatches([]);
    setRevealedCount(0);
    setPhaseSafe("spinning");

    const spinStarted = Date.now();
    try {
      const data = await apiFetch<DrawResponse>(
        `/api/tournaments/${tournamentId}/draw`,
        { method: "POST" }
      );

      const waitMs = Math.max(0, DRAW_SPIN_MS - (Date.now() - spinStarted));
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const fromRr = data.roundRobinMatches ?? [];
      const fromPairs = (data.playoffMatches ?? [])
        .filter((m) => m.player1_id != null && m.player2_id != null)
        .map((m) => ({
          id: m.id,
          player1_id: m.player1_id as number,
          player2_id: m.player2_id as number,
          game_id: m.game_id,
          played: Boolean(m.winner_id),
          points_p1: null,
          points_p2: null,
        }));
      const drawn = fromRr.length > 0 ? fromRr : fromPairs;
      setMatches(drawn);
      setPhaseSafe("revealing");

      for (let i = 1; i <= drawn.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, REVEAL_STEP_MS));
        setRevealedCount(i);
      }

      setPhaseSafe("done");
      onDrawn(drawn);
    } catch (e) {
      setPhaseSafe("idle");
      setError(e instanceof Error ? e.message : "Не удалось провести жеребьёвку");
    }
  };

  const visible = matches.slice(0, revealedCount);

  return (
    <div className={styles.drawPanel}>
      {phase === "idle" && (
        <>
          <p className={styles.drawHint}>
            {pairKnockout
              ? "Случайные пары до двух побед. При нечётном числе один игрок проходит без игры."
              : "Пары кругового этапа появятся после жеребьёвки в случайном порядке."}
          </p>
          <Button
            type="button"
            size="medium"
            variant="primary"
            fullWidth
            onClick={() => void runDraw()}
          >
            Жеребьёвка
          </Button>
        </>
      )}

      {phase === "spinning" && (
        <div className={styles.drawSpinnerWrap}>
          <LoadingSpinner label="" />
        </div>
      )}

      {(phase === "revealing" || phase === "done") && visible.length > 0 && (
        <div className={styles.rrGrid}>
          {visible.map((m) => {
            const p1 = player(m.player1_id);
            const p2 = player(m.player2_id);
            return (
              <div key={m.id} className={styles.rrPairReveal}>
                <MatchupCard
                  player1={p1}
                  player2={p2}
                  played={false}
                  roundRobinComplete
                  canPlay={false}
                />
              </div>
            );
          })}
        </div>
      )}

      {error ? (
        <p className={styles.drawError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
