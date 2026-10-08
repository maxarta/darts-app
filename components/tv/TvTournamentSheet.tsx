"use client";

import { useMemo } from "react";
import { formatGameDate } from "@/components/stats/gameArchiveModel";
import { CollapsibleSection } from "@/components/tournament/CollapsibleSection";
import { FinalStageCard } from "@/components/tournament/FinalStageCard";
import { MatchupCard, type BracketPlayer } from "@/components/tournament/MatchupCard";
import { PlayoffBracket } from "@/components/tournament/PlayoffBracket";
import {
  buildPlayoffDisplay,
  getPlayoffBracketRounds,
  getPlayoffRoundCount,
} from "@/lib/tournament/playoff-display";
import { isPairKnockoutFormat } from "@/lib/tournament/pair-draw";
import { parseTournamentSettings } from "@/lib/tournament/settings";
import {
  KENNY_THEME_COLOR,
  normalizeTournamentVariant,
} from "@/lib/tournament/variant";
import { resolveStoredPhotoUrl } from "@/lib/user-photo";
import { displayName, type MemberUser } from "@/lib/channel/members";
import styles from "@/components/tournament/tournament.module.css";

type Participant = {
  user_id: number;
  users: MemberUser | MemberUser[] | null;
};

export type TvTournamentData = {
  tournament: {
    id: string;
    name: string;
    status: string;
    mode: string;
    variant?: string;
    playoff_size: number;
    channel_id: string;
    created_at?: string;
    settings?: unknown;
  };
  participants: Participant[];
  playoffMatches: Array<{
    id: string;
    round: number;
    slot: number;
    player1_id: number | null;
    player2_id: number | null;
    game_id: string | null;
    winner_id: number | null;
  }>;
  roundRobinMatches: Array<{
    id: string;
    player1_id: number;
    player2_id: number;
    game_id: string | null;
    played: boolean;
    points_p1: number | null;
    points_p2: number | null;
  }>;
};

function resolveUser(p: Participant): MemberUser | null {
  const u = p.users;
  if (!u) return null;
  return Array.isArray(u) ? (u[0] ?? null) : u;
}

type Props = {
  data: TvTournamentData;
};

/** Read-only tournament sheet for the TV board (no play controls). */
export function TvTournamentSheet({ data }: Props) {
  const variant = normalizeTournamentVariant(data.tournament.variant);
  const isKenny = variant === "kenny";
  const pairKo = isPairKnockoutFormat(data.tournament.settings);
  const playoffSize = (data.tournament.playoff_size === 8 ? 8 : 4) as 4 | 8;
  const { legsToWin } = parseTournamentSettings(data.tournament.settings);

  const player = (id: number | null): BracketPlayer | null => {
    if (id == null) return null;
    const row = data.participants.find((p) => p.user_id === id);
    const user = row ? resolveUser(row) : null;
    return {
      userId: id,
      name: displayName(user, id),
      photoUrl: resolveStoredPhotoUrl(id, user?.photo_url),
    };
  };

  const playoffDisplay = useMemo(() => {
    if (pairKo) {
      return data.playoffMatches
        .filter((m) => m.player2_id != null)
        .map((m) => ({ ...m, isPreview: false }));
    }
    return buildPlayoffDisplay(playoffSize, data.playoffMatches);
  }, [data.playoffMatches, playoffSize, pairKo]);

  const totalPlayoffRounds = useMemo(() => {
    if (!pairKo) return getPlayoffRoundCount(playoffSize);
    const rounds = playoffDisplay.map((m) => m.round);
    return rounds.length > 0 ? Math.max(...rounds) : 1;
  }, [pairKo, playoffSize, playoffDisplay]);

  const playoffBracketRounds = useMemo(() => {
    if (!pairKo) return getPlayoffBracketRounds(playoffSize);
    return Array.from(
      { length: Math.max(0, totalPlayoffRounds - 1) },
      (_, i) => i + 1
    );
  }, [pairKo, playoffSize, totalPlayoffRounds]);

  const finalMatch =
    playoffDisplay
      .filter((m) => m.round === totalPlayoffRounds)
      .sort((a, b) => a.slot - b.slot)[0] ?? null;

  const needsDraw = pairKo
    ? data.tournament.status === "round_robin" &&
      data.playoffMatches.length === 0
    : data.tournament.status === "round_robin" &&
      data.roundRobinMatches.length === 0;

  const dateLabel = data.tournament.created_at
    ? formatGameDate(data.tournament.created_at)
    : null;

  return (
    <div
      className={styles.screen}
      data-tournament-screen
      {...(isKenny ? { "data-tournament-kenny": "" } : {})}
      style={
        isKenny
          ? { background: KENNY_THEME_COLOR }
          : undefined
      }
    >
      <div className={styles.scroll}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{data.tournament.name}</h1>
            <p className={styles.status}>
              501 · до {legsToWin} {legsToWin === 1 ? "победы" : "побед"}
              {pairKo ? " · пары" : ` · топ-${data.tournament.playoff_size}`}
              {dateLabel ? ` · ${dateLabel}` : ""}
            </p>
          </div>
        </header>

        {needsDraw ? (
          <CollapsibleSection
            title="Жеребьёвка"
            meta="Ожидание"
            open
            onToggle={() => {}}
          >
            <p className={styles.drawHint}>
              Жеребьёвка ещё не проведена — пары появятся на телефоне
              организатора.
            </p>
          </CollapsibleSection>
        ) : null}

        {!pairKo && data.roundRobinMatches.length > 0 ? (
          <CollapsibleSection
            title="Круговой этап"
            meta={`${data.roundRobinMatches.filter((m) => m.played).length}/${data.roundRobinMatches.length}`}
            open
            onToggle={() => {}}
          >
            <div className={styles.rrGrid}>
              {data.roundRobinMatches.map((m) => (
                <MatchupCard
                  key={m.id}
                  player1={player(m.player1_id)}
                  player2={player(m.player2_id)}
                  played={m.played}
                  scoreLabel={
                    m.played && m.points_p1 != null && m.points_p2 != null
                      ? `${m.points_p1} : ${m.points_p2}`
                      : null
                  }
                  roundRobinComplete
                  winnerUserId={
                    m.played && m.points_p1 != null && m.points_p2 != null
                      ? m.points_p1 > m.points_p2
                        ? m.player1_id
                        : m.player2_id
                      : null
                  }
                />
              ))}
            </div>
          </CollapsibleSection>
        ) : null}

        {playoffDisplay.length > 0 ? (
          <CollapsibleSection
            title={pairKo ? "Сетка" : "Плей-офф"}
            open
            onToggle={() => {}}
            className={styles.playoffCard}
          >
            <PlayoffBracket
              rounds={playoffBracketRounds}
              totalRounds={totalPlayoffRounds}
              matches={playoffDisplay}
              player={player}
              matchLoading={null}
              layout="stack"
              onPlay={() => {}}
              localOccupancy={new Map()}
            />
          </CollapsibleSection>
        ) : null}

        <FinalStageCard
          match={finalMatch}
          player={player}
          matchLoading={null}
          onPlay={() => {}}
          showKennyPrize={isKenny}
          confettiVariant={isKenny ? "kenny" : "default"}
          celebrating={Boolean(finalMatch?.winner_id)}
        />
      </div>
    </div>
  );
}
