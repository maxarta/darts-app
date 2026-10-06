"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import type { AchievementId } from "@/lib/game/achievements";
import {
  GameAchievements,
} from "@/components/game/achievements";
import type { ActiveAchievement } from "@/components/game/achievements/useVisitAchievementQueue";
import {
  isTvLiveFresh,
  pickTvLive,
  readActiveTvTournamentId,
  readTvLive,
  setActiveTvTournament,
  TV_LIVE_EVENT,
  type TvLivePayload,
} from "@/lib/tournament/tv-live";
import {
  normalizeTournamentVariant,
} from "@/lib/tournament/variant";
import {
  resolveStoredPhotoUrl,
  telegramAvatarPath,
} from "@/lib/telegram/user-photo";
import {
  TvTournamentSheet,
  type TvTournamentData,
} from "./TvTournamentSheet";
import { TvCodeGate } from "./TvCodeGate";
import { TvAvatar } from "./TvAvatar";
import { TvPlayingBoard } from "./TvPlayingBoard";
import styles from "./tv.module.css";

type ActiveTournamentRow = {
  id: string;
  name: string;
  status: string;
  variant?: string;
};

function nextUpcoming(
  data: TvTournamentData | null
): { matchId: string; stage: string; p1: number; p2: number } | null {
  if (!data) return null;

  const openPlayoff = data.playoffMatches
    .filter((m) => m.player1_id != null && m.player2_id != null && !m.winner_id)
    .sort((a, b) => a.round - b.round || a.slot - b.slot);
  const po = openPlayoff[0];
  if (po && po.player1_id != null && po.player2_id != null) {
    const maxRound = Math.max(1, ...data.playoffMatches.map((x) => x.round));
    const stage = po.round === maxRound ? "Финал" : `Раунд ${po.round}`;
    return { matchId: po.id, stage, p1: po.player1_id, p2: po.player2_id };
  }

  const openRr = data.roundRobinMatches.find(
    (m) => !m.played && m.player1_id != null && m.player2_id != null
  );
  if (openRr) {
    return {
      matchId: openRr.id,
      stage: "Круговой этап",
      p1: openRr.player1_id,
      p2: openRr.player2_id,
    };
  }

  return null;
}

