"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import type { AchievementId } from "@/lib/game/achievements";
import { sortAchievementsForStacking } from "@/lib/game/achievements";
import { preloadAchievementImages } from "@/lib/game/achievements/images";
import { GameAchievements } from "@/components/game/achievements";
import {
  ACHIEVEMENT_STAGGER_MS,
  type ActiveAchievement,
} from "@/components/game/achievements/useVisitAchievementQueue";
import {
  isTvLiveFresh,
  pickTvLive,
  readActiveTvBoardKey,
  readTvLive,
  setActiveTvBoard,
  setActiveTvTournament,
  TV_LIVE_EVENT,
  type TvLivePayload,
} from "@/lib/tournament/tv-live";
import { tournamentBoardKey } from "@/lib/tournament/tv-board-key";
import { normalizeTournamentVariant } from "@/lib/tournament/variant";
import {
  resolveStoredPhotoUrl,
  telegramAvatarPath,
} from "@/lib/telegram/user-photo";
import {
  TvTournamentSheet,
  type TvTournamentData,
} from "./TvTournamentSheet";
import { TvCodeGate, type TvResolvedBoard } from "./TvCodeGate";
import { TvAvatar } from "./TvAvatar";
import { TvPlayingBoard } from "./TvPlayingBoard";
import {
  TvScoreBursts,
  type TvScoreBurstItem,
} from "./TvScoreBursts";
import styles from "./tv.module.css";

type ActiveTournamentRow = {
  id: string;
  name: string;
  status: string;
  variant?: string;
};

