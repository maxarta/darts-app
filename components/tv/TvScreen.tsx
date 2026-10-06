"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { visitThrowSummary } from "@/lib/darts/format";
import type { AchievementId } from "@/lib/game/achievements";
import {
  GameAchievements,
} from "@/components/game/achievements";
import type { ActiveAchievement } from "@/components/game/achievements/useVisitAchievementQueue";
import {
  isTvLiveFresh,
  readActiveTvTournamentId,
  readTvLive,
  setActiveTvTournament,
  TV_LIVE_EVENT,
  type TvLivePayload,
} from "@/lib/tournament/tv-live";
import {
  normalizeTournamentVariant,
} from "@/lib/tournament/variant";
import { resolveStoredPhotoUrl } from "@/lib/telegram/user-photo";
import {
  TvTournamentSheet,
  type TvTournamentData,
} from "./TvTournamentSheet";
import styles from "./tv.module.css";

type ActiveTournamentRow = {
  id: string;
  name: string;
  status: string;
  variant?: string;
};

function initials(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

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
      setLive(next);
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
          const remote = res.live;
          const best =
            local &&
            isTvLiveFresh(local) &&
            (!remote || (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0))
              ? local
              : remote;
          applyLive(best);
        })
        .catch(() => {
          if (!cancelled && isTvLiveFresh(local)) applyLive(local);
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
  const freshLive = isTvLiveFresh(live) ? live : null;
  const playing = freshLive?.phase === "playing" && freshLive.players.length > 0;

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
        photoUrl: resolveStoredPhotoUrl(uid, user?.photo_url),
      };
    };
    return { p1: find(upcoming.p1), p2: find(upcoming.p2), stage: upcoming.stage };
  }, [upcoming, data]);

  const removeAchievement = (instanceId: string) => {
    setAchievements((prev) => prev.filter((a) => a.instanceId !== instanceId));
  };

  if (!channelId && !forcedTournamentId) {
    return (
      <div className={styles.tvEmpty}>
        <h1 className={styles.tvEmptyTitle}>TV-борд</h1>
        <p className={styles.tvEmptyHint}>
          Ссылка: /tv/…id турнира
        </p>
      </div>
    );
  }

  if (!tournamentId) {
    return (
      <div className={[styles.tvEmpty, isKenny ? styles.tvRootKenny : ""].join(" ")}>
        <h1 className={styles.tvEmptyTitle}>Нет активного турнира</h1>
        <p className={styles.tvEmptyHint}>
          Запустите TV из экрана турнира (кнопка «Запустить TV») или создайте
          турнир в клубе.
        </p>
        {error ? <p className={styles.tvEmptyHint}>{error}</p> : null}
        {channelId ? (
          <p className={styles.tvEmptyHint}>channelId: {channelId}</p>
        ) : null}
      </div>
    );
  }

  const visitChips = playing
    ? visitThrowSummary(freshLive!.visitThrows)
    : [];

  return (
    <div
      className={[styles.tvRoot, isKenny ? styles.tvRootKenny : ""].join(" ")}
      data-tv-board
    >
      <section className={styles.tvLeft} aria-label="Сейчас на доске">
        <p className={styles.tvBrand}>TV · {data?.tournament.name ?? "Турнир"}</p>

        {playing ? (
          <div className={styles.tvPlaying}>
            <p className={styles.tvStage}>
              {freshLive!.stage ?? "Игра"} · {freshLive!.mode}
            </p>
            <div className={styles.tvMetaRow}>
              <span className={styles.tvMetaPill}>
                Раунд {freshLive!.currentRound}
              </span>
              {(freshLive!.legsToWin ?? 1) > 1 ? (
                <span className={styles.tvMetaPill}>
                  Лег {freshLive!.currentLeg} · до {freshLive!.legsToWin}
                </span>
              ) : null}
              <span className={styles.tvMetaPill}>
                Дротики{" "}
                {freshLive!.players.reduce((s, p) => s + p.dartsThrown, 0)}
              </span>
            </div>

            <div className={styles.tvScoreGrid}>
              {freshLive!.players.map((p) => (
                <article
                  key={p.userId}
                  className={[
                    styles.tvScoreCard,
                    p.active ? styles.tvScoreCardActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.tvAvatar}>
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photoUrl}
                        alt=""
                        className={styles.tvAvatarImg}
                      />
                    ) : (
                      initials(p.name)
                    )}
                  </div>
                  <p className={styles.tvPlayerName}>{p.name}</p>
                  <p className={styles.tvScoreValue}>{p.remaining}</p>
                  {(freshLive!.legsToWin ?? 1) > 1 ? (
                    <p className={styles.tvLegs}>Леги {p.legsWon}</p>
                  ) : null}
                  <p className={styles.tvLegs}>PPR {p.ppr.toFixed(1)}</p>
                </article>
              ))}
            </div>

            <div className={styles.tvVisit}>
              <span className={styles.tvVisitLabel}>Визит</span>
              <span className={styles.tvVisitScore}>
                {freshLive!.players.find((p) => p.active)?.visitScore ?? 0}
              </span>
              <div className={styles.tvVisitThrows}>
                {visitChips.map((chip, i) => (
                  <span key={`${chip.label}-${i}`} className={styles.tvThrowChip}>
                    {chip.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : upcomingPlayers ? (
          <div className={styles.tvIdle}>
            <p className={styles.tvStage}>{upcomingPlayers.stage}</p>
            <div className={styles.tvMatchup}>
              <div className={styles.tvPlayer}>
                <div className={`${styles.tvAvatar} ${styles.tvAvatarHero}`}>
                  {upcomingPlayers.p1.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={upcomingPlayers.p1.photoUrl}
                      alt=""
                      className={styles.tvAvatarImg}
                    />
                  ) : (
                    initials(upcomingPlayers.p1.name)
                  )}
                </div>
                <p className={styles.tvPlayerNameHero}>
                  {upcomingPlayers.p1.name}
                </p>
              </div>
              <span className={styles.tvVsHero}>×</span>
              <div className={styles.tvPlayer}>
                <div className={`${styles.tvAvatar} ${styles.tvAvatarHero}`}>
                  {upcomingPlayers.p2.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={upcomingPlayers.p2.photoUrl}
                      alt=""
                      className={styles.tvAvatarImg}
                    />
                  ) : (
                    initials(upcomingPlayers.p2.name)
                  )}
                </div>
                <p className={styles.tvPlayerNameHero}>
                  {upcomingPlayers.p2.name}
                </p>
              </div>
            </div>
            <p className={styles.tvIdleHint}>Ожидание старта на телефоне</p>
          </div>
        ) : (
          <div className={styles.tvIdle}>
            <p className={styles.tvIdleTitle}>Ожидание</p>
            <p className={styles.tvIdleHint}>
              {needsDrawLabel(data)}
            </p>
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