export function TvScreen() {
  const routeParams = useParams<{ tournamentId?: string }>();
  const params = useSearchParams();
  const channelId = params.get("channelId") ?? "";
  const forcedTournamentId =
    routeParams.tournamentId ?? params.get("tournamentId") ?? "";

  const [tournamentId, setTournamentId] = useState(forcedTournamentId);
  const [data, setData] = useState<TvTournamentData | null>(null);
  const [live, setLive] = useState<TvLivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [achievements, setAchievements] = useState<ActiveAchievement[]>([]);
  const seenAchievementsRef = useRef<Set<string>>(new Set());
  const achievementSeq = useRef(0);

  // Keep in sync when opening /tv/:id
  useEffect(() => {
    if (forcedTournamentId) setTournamentId(forcedTournamentId);
  }, [forcedTournamentId]);

  // Resolve which tournament this TV board shows
  useEffect(() => {
    if (forcedTournamentId) {
      setTournamentId(forcedTournamentId);
      if (channelId) setActiveTvTournament(channelId, forcedTournamentId);
      return;
    }
    if (!channelId) return;

    const fromLocal = readActiveTvTournamentId(channelId);
    if (fromLocal) {
      setTournamentId(fromLocal);
      return;
    }

    let cancelled = false;
    void apiFetch<{ tournaments: ActiveTournamentRow[] }>(
      `/api/tournaments?channelId=${encodeURIComponent(channelId)}`
    )
      .then((res) => {
        if (cancelled) return;
        const list = res.tournaments ?? [];
        const active =
          list.find(
            (t) => t.status === "round_robin" || t.status === "playoff"
          ) ?? list.find((t) => t.status !== "finished") ?? null;
        if (active) {
          setActiveTvTournament(channelId, active.id);
          setTournamentId(active.id);
        } else {
          setTournamentId("");
          setData(null);
        }
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Ошибка");
          setTournamentId("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, forcedTournamentId]);

  // Sheet + live score from API (phone publishes; TV polls)
  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;

    const applyLive = (next: TvLivePayload | null) => {
      if (cancelled) return;
      setLive((prev) => {
        const chosen = pickTvLive(next, prev);
        return chosen;
      });
      const ids = next?.achievements ?? [];
      for (const id of ids) {
        const key = `${next?.updatedAt}-${id}`;
        if (seenAchievementsRef.current.has(key)) continue;
        seenAchievementsRef.current.add(key);
        achievementSeq.current += 1;
        const instanceId = `${id}-${achievementSeq.current}`;
        setAchievements((prev) => [
          ...prev,
          { id: id as AchievementId, instanceId },
        ]);
      }
    };

    const refreshLive = () => {
      const local = readTvLive(tournamentId);

      void apiFetch<{ live: TvLivePayload | null }>(
        `/api/tournaments/${encodeURIComponent(tournamentId)}/live`
      )
        .then((res) => {
          if (cancelled) return;
          applyLive(pickTvLive(local, res.live));
        })
        .catch(() => {
          if (!cancelled) applyLive(pickTvLive(local, null));
        });
    };

    const refreshSheet = () => {
      void apiFetch<TvTournamentData>(
        `/api/tournaments/${encodeURIComponent(tournamentId)}`
      )
        .then((sheet) => {
          if (cancelled) return;
          setData(sheet);
          setError(null);
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки");
          }
        });
    };

    refreshSheet();
    refreshLive();

    const sheetTimer = window.setInterval(refreshSheet, 8000);
    const liveTimer = window.setInterval(refreshLive, 1500);
    const onLive = () => refreshLive();
    window.addEventListener(TV_LIVE_EVENT, onLive);

    return () => {
      cancelled = true;
      window.clearInterval(sheetTimer);
      window.clearInterval(liveTimer);
      window.removeEventListener(TV_LIVE_EVENT, onLive);
    };
  }, [tournamentId]);

  const isKenny =
    normalizeTournamentVariant(data?.tournament.variant) === "kenny";
  const boardLive =
    live?.phase === "playing" && live.players.length > 0 && isTvLiveFresh(live)
      ? live
      : null;
  const playing = Boolean(boardLive);

  const upcoming = useMemo(() => nextUpcoming(data), [data]);
  const upcomingPlayers = useMemo(() => {
    if (!upcoming || !data) return null;
    const find = (uid: number) => {
      const row = data.participants.find((p) => p.user_id === uid);
      const u = row?.users;
      const user = Array.isArray(u) ? u[0] : u;
      return {
        userId: uid,
        name: (user?.first_name ?? String(uid)).toUpperCase().slice(0, 18),
        photoUrl:
          resolveStoredPhotoUrl(uid, user?.photo_url) ??
          telegramAvatarPath(uid),
      };
    };
    return { p1: find(upcoming.p1), p2: find(upcoming.p2), stage: upcoming.stage };
  }, [upcoming, data]);

  const removeAchievement = (instanceId: string) => {
    setAchievements((prev) => prev.filter((a) => a.instanceId !== instanceId));
  };

  if (!channelId && !forcedTournamentId && !tournamentId) {
    return (
      <div className={styles.tvRoot} data-tv-board>
        <TvCodeGate
          onResolved={(id) => {
            setTournamentId(id);
            setError(null);
          }}
        />
      </div>
    );
  }

  if (!tournamentId) {
    return (
      <div className={[styles.tvEmpty, isKenny ? styles.tvRootKenny : ""].join(" ")}>
        <h1 className={styles.tvEmptyTitle}>Нет активного турнира</h1>
        <p className={styles.tvEmptyHint}>
          Откройте artdart.vercel.app/tv и введите код с телефона.
        </p>
        {error ? <p className={styles.tvEmptyHint}>{error}</p> : null}
        {channelId ? (
          <p className={styles.tvEmptyHint}>channelId: {channelId}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={[styles.tvRoot, isKenny ? styles.tvRootKenny : ""].join(" ")}
      data-tv-board
    >
      <section className={styles.tvLeft} aria-label="Сейчас на доске">
        {playing && boardLive ? (
          <TvPlayingBoard
            live={boardLive}
            tournamentName={data?.tournament.name ?? "Турнир"}
          />
        ) : upcomingPlayers ? (
          <div className={styles.tvIdle}>
            <p className={styles.tvBrand}>
              TV · {data?.tournament.name ?? "Турнир"}
            </p>
            <p className={styles.tvStage}>{upcomingPlayers.stage}</p>
            <div className={styles.tvMatchup}>
              <div className={styles.tvPlayer}>
                <TvAvatar
                  name={upcomingPlayers.p1.name}
                  photoUrl={upcomingPlayers.p1.photoUrl}
                  size="hero"
                />
                <p className={styles.tvPlayerNameHero}>
                  {upcomingPlayers.p1.name}
                </p>
              </div>
              <span className={styles.tvVsHero}>×</span>
              <div className={styles.tvPlayer}>
                <TvAvatar
                  name={upcomingPlayers.p2.name}
                  photoUrl={upcomingPlayers.p2.photoUrl}
                  size="hero"
                />
                <p className={styles.tvPlayerNameHero}>
                  {upcomingPlayers.p2.name}
                </p>
              </div>
            </div>
            <p className={styles.tvIdleHint}>Ожидание старта на телефоне</p>
          </div>
        ) : (
          <div className={styles.tvIdle}>
            <p className={styles.tvBrand}>
              TV · {data?.tournament.name ?? "Турнир"}
            </p>
            <p className={styles.tvIdleTitle}>Ожидание</p>
            <p className={styles.tvIdleHint}>{needsDrawLabel(data)}</p>
          </div>
        )}
      </section>

      <aside className={styles.tvRight} aria-label="Сетка турнира">
        <div className={styles.tvSheetCard}>
          <div className={styles.tvSheetScroll}>
            {data ? <TvTournamentSheet data={data} /> : null}
          </div>
        </div>
      </aside>

      <GameAchievements
        active={achievements}
        onRemove={removeAchievement}
      />
    </div>
  );
}

function needsDrawLabel(data: TvTournamentData | null): string {
  if (!data) return "Загрузка турнира…";
  if (data.tournament.status === "finished") return "Турнир завершён";
  if (
    data.tournament.status === "round_robin" &&
    data.playoffMatches.length === 0 &&
    data.roundRobinMatches.length === 0
  ) {
    return "Проведите жеребьёвку на телефоне";
  }
  return "Нет незавершённых пар";
}
