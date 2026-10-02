"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  type ArchiveGameRow,
  buildArchivePlayers,
  formatGameDate,
  gameArchiveHref,
} from "@/components/stats/gameArchiveModel";
import { StatsGameHistoryItem } from "@/components/stats/StatsGameHistoryItem";
import {
  StatsEmpty,
  StatsList,
  StatsLoading,
  StatsScreen,
} from "@/components/stats/StatsScreen";
import { statsFetchMessage } from "@/components/stats/statsFetchError";
import { apiFetch } from "@/lib/api/client";
import type { ThrowInput } from "@/lib/darts/rules";
import { formatStatsPlayerSummary } from "@/lib/i18n/ru-plural";
import { isMultiplayerGame } from "@/lib/game/multiplayer";
import { getGameLegsPlayed } from "@/lib/stats/game-winners";
import { resolveStoredPhotoUrl } from "@/lib/telegram/user-photo";

type PlayerProfile = {
  name: string;
  photoUrl: string | null;
};

type PlayerStats = {
  gamesPlayed: number;
  avgPpr: number;
  wins: number;
  avgWinRound: number | null;
};

function PlayerDetailContent() {
  const params = useParams();
  const search = useSearchParams();
  const userId = params.userId as string;
  const channelId = search.get("channelId") ?? "";
  const uid = Number(userId);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [games, setGames] = useState<ArchiveGameRow[]>([]);
  const [throwsByGame, setThrowsByGame] = useState<
    Record<string, ThrowInput[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId || !userId || Number.isNaN(uid)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<{
        stats: PlayerStats;
        profile?: PlayerProfile;
        throwsByGame?: Record<string, ThrowInput[]>;
      }>(`/api/stats/player?channelId=${channelId}&userId=${userId}`),
      apiFetch<{ games: ArchiveGameRow[] }>(
        `/api/channels/${channelId}/games`
      ),
    ])
      .then(([player, { games: allGames }]) => {
        setProfile(
          player.profile ?? {
            name: `Игрок #${userId}`,
            photoUrl: resolveStoredPhotoUrl(uid, null),
          }
        );
        setStats(player.stats);
        setThrowsByGame(player.throwsByGame ?? {});
        setGames(
          allGames.filter(
            (g) =>
              isMultiplayerGame(g.game_players) &&
              g.game_players.some((p) => p.user_id === uid)
          )
        );
      })
      .catch((err) => setError(statsFetchMessage(err)))
      .finally(() => setLoading(false));
  }, [channelId, userId, uid]);

  const profileSummary = stats
    ? formatStatsPlayerSummary(
        stats.gamesPlayed,
        stats.avgPpr,
        stats.wins
      )
    : undefined;

  return (
    <StatsScreen
      profile={
        profile
          ? {
              name: profile.name,
              photoUrl: profile.photoUrl,
              summary: profileSummary,
            }
          : {
              name: `Игрок #${userId}`,
              summary: profileSummary,
            }
      }
    >
      {loading ? (
        <StatsLoading />
      ) : error ? (
        <StatsEmpty>{error}</StatsEmpty>
      ) : (
        <>
          {games.length === 0 ? (
            <StatsEmpty>Пока нет завершённых игр</StatsEmpty>
          ) : (
            <StatsList>
              {games.map((g) => (
                <StatsGameHistoryItem
                  key={g.id}
                  href={gameArchiveHref(g.id, channelId)}
                  mode={g.mode}
                  legsPlayed={getGameLegsPlayed(g.game_players ?? [])}
                  players={buildArchivePlayers(g)}
                  dateLabel={formatGameDate(g.created_at)}
                  dateIso={g.created_at.slice(0, 10)}
                  throws={throwsByGame[g.id] ?? []}
                />
              ))}
            </StatsList>
          )}
        </>
      )}
    </StatsScreen>
  );
}

export default function PlayerDetailPage() {
  return (
    <Suspense>
      <PlayerDetailContent />
    </Suspense>
  );
}
