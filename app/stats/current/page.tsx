"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  type ArchiveGameRow,
  buildArchivePlayers,
  formatGameDate,
  gameArchiveHref,
} from "@/components/stats/gameArchiveModel";
import { StatsGameLink } from "@/components/stats/StatsGameLink";
import {
  StatsEmpty,
  StatsList,
  StatsLoading,
  StatsScreen,
} from "@/components/stats/StatsScreen";
import { statsFetchMessage } from "@/components/stats/statsFetchError";
import type { ActiveTournament } from "@/lib/tournament/active";
import {
  TOURNAMENT_VARIANT_LABEL,
} from "@/lib/tournament/variant";
import { apiFetch } from "@/lib/api/client";
import { getGameLegsPlayed } from "@/lib/stats/game-winners";
import { isMultiplayerGame } from "@/lib/game/multiplayer";
import styles from "@/components/stats/currentGames.module.css";

function tournamentMeta(t: ActiveTournament) {
  if (t.variant === "kenny") return TOURNAMENT_VARIANT_LABEL.kenny;
  return t.status === "playoff" ? "Плей-офф" : "Круговой этап";
}

function tournamentHref(t: ActiveTournament, channelId: string) {
  const q = new URLSearchParams({ channelId });
  if (t.variant === "kenny") q.set("variant", "kenny");
  return `/tournament/${t.id}?${q.toString()}`;
}

function CurrentGamesContent() {
  const params = useSearchParams();
  const channelId = params.get("channelId") ?? "";
  const [games, setGames] = useState<ArchiveGameRow[]>([]);
  const [tournaments, setTournaments] = useState<ActiveTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<{ games: ArchiveGameRow[]; tournaments: ActiveTournament[] }>(
      `/api/channels/${encodeURIComponent(channelId)}/current`
    )
      .then((d) => {
        setGames(d.games.filter((g) => isMultiplayerGame(g.game_players)));
        setTournaments(d.tournaments);
      })
      .catch((err) => setError(statsFetchMessage(err)))
      .finally(() => setLoading(false));
  }, [channelId]);

  const empty = !loading && !error && games.length === 0 && tournaments.length === 0;

  return (
    <StatsScreen title="Текущие игры">
      {loading ? (
        <StatsLoading />
      ) : error ? (
        <StatsEmpty>{error}</StatsEmpty>
      ) : empty ? (
        <StatsEmpty>Нет незавершённых игр и турниров</StatsEmpty>
      ) : (
        <>
          {tournaments.length > 0 && (
            <StatsList>
              {tournaments.map((t) => (
                <li key={t.id}>
                  <Link
                    href={tournamentHref(t, channelId)}
                    className={styles.tournamentLink}
                  >
                    <span className={styles.tournamentName}>{t.name}</span>
                    <span className={styles.tournamentMeta}>
                      Турнир · {tournamentMeta(t)}
                    </span>
                  </Link>
                </li>
              ))}
            </StatsList>
          )}
          {games.length > 0 && (
            <StatsList>
              {games.map((g) => (
                <StatsGameLink
                  key={g.id}
                  href={gameArchiveHref(g.id, channelId)}
                  mode={g.mode}
                  legsPlayed={getGameLegsPlayed(g.game_players ?? [])}
                  players={buildArchivePlayers(g)}
                  dateLabel={formatGameDate(g.created_at)}
                  dateIso={g.created_at.slice(0, 10)}
                />
              ))}
            </StatsList>
          )}
        </>
      )}
    </StatsScreen>
  );
}

export default function CurrentGamesPage() {
  return (
    <Suspense>
      <CurrentGamesContent />
    </Suspense>
  );
}
