"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { StatsDartboardHeatmap } from "@/components/stats/StatsDartboardHeatmap";
import {
  StatsEmpty,
  StatsLoading,
  StatsScreen,
} from "@/components/stats/StatsScreen";
import styles from "@/components/stats/statsScreen.module.css";
import { Button } from "@/components/ui/Button";
import { statsFetchMessage } from "@/components/stats/statsFetchError";
import { apiFetch } from "@/lib/api/client";
import type { ThrowInput } from "@/lib/darts/rules";
import { useTelegram } from "@/components/TelegramProvider";

type PlayerStats = {
  gamesPlayed: number;
  legsWon: number;
  avgPpr: number;
  wins: number;
  avgWinRound: number | null;
};

function StatsContent() {
  const params = useSearchParams();
  const channelId = params.get("channelId") ?? "";
  const { session } = useTelegram();
  const userId = session?.user.id;

  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [allThrows, setAllThrows] = useState<ThrowInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<{ stats: PlayerStats; allThrows?: ThrowInput[] }>(
      `/api/stats/player?channelId=${channelId}&userId=${userId}`
    )
      .then((d) => {
        setStats(d.stats);
        setAllThrows(d.allThrows ?? []);
      })
      .catch((err) => setError(statsFetchMessage(err)))
      .finally(() => setLoading(false));
  }, [channelId, userId]);

  return (
    <StatsScreen title="Статистика">
      {loading ? (
        <StatsLoading />
      ) : error ? (
        <StatsEmpty>{error}</StatsEmpty>
      ) : null}
      {stats && !error && !loading && (
        <>
          <StatsDartboardHeatmap throws={allThrows} />
          <div className={styles.statGrid}>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{stats.gamesPlayed}</div>
            <div className={styles.statLabel}>Игр</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{stats.wins}</div>
            <div className={styles.statLabel}>Побед</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{stats.legsWon}</div>
            <div className={styles.statLabel}>Легов</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{stats.avgPpr}</div>
            <div className={styles.statLabel}>Средний PPR</div>
          </div>
          {stats.wins > 0 && stats.avgWinRound != null ? (
            <div className={styles.statBox}>
              <div className={styles.statValue}>{stats.avgWinRound}</div>
              <div className={styles.statLabel}>Ср. раунд победы</div>
            </div>
          ) : null}
          </div>
        </>
      )}
      {userId && (
        <Button
          href={`/stats/players/${userId}?channelId=${encodeURIComponent(channelId)}&from=stats`}
          size="medium"
          variant="secondary"
          fullWidth
        >
          История моих игр
        </Button>
      )}
    </StatsScreen>
  );
}

export default function StatsPage() {
  return (
    <Suspense>
      <StatsContent />
    </Suspense>
  );
}
