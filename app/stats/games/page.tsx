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
import { getGameLegsPlayed } from "@/lib/stats/game-winners";
import {
  StatsEmpty,
  StatsList,
  StatsLoading,
  StatsScreen,
} from "@/components/stats/StatsScreen";
import statsStyles from "@/components/stats/statsScreen.module.css";
import archiveStyles from "@/components/stats/currentGames.module.css";
import { statsFetchMessage } from "@/components/stats/statsFetchError";
import { apiFetch } from "@/lib/api/client";
import { isMultiplayerGame } from "@/lib/game/multiplayer";
import {
  type ArchivedTournament,
  tournamentArchiveHref,
  tournamentArchiveMeta,
} from "@/lib/tournament/archive";

function GamesContent() {
  const params = useSearchParams();
  const channelId = params.get("channelId") ?? "";
  const [games, setGames] = useState<ArchiveGameRow[]>([]);
  const [tournaments, setTournaments] = useState<ArchivedTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<{ games: ArchiveGameRow[] }>(
        `/api/channels/${encodeURIComponent(channelId)}/games`
      ),
      apiFetch<{ tournaments: ArchivedTournament[] }>(
        `/api/channels/${encodeURIComponent(channelId)}/tournaments`
      ),
    ])
      .then(([gamesRes, tournamentsRes]) => {
        setGames(
          gamesRes.games.filter((g) => isMultiplayerGame(g.game_players))
        );
        setTournaments(tournamentsRes.tournaments);
      })
      .catch((err) => setError(statsFetchMessage(err)))
      .finally(() => setLoading(false));
  }, [channelId]);

  const empty =
    !loading && !error && games.length === 0 && tournaments.length === 0;

  return (
    <StatsScreen title="Архив">
      {loading ? (
        <StatsLoading />
      ) : error ? (
        <StatsEmpty>{error}</StatsEmpty>
      ) : empty ? (
        <StatsEmpty>Пока нет завершённых игр и турниров</StatsEmpty>
      ) : (
        <>
          {tournaments.length > 0 ? (
            <>
              <h2 className={statsStyles.sectionTitle}>Турниры</h2>
              <StatsList>
                {tournaments.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={tournamentArchiveHref(t.id, channelId, t.variant)}
                      className={archiveStyles.tournamentLink}
                    >
                      <span className={archiveStyles.tournamentName}>
                        {t.name}
                      </span>
                      <span className={archiveStyles.tournamentMeta}>
                        {tournamentArchiveMeta(t)} ·{" "}
                        {formatGameDate(t.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </StatsList>
            </>
          ) : null}
          {games.length > 0 ? (
            <>
              <h2 className={statsStyles.sectionTitle}>Игры</h2>
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
            </>
          ) : null}
        </>
      )}
    </StatsScreen>
  );
}

export default function GamesPage() {
  return (
    <Suspense>
      <GamesContent />
    </Suspense>
  );
}