type BoardState = {
  boardKey: string;
  kind: "tournament" | "game" | "channel";
  tournamentId: string | null;
  gameId: string | null;
  title: string;
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

  const [board, setBoard] = useState<BoardState | null>(() =>
    forcedTournamentId
      ? {
          boardKey: tournamentBoardKey(forcedTournamentId),
          kind: "tournament",
          tournamentId: forcedTournamentId,
          gameId: null,
          title: "",
        }
      : null
  );
  const [data, setData] = useState<TvTournamentData | null>(null);
  const [live, setLive] = useState<TvLivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [achievements, setAchievements] = useState<ActiveAchievement[]>([]);
  const [scoreBursts, setScoreBursts] = useState<TvScoreBurstItem[]>([]);
  const lastLiveAchievementsRef = useRef<AchievementId[]>([]);
  const lastVisitScoreRef = useRef<{ userId: number; score: number } | null>(
    null
  );
  const achievementSeq = useRef(0);
  const scoreBurstSeq = useRef(0);
  const achievementStaggerTimersRef = useRef<number[]>([]);
  const nextAchievementSpawnAtRef = useRef(0);

  const removeAchievement = (instanceId: string) => {
    setAchievements((prev) => prev.filter((a) => a.instanceId !== instanceId));
  };

  const removeScoreBurst = (instanceId: string) => {
    setScoreBursts((prev) => prev.filter((b) => b.instanceId !== instanceId));
  };

  const clearAchievementStagger = () => {
    for (const t of achievementStaggerTimersRef.current) {
      window.clearTimeout(t);
    }
    achievementStaggerTimersRef.current = [];
    nextAchievementSpawnAtRef.current = 0;
  };

  useEffect(() => {
    if (!forcedTournamentId) return;
    setBoard({
      boardKey: tournamentBoardKey(forcedTournamentId),
      kind: "tournament",
      tournamentId: forcedTournamentId,
      gameId: null,
      title: "",
    });
    if (channelId) setActiveTvTournament(channelId, forcedTournamentId);
  }, [forcedTournamentId, channelId]);

  // Resolve board from channel active key / active tournament list
  useEffect(() => {
    if (forcedTournamentId || board) return;
    if (!channelId) return;

    const fromLocal = readActiveTvBoardKey(channelId);
    if (fromLocal?.startsWith("t:")) {
      const id = fromLocal.slice(2);
      setBoard({
        boardKey: fromLocal,
        kind: "tournament",
        tournamentId: id,
        gameId: null,
        title: "",
      });
      return;
    }
    if (fromLocal?.startsWith("g:")) {
      setBoard({
        boardKey: fromLocal,
        kind: "game",
        tournamentId: null,
        gameId: fromLocal.slice(2),
        title: "",
      });
      return;
    }
    if (fromLocal?.startsWith("c:")) {
      setBoard({
        boardKey: fromLocal,
        kind: "channel",
        tournamentId: null,
        gameId: null,
        title: "",
      });
      return;
    }
    // Legacy bare tournament id in localStorage
    if (fromLocal && !fromLocal.includes(":")) {
      setBoard({
        boardKey: tournamentBoardKey(fromLocal),
        kind: "tournament",
        tournamentId: fromLocal,
        gameId: null,
        title: "",
      });
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
          setBoard({
            boardKey: tournamentBoardKey(active.id),
            kind: "tournament",
            tournamentId: active.id,
            gameId: null,
            title: active.name,
          });
        }
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Ошибка");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, forcedTournamentId, board]);

  // Live + optional tournament sheet
  useEffect(() => {
    if (!board) return;
    let cancelled = false;
    lastLiveAchievementsRef.current = [];
    lastVisitScoreRef.current = null;
    clearAchievementStagger();
    setAchievements([]);
    setScoreBursts([]);

    const spawnAchievementsInOrder = (ids: AchievementId[]) => {
      if (ids.length === 0) return;
      const stacked = sortAchievementsForStacking(ids);
      void preloadAchievementImages()
        .catch(() => {})
        .finally(() => {
          if (cancelled) return;
          const now = Date.now();
          let at = Math.max(now, nextAchievementSpawnAtRef.current);
          for (const id of stacked) {
            const delay = Math.max(0, at - Date.now());
            const timer = window.setTimeout(() => {
              if (cancelled) return;
              achievementSeq.current += 1;
              setAchievements((prev) => [
                ...prev,
                {
                  id,
                  instanceId: `${id}-${achievementSeq.current}`,
                },
              ]);
            }, delay);
            achievementStaggerTimersRef.current.push(timer);
            at += ACHIEVEMENT_STAGGER_MS;
          }
          nextAchievementSpawnAtRef.current = at;
        });
    };

    const applyLive = (next: TvLivePayload | null) => {
      if (cancelled) return;
      setLive((prev) => {
        if (next?.phase === "idle") return null;
        if (next == null) {
          if (prev?.phase === "playing" && prev.players.length > 0) return prev;
          return null;
        }
        if (next.phase === "playing" && next.players.length > 0) return next;
        return pickTvLive(next, prev);
      });

      if (!next || next.phase === "idle") {
        lastLiveAchievementsRef.current = [];
        lastVisitScoreRef.current = null;
        clearAchievementStagger();
        return;
      }
      const ids = (next?.achievements ?? []) as AchievementId[];
      // Phone re-publishes the same active stickers every ~1s with a new
      // updatedAt — only spawn when an id newly appears in the list.
      const prevIds = lastLiveAchievementsRef.current;
      const remaining = new Map<AchievementId, number>();
      for (const id of prevIds) {
        remaining.set(id, (remaining.get(id) ?? 0) + 1);
      }
      const newlyAppeared: AchievementId[] = [];
      for (const id of ids) {
        const left = remaining.get(id) ?? 0;
        if (left > 0) {
          remaining.set(id, left - 1);
        } else {
          newlyAppeared.push(id);
        }
      }
      lastLiveAchievementsRef.current = ids;

      if (newlyAppeared.length > 0) {
        spawnAchievementsInOrder(newlyAppeared);
      }

      // Huge flying points on every scoring dart (alongside stickers).
      const active =
        next.players.find((p) => p.active) ?? next.players[0] ?? null;
      if (!active) return;

      const prevVisit = lastVisitScoreRef.current;
      if (
        !prevVisit ||
        prevVisit.userId !== active.userId ||
        active.visitScore < prevVisit.score
      ) {
        lastVisitScoreRef.current = {
          userId: active.userId,
          score: active.visitScore,
        };
        return;
      }

      if (active.visitScore > prevVisit.score) {
        const delta = active.visitScore - prevVisit.score;
        lastVisitScoreRef.current = {
          userId: active.userId,
          score: active.visitScore,
        };
        if (delta > 0) {
          scoreBurstSeq.current += 1;
          setScoreBursts((prev) => [
            ...prev,
            {
              instanceId: `score-${scoreBurstSeq.current}`,
              points: delta,
            },
          ]);
        }
      }
    };

    const refreshLive = () => {
      const local = readTvLive(board.boardKey);

      const viaBoard = () =>
        apiFetch<{ live: TvLivePayload | null }>(
          `/api/tv/boards/${encodeURIComponent(board.boardKey)}`
        ).then((res) => {
          if (cancelled) return;
          applyLive(pickTvLive(local, res.live));
        });

      if (board.kind === "tournament" && board.tournamentId) {
        void apiFetch<{ live: TvLivePayload | null }>(
          `/api/tournaments/${encodeURIComponent(board.tournamentId)}/live`
        )
          .then((res) => {
            if (cancelled) return;
            applyLive(pickTvLive(local, res.live));
          })
          .catch(() => {
            void viaBoard().catch(() => {
              if (!cancelled) applyLive(isTvLiveFresh(local) ? local : null);
            });
          });
        return;
      }

      void viaBoard().catch(() => {
        if (!cancelled) applyLive(isTvLiveFresh(local) ? local : null);
      });
    };

    const refreshSheet = () => {
      if (board.kind !== "tournament" || !board.tournamentId) return;
      void apiFetch<TvTournamentData>(
        `/api/tournaments/${encodeURIComponent(board.tournamentId)}`
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

    const sheetTimer =
      board.kind === "tournament"
        ? window.setInterval(refreshSheet, 8000)
        : 0;
    const liveTimer = window.setInterval(refreshLive, 1500);
    const onLive = () => refreshLive();
    window.addEventListener(TV_LIVE_EVENT, onLive);

    return () => {
      cancelled = true;
      clearAchievementStagger();
      if (sheetTimer) window.clearInterval(sheetTimer);
      window.clearInterval(liveTimer);
      window.removeEventListener(TV_LIVE_EVENT, onLive);
    };
  }, [board]);

  const isKenny =
    normalizeTournamentVariant(data?.tournament.variant) === "kenny";
  const boardLive =
    live?.phase === "playing" && live.players.length > 0 ? live : null;
  const playing = Boolean(boardLive);
  const isGameBoard = board?.kind === "game" || board?.kind === "channel";
  const displayTitle =
    board?.title ||
    data?.tournament.name ||
    (isGameBoard ? "Игра" : "Турнир");

  const upcoming = useMemo(
    () => (isGameBoard ? null : nextUpcoming(data)),
    [data, isGameBoard]
  );
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
    return {
      p1: find(upcoming.p1),
      p2: find(upcoming.p2),
      stage: upcoming.stage,
    };
  }, [upcoming, data]);

  const onCodeResolved = (resolved: TvResolvedBoard) => {
    setActiveTvBoard(channelId || "tv", resolved.boardKey);
    setBoard({
      boardKey: resolved.boardKey,
      kind: resolved.kind,
      tournamentId: resolved.tournamentId,
      gameId: resolved.gameId,
      title: resolved.title,
    });
    setData(null);
    setLive(null);
    setError(null);
  };

  if (!board && !channelId && !forcedTournamentId) {
    return (
      <div className={styles.tvRoot} data-tv-board>
        <TvCodeGate onResolved={onCodeResolved} />
      </div>
    );
  }

  if (!board) {
    return (
      <div className={styles.tvEmpty}>
        <h1 className={styles.tvEmptyTitle}>Нет активной игры</h1>
        <p className={styles.tvEmptyHint}>
          Откройте artdart.vercel.app/tv и введите код с телефона.
        </p>
        {error ? <p className={styles.tvEmptyHint}>{error}</p> : null}
      </div>
    );
  }

  return (
    <div
      className={[
        styles.tvRoot,
        isKenny ? styles.tvRootKenny : "",
        isGameBoard ? styles.tvRootSolo : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-tv-board
    >
      <section className={styles.tvLeft} aria-label="Сейчас на доске">
        {playing && boardLive ? (
          <TvPlayingBoard live={boardLive} tournamentName={displayTitle} />
        ) : isGameBoard ? (
          <div className={styles.tvIdle}>
            <p className={styles.tvBrand}>TV · {displayTitle}</p>
            <p className={styles.tvIdleTitle}>Ожидание</p>
            <p className={styles.tvIdleHint}>Старт на телефоне</p>
          </div>
        ) : upcomingPlayers ? (
          <div className={styles.tvIdle}>
            <p className={styles.tvBrand}>TV · {displayTitle}</p>
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
            <p className={styles.tvBrand}>TV · {displayTitle}</p>
            <p className={styles.tvIdleTitle}>Ожидание</p>
            <p className={styles.tvIdleHint}>{needsDrawLabel(data)}</p>
          </div>
        )}
      </section>

      {!isGameBoard ? (
        <aside className={styles.tvRight} aria-label="Сетка турнира">
          <div className={styles.tvSheetCard}>
            <div className={styles.tvSheetScroll}>
              {data ? <TvTournamentSheet data={data} /> : null}
            </div>
          </div>
        </aside>
      ) : null}

      <GameAchievements
        active={achievements}
        onRemove={removeAchievement}
      />
      <TvScoreBursts active={scoreBursts} onRemove={removeScoreBurst} />
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
