"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  StatsEmpty,
  StatsList,
  StatsLoading,
  StatsPlayerLink,
  StatsScreen,
} from "@/components/stats/StatsScreen";
import { statsFetchMessage } from "@/components/stats/statsFetchError";
import { apiFetch } from "@/lib/api/client";
import { formatStatsLeaderboardMeta } from "@/lib/i18n/ru-plural";

type LeaderboardEntry = {
  userId: number;
  name: string;
  photoUrl: string | null;
  gamesPlayed: number;
  wins: number;
  avgPpr: number;
  legsWon: number;
  avgWinRound: number | null;
};

function PlayersContent() {
  const params = useSearchParams();
  const channelId = params.get("channelId") ?? "";
  const [list, setList] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<{ leaderboard: LeaderboardEntry[] }>(
      `/api/stats/leaderboard?channelId=${channelId}`
    )
      .then((d) => setList(d.leaderboard ?? []))
      .catch((err) => setError(statsFetchMessage(err)))
      .finally(() => setLoading(false));
  }, [channelId]);

  return (
    <StatsScreen title="Участники">
      {loading ? (
        <StatsLoading />
      ) : error ? (
        <StatsEmpty>{error}</StatsEmpty>
      ) : list.length === 0 ? (
        <StatsEmpty>Пока нет игроков в реестре</StatsEmpty>
      ) : (
        <StatsList>
          {list.map((p, i) => (
            <StatsPlayerLink
              key={p.userId}
              href={`/stats/players/${p.userId}?channelId=${channelId}`}
              name={p.name}
              photoUrl={p.photoUrl}
              title={`${i + 1}. ${p.name}`}
              badge={`PPR ${p.avgPpr}`}
              meta={formatStatsLeaderboardMeta(
                p.gamesPlayed,
                p.wins,
                p.legsWon,
                p.avgWinRound
              )}
            />
          ))}
        </StatsList>
      )}
    </StatsScreen>
  );
}

export default function PlayersPage() {
  return (
    <Suspense>
      <PlayersContent />
    </Suspense>
  );
}
