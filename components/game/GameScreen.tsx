"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { visitThrowSummary } from "@/lib/darts/format";
import {
  applyVisit,
  defaultSettings,
  type ThrowInput,
} from "@/lib/darts/rules";
import { formatCheckoutHint } from "@/lib/darts/checkout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { formatTournamentHeaderSubtitle } from "@/lib/tournament/game-context";
import { markCelebrateFinal } from "@/lib/tournament/session-cache";
import type { GameSnapshot } from "@/lib/game/optimistic";
import {
  localGameCancel,
  localGameEndVisit,
  localGameRemovePlayer,
  localGameRestart,
  localGameThrow,
  localGameUndo,
  needsSync,
} from "@/lib/game/local/actions";
import { getLocalGame, saveLocalGame } from "@/lib/game/local/store";
import { localRecordFromServer } from "@/lib/game/local/from-server";
import type { LocalGameRecord } from "@/lib/game/local/types";
import { syncLocalGame } from "@/lib/game/sync/client";
import { apiFetch } from "@/lib/api/client";
import { GUEST_CLUB_CHAT_ID } from "@/lib/api/auth";
import { useSession } from "@/components/SessionProvider";
import { syncPendingMembers } from "@/lib/offline/members-service";
import { createAndSaveLocalGame } from "@/lib/game/local/create";
import { hapticImpact } from "@/lib/haptic";
import { channelBoardKey } from "@/lib/tournament/tv-board-key";
import { tvPublicDisplay } from "@/lib/tournament/tv-live";
import { GameHeader } from "./GameHeader";
import {
  GameAchievements,
  useVisitAchievementQueue,
} from "./achievements";
import { preloadAchievementImages } from "@/lib/game/achievements/images";
import { preloadVictoryVampireImage } from "@/lib/game/victory-images";
import { GameVictoryConfirmOverlay } from "./GameVictoryConfirmOverlay";
import { GameConfirmOverlay } from "./GameConfirmOverlay";
import { GameVictoryOverlay } from "./GameVictoryOverlay";
import { PlayerScoreboard, type PlayerDisplay } from "./PlayerScoreboard";
import { ScoringKeypad } from "./ScoringKeypad";
import { HeaderVisitChips } from "./HeaderVisitChips";
import { VisitBar } from "./VisitBar";
import { usePublishTvLive } from "@/components/tv/usePublishTvLive";
import { AutoScoreCalibrate } from "@/components/autoscore/AutoScoreCalibrate";
import { AutoScoreEngine } from "@/components/autoscore/AutoScoreEngine";
import { AutoScoreBanner } from "@/components/autoscore/AutoScoreBanner";
import type {
  AutoScorePhase,
  BoardCalibration,
  DetectedDart,
} from "@/lib/autoscore/types";
import {
  playCountdownTickSound,
  playDartHitSound,
  playTurnHandoffSound,
} from "@/lib/autoscore/sounds";
import {
  isNativeShell,
  nativeResumeListening,
  nativeStartAutoScore,
  nativeStopAutoScore,
  nativeWaitForRemoval,
  parseNativeThrow,
  subscribeNativeBridge,
} from "@/lib/autoscore/native-bridge";
import styles from "./game.module.css";

const HANDOFF_SECONDS = 5;

export function GameScreen({ gameId }: { gameId: string }) {
  const router = useRouter();
  const { appMode, channel } = useSession();
  const clubTvEnabled =
    appMode === "extended" &&
    channel != null &&
    channel.telegram_chat_id !== GUEST_CLUB_CHAT_ID;
  const [record, setRecord] = useState<LocalGameRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recordRef = useRef<LocalGameRecord | null>(null);
  const pendingEndVisitRef = useRef(false);
  const [victoryStats, setVictoryStats] = useState<LocalGameRecord | null>(
    null
  );
  const [victoryBusy, setVictoryBusy] = useState(false);
  const [victoryConfirmDismissed, setVictoryConfirmDismissed] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{
    userId: number;
    name: string;
  } | null>(null);
  const [tvCode, setTvCode] = useState<string | null>(null);

  const [autoPhase, setAutoPhase] = useState<AutoScorePhase>("off");
  const [autoStream, setAutoStream] = useState<MediaStream | null>(null);
  const [autoCalib, setAutoCalib] = useState<BoardCalibration | null>(null);
  /** ML keypoints path active (no manual circle calib). */
  const [autoMl, setAutoMl] = useState(false);
  const [autoMlFailed, setAutoMlFailed] = useState(false);
  const [autoCalibProgress, setAutoCalibProgress] = useState<string | null>(
    null
  );
  const [autoCorrecting, setAutoCorrecting] = useState(false);
  const [autoCamError, setAutoCamError] = useState<string | null>(null);
  /** True when throws come from the iOS ARKit LiDAR shell (no web camera). */
  const [nativeLidar, setNativeLidar] = useState(false);
  /** LiDAR: visit scored, waiting until darts are pulled before countdown. */
  const [awaitingRemoval, setAwaitingRemoval] = useState(false);
  const [handoffLeft, setHandoffLeft] = useState<number | null>(null);
  const handoffTimerRef = useRef<number | null>(null);
  const autoCorrectingRef = useRef(false);
  const scoringLockedRef = useRef(false);
  const visitReadyRef = useRef(false);
  const awaitingRemovalRef = useRef(false);
  const nativeLidarRef = useRef(false);
  const autoPhaseRef = useRef<AutoScorePhase>("off");
  const startHandoffCountdownRef = useRef<() => void>(() => {});
  autoCorrectingRef.current = autoCorrecting;
  autoPhaseRef.current = autoPhase;
  awaitingRemovalRef.current = awaitingRemoval;
  nativeLidarRef.current = nativeLidar;

  const persistGenRef = useRef(0);
  const persist = useCallback(async (next: LocalGameRecord) => {
    const gen = ++persistGenRef.current;
    recordRef.current = next;
    setRecord(next);
    await saveLocalGame(next);
    if (gen !== persistGenRef.current) return;
    if (!needsSync(next)) return;
    try {
      if (next.tournamentContext) {
        await syncPendingMembers();
      }
      if (gen !== persistGenRef.current) return;
      await syncLocalGame(next.id);
      if (gen !== persistGenRef.current) return;
      const latest = recordRef.current;
      if (latest) setRecord(latest);
    } catch {
      /* sync retries on online */
    }
  }, []);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  const visitThrows = record?.snapshot.activeVisitThrows ?? [];
  const visitAchievementsEnabled =
    record?.snapshot.game.status === "active" && visitThrows.length > 0;

  const onAchievementUnlock = useCallback(() => {
    const prev = recordRef.current;
    if (!prev) return;
    const activePlayer = prev.snapshot.players.find(
      (p) => p.order_index === prev.snapshot.game.current_player_index
    );
    if (!activePlayer) return;
    const settings = {
      ...defaultSettings(prev.snapshot.game.mode),
      ...prev.snapshot.game.settings,
      startingScore: prev.snapshot.game.settings.startingScore as 301 | 501,
    };
    const visitResult = applyVisit(
      activePlayer.score_at_visit_start,
      prev.snapshot.activeVisitThrows,
      settings
    );
    if (visitResult.legWon) {
      pendingEndVisitRef.current = true;
    }
  }, []);

  const { active: activeAchievements, removeInstance: removeAchievement } =
    useVisitAchievementQueue({
      throws: visitThrows,
      enabled: visitAchievementsEnabled,
      onUnlock: onAchievementUnlock,
    });

  usePublishTvLive(
    record,
    activeAchievements.map((a) => a.id)
  );

  // Free-game TV code — stable per club session (channel), not per game id.
  useEffect(() => {
    if (!record || record.tournamentContext || !clubTvEnabled) {
      setTvCode(null);
      return;
    }
    const channelId = record.meta.channelId ?? channel?.id ?? "";
    if (!channelId) {
      setTvCode(null);
      return;
    }
    const boardKey = channelBoardKey(channelId);
    let cancelled = false;
    void apiFetch<{ code: string }>(
      `/api/tv/boards/${encodeURIComponent(boardKey)}?want=code&channelId=${encodeURIComponent(channelId)}&title=${encodeURIComponent(record.snapshot.game.mode)}`
    )
      .then((res) => {
        if (!cancelled) setTvCode(res.code);
      })
      .catch(() => {
        if (!cancelled) setTvCode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    record?.tournamentContext,
    record?.meta.channelId,
    record?.snapshot.game.mode,
    clubTvEnabled,
    channel?.id,
  ]);

  useEffect(() => {
    if (!visitAchievementsEnabled) {
      pendingEndVisitRef.current = false;
    }
  }, [visitAchievementsEnabled]);

  useEffect(() => {
    if (!record || record.snapshot.game.status !== "active") {
      setVictoryConfirmDismissed(false);
      return;
    }
    const activeIdx = record.snapshot.game.current_player_index;
    const active = record.snapshot.players.find(
      (p) => p.order_index === activeIdx
    );
    const throws = record.snapshot.activeVisitThrows;
    if (!active || throws.length === 0) {
      setVictoryConfirmDismissed(false);
      return;
    }
    const settings = {
      ...defaultSettings(record.snapshot.game.mode),
      ...record.snapshot.game.settings,
      startingScore: record.snapshot.game.settings.startingScore as 301 | 501,
    };
    const legWon = applyVisit(
      active.score_at_visit_start,
      throws,
      settings
    ).legWon;
    if (!legWon) {
      setVictoryConfirmDismissed(false);
    }
  }, [
    record?.snapshot.activeVisitThrows,
    record?.snapshot.game.current_player_index,
    record?.snapshot.game.status,
    record?.snapshot.game.mode,
    record?.snapshot.game.settings,
    record?.snapshot.players,
  ]);

  useEffect(() => {
    void Promise.all([
      preloadAchievementImages(),
      preloadVictoryVampireImage(),
    ]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVictoryStats(null);
    setVictoryConfirmDismissed(false);

    async function load() {
      try {
        let loaded = await getLocalGame(gameId);
        if (!loaded) {
          const remote = await apiFetch<{
            game: LocalGameRecord["snapshot"]["game"] & {
              channel_id: string;
              mode: "301" | "501";
            };
            players: LocalGameRecord["snapshot"]["players"];
            activeVisitThrows?: LocalGameRecord["snapshot"]["activeVisitThrows"];
            tournamentContext?: LocalGameRecord["tournamentContext"];
          }>(`/api/games/${encodeURIComponent(gameId)}`);
          loaded = localRecordFromServer({
            ...remote,
            game: {
              ...remote.game,
              settings: {
                ...remote.game.settings,
                startingScore: (remote.game.settings.startingScore === 301
                  ? 301
                  : 501) as 301 | 501,
              },
            },
          });
        }
        if (cancelled) return;
        recordRef.current = loaded;
        setRecord(loaded);
        setVictoryStats(
          loaded.snapshot.game.status === "finished" ? loaded : null
        );
        setLoading(false);
        if (needsSync(loaded)) {
          void syncLocalGame(loaded.id).then((synced) => {
            if (synced && !cancelled) {
              recordRef.current = synced;
              setRecord(synced);
            }
          });
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Игра не найдена");
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const clearHandoff = useCallback(() => {
    if (handoffTimerRef.current != null) {
      window.clearInterval(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
    setHandoffLeft(null);
  }, []);

  const stopAutoScore = useCallback(() => {
    clearHandoff();
    setAwaitingRemoval(false);
    nativeStopAutoScore();
    setAutoPhase("off");
    setAutoCalib(null);
    setAutoMl(false);
    setAutoMlFailed(false);
    setAutoCalibProgress(null);
    setAutoCorrecting(false);
    setAutoCamError(null);
    setNativeLidar(false);
    setAutoStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, [clearHandoff]);

  /** Web/Safari camera path (used when not inside the iOS LiDAR shell). */
  const startWebCameraAutoScore = useCallback(async () => {
    clearHandoff();
    setAutoCorrecting(false);
    setAutoCamError(null);
    setNativeLidar(false);
    setAutoMl(false);
    setAutoMlFailed(false);
    setAutoCalibProgress("Загрузка модели…");
    setAutoCalib(null);

    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setAutoCamError(
        "Камера недоступна здесь. Откройте в приложении Darts Score или Safari"
      );
      setAutoPhase("off");
      return;
    }

    const attempts: MediaStreamConstraints[] = [
      {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      { audio: false, video: { facingMode: "environment" } },
      { audio: false, video: true },
    ];

    let lastErr: unknown = null;
    for (const constraints of attempts) {
      try {
        const stream = await media.getUserMedia(constraints);
        setAutoStream(stream);
        setAutoPhase("calibrate");
        return;
      } catch (e) {
        lastErr = e;
      }
    }

    const name =
      lastErr && typeof lastErr === "object" && "name" in lastErr
        ? String((lastErr as { name?: string }).name)
        : "";
    const msg =
      lastErr instanceof Error ? lastErr.message : "нет доступа к камере";
    setAutoCamError(
      name === "NotAllowedError"
        ? "Доступ к камере запрещён — разрешите в настройках браузера"
        : `Камера: ${name || msg}`
    );
    setAutoPhase("off");
  }, [clearHandoff]);

  const applyAutoThrow = useCallback((input: ThrowInput) => {
    if (autoPhaseRef.current !== "active") return;
    if (autoCorrectingRef.current) return;
    if (scoringLockedRef.current) return;
    const prev = recordRef.current;
    if (!prev) return;
    const next = localGameThrow(prev, input);
    if (!next) return;
    playDartHitSound();
    hapticImpact("light");
    void persistRef.current(next);
  }, []);

  const onToggleAutoScore = useCallback(() => {
    if (autoPhase !== "off") {
      stopAutoScore();
      return;
    }
    clearHandoff();
    setAutoCorrecting(false);
    setAutoCamError(null);
    // Prefer real ARKit LiDAR when running inside the iOS shell.
    if (isNativeShell() && nativeStartAutoScore()) {
      return;
    }
    void startWebCameraAutoScore();
  }, [autoPhase, stopAutoScore, clearHandoff, startWebCameraAutoScore]);

  useEffect(() => {
    return subscribeNativeBridge((msg) => {
      if (msg.type === "autoScoreReady") {
        // Native shell (LiDAR or ML hybrid) shares visit/removal handoff.
        setNativeLidar(Boolean(msg.lidar) || Boolean(msg.ml));
        setAwaitingRemoval(false);
        setAutoCorrecting(false);
        setAutoCamError(null);
        setAutoPhase("active");
        hapticImpact("medium");
        return;
      }
      if (msg.type === "autoScoreCancelled") {
        clearHandoff();
        setAwaitingRemoval(false);
        setAutoPhase("off");
        setNativeLidar(false);
        setAutoCalib(null);
        return;
      }
      if (msg.type === "autoScoreFallback") {
        void startWebCameraAutoScore();
        return;
      }
      if (msg.type === "autoThrow") {
        if (awaitingRemovalRef.current) return;
        const input = parseNativeThrow(msg.input);
        if (input) applyAutoThrow(input);
        return;
      }
      if (msg.type === "boardCleared") {
        setAwaitingRemoval(false);
        hapticImpact("light");
        startHandoffCountdownRef.current();
      }
    });
  }, [applyAutoThrow, clearHandoff, startWebCameraAutoScore]);

  const endVisitNow = useCallback(() => {
    const prev = recordRef.current;
    if (!prev) return false;
    if (
      prev.snapshot.game.status === "active" &&
      prev.snapshot.activeVisitThrows.length > 0
    ) {
      const settings = {
        ...defaultSettings(prev.snapshot.game.mode),
        ...prev.snapshot.game.settings,
        startingScore: prev.snapshot.game.settings.startingScore as 301 | 501,
      };
      const activePlayer = prev.snapshot.players.find(
        (p) => p.order_index === prev.snapshot.game.current_player_index
      );
      if (
        activePlayer &&
        applyVisit(
          activePlayer.score_at_visit_start,
          prev.snapshot.activeVisitThrows,
          settings
        ).legWon
      ) {
        setVictoryConfirmDismissed(false);
        return false;
      }
    }
    const next = localGameEndVisit(prev);
    if (!next) return false;
    void persist(next);
    return true;
  }, [persist]);

  const startHandoffCountdown = useCallback(() => {
    if (autoPhaseRef.current !== "active") return;
    if (autoCorrectingRef.current) return;
    if (handoffTimerRef.current != null) return;

    setHandoffLeft(HANDOFF_SECONDS);
    playCountdownTickSound();
    let left = HANDOFF_SECONDS;
    handoffTimerRef.current = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearHandoff();
        playTurnHandoffSound();
        hapticImpact("medium");
        const ok = endVisitNow();
        if (ok) setAutoCorrecting(false);
        return;
      }
      setHandoffLeft(left);
      playCountdownTickSound();
    }, 1000);
  }, [clearHandoff, endVisitNow]);
  startHandoffCountdownRef.current = startHandoffCountdown;

  const onThrow = (input: ThrowInput, fromAuto = false) => {
    const prev = recordRef.current;
    if (!prev) return;
    if (!fromAuto && autoPhaseRef.current === "active") {
      setAutoCorrecting(true);
      setAwaitingRemoval(false);
      clearHandoff();
      if (nativeLidarRef.current) nativeResumeListening();
    }
    const next = localGameThrow(prev, input);
    if (!next) return;
    void persist(next);
  };

  const onUndo = () => {
    if (autoPhaseRef.current === "active") {
      setAutoCorrecting(true);
      setAwaitingRemoval(false);
      clearHandoff();
      if (nativeLidarRef.current) nativeResumeListening();
    }
    const prev = recordRef.current;
    if (!prev) return;
    const next = localGameUndo(prev);
    if (!next) return;
    void persist(next);
  };

  const onNextPlayer = () => {
    clearHandoff();
    setAwaitingRemoval(false);
    if (nativeLidarRef.current) nativeResumeListening();
    const ok = endVisitNow();
    if (ok) setAutoCorrecting(false);
  };

  const onAutoDetect = useCallback(
    (dart: DetectedDart) => {
      applyAutoThrow(dart.input);
    },
    [applyAutoThrow]
  );

  useEffect(() => {
    return () => {
      clearHandoff();
      nativeStopAutoScore();
      setAutoStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, [clearHandoff]);

  const onRestart = async () => {
    const prev = recordRef.current;
    if (!prev) return;
    const ok = window.confirm(
      "Начать игру заново? Счёт и история бросков сбросятся."
    );
    if (!ok) return;
    hapticImpact("medium");
    await persist(localGameRestart(prev));
  };

  const onLeave = async () => {
    const prev = recordRef.current;
    if (!prev) return;

    // Tournament: return to lobby without cancelling — cancel would soft-lock the match.
    if (prev.tournamentContext) {
      const ok = window.confirm(
        "Вернуться к турниру? Матч можно продолжить позже."
      );
      if (!ok) return;
      hapticImpact("medium");
      const q = new URLSearchParams({ channelId: prev.meta.channelId });
      if (prev.tournamentContext.variant === "kenny") {
        q.set("variant", "kenny");
      }
      router.replace(
        `/tournament/${prev.tournamentContext.tournamentId}?${q.toString()}`
      );
      return;
    }

    const ok = window.confirm("Покинуть игру? Прогресс останется на устройстве.");
    if (!ok) return;
    hapticImpact("medium");
    await persist(localGameCancel(prev));
    router.push(
      prev.meta.channelId
        ? `/?channelId=${encodeURIComponent(prev.meta.channelId)}`
        : "/"
    );
  };

  const onRemovePlayer = (userId: number) => {
    const prev = recordRef.current;
    if (!prev) return;
    const player = prev.meta.players.find((p) => p.userId === userId);
    setPendingRemove({
      userId,
      name: player?.firstName ?? "игрока",
    });
  };

  const confirmRemovePlayer = async () => {
    const pending = pendingRemove;
    setPendingRemove(null);
    if (!pending) return;
    const prev = recordRef.current;
    if (!prev) return;
    const next = localGameRemovePlayer(prev, pending.userId);
    if (!next) return;
    await persist(next);
  };

  const returnToTournament = (
    prev: LocalGameRecord,
    options?: { celebrateFinal?: boolean }
  ) => {
    const ctx = prev.tournamentContext;
    if (!ctx) return;

    // Navigate immediately — never block the CTA on sync/confirm dialogs.
    if (options?.celebrateFinal) {
      markCelebrateFinal(ctx.tournamentId);
    }
    const q = new URLSearchParams({ channelId: prev.meta.channelId });
    if (ctx.variant === "kenny") {
      q.set("variant", "kenny");
    }
    if (options?.celebrateFinal) {
      q.set("celebrate", "final");
    }
    router.replace(`/tournament/${ctx.tournamentId}?${q.toString()}`);

    if (needsSync(prev)) {
      void syncPendingMembers()
        .then(() => syncLocalGame(prev.id))
        .catch(() => {});
    }
  };

  const goHome = () => {
    const prev = recordRef.current;
    if (!prev || victoryBusy) return;
    if (prev.tournamentContext) {
      const celebrateFinal =
        prev.tournamentContext.stage === "Финал" &&
        prev.snapshot.game.status === "finished";
      setVictoryStats(null);
      setVictoryBusy(false);
      returnToTournament(prev, { celebrateFinal });
      return;
    }
    setVictoryStats(null);
    setVictoryBusy(false);
    const channelId = prev.meta.channelId;
    router.push(
      channelId ? `/?channelId=${encodeURIComponent(channelId)}` : "/"
    );
  };

  const onVictoryConfirm = () => {
    const prev = recordRef.current;
    if (!prev) return;
    const next = localGameEndVisit(prev);
    if (!next) return;
    setVictoryConfirmDismissed(false);
    if (
      next.tournamentContext?.stage === "Финал" &&
      next.snapshot.game.status === "finished"
    ) {
      markCelebrateFinal(next.tournamentContext.tournamentId);
    }
    void persist(next);
    setVictoryStats(next);
  };

  const onVictoryPlayAgain = async () => {
    const prev = recordRef.current;
    if (!prev || victoryBusy) return;
    setVictoryBusy(true);

    if (prev.tournamentContext) {
      const celebrateFinal =
        prev.tournamentContext.stage === "Финал" &&
        prev.snapshot.game.status === "finished";
      setVictoryStats(null);
      setVictoryBusy(false);
      returnToTournament(prev, { celebrateFinal });
      return;
    }

    try {
      const newId = await createAndSaveLocalGame({
        channelId: prev.meta.channelId,
        mode: prev.meta.mode,
        playerIds: prev.meta.playerIds,
        players: prev.meta.players,
        createdBy: prev.meta.createdBy,
        settings: prev.meta.settings,
      });
      setVictoryStats(null);
      setVictoryConfirmDismissed(false);
      setVictoryBusy(false);
      router.replace(`/game/${newId}`);
    } catch (e) {
      setVictoryBusy(false);
      setError(e instanceof Error ? e.message : "Не удалось начать игру");
    }
  };

  // Auto handoff:
  // - web camera: after a full visit → 5s countdown → next player
  // - LiDAR: after a full visit → wait until darts are pulled → then countdown
  useEffect(() => {
    if (autoPhase !== "active" || !record) {
      clearHandoff();
      setAwaitingRemoval(false);
      return;
    }
    const snap = record.snapshot;
    if (snap.game.status !== "active") {
      clearHandoff();
      setAwaitingRemoval(false);
      return;
    }
    const throws = snap.activeVisitThrows;
    const settings = {
      ...defaultSettings(snap.game.mode),
      ...snap.game.settings,
      startingScore: snap.game.settings.startingScore as 301 | 501,
    };
    const activePlayer = snap.players.find(
      (p) => p.order_index === snap.game.current_player_index
    );
    const visitApplyLocal =
      throws.length > 0 && activePlayer
        ? applyVisit(activePlayer.score_at_visit_start, throws, settings)
        : null;
    const checkout = Boolean(visitApplyLocal?.legWon);
    const showConfirm =
      checkout && !victoryStats && !victoryConfirmDismissed;
    const ready =
      throws.length >= 3 ||
      Boolean(activePlayer?.awaiting_visit_end) ||
      (checkout && !victoryConfirmDismissed);

    if (autoCorrecting || showConfirm || victoryStats) {
      clearHandoff();
      if (awaitingRemoval) {
        setAwaitingRemoval(false);
        if (nativeLidar) nativeResumeListening();
      }
      return;
    }
    if (!ready) {
      clearHandoff();
      if (awaitingRemoval) {
        setAwaitingRemoval(false);
        if (nativeLidar) nativeResumeListening();
      }
      return;
    }
    // Visit complete — wait for darts off board (native / ML), else countdown.
    if (nativeLidar || autoMl) {
      clearHandoff();
      if (!awaitingRemoval && handoffLeft == null) {
        setAwaitingRemoval(true);
        if (nativeLidar) nativeWaitForRemoval();
      }
      return;
    }
    startHandoffCountdown();
  }, [
    autoPhase,
    autoCorrecting,
    record,
    victoryStats,
    victoryConfirmDismissed,
    nativeLidar,
    autoMl,
    awaitingRemoval,
    handoffLeft,
    clearHandoff,
    startHandoffCountdown,
  ]);

  if (loading) {
    return (
      <div className={styles.gameScreen} data-game-screen>
        <LoadingSpinner label="Загрузка…" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className={styles.gameScreen} data-game-screen>
        {error ?? "Игра не найдена"}
      </div>
    );
  }

  const data: GameSnapshot = record.snapshot;
  const { game, players, activeVisitThrows } = data;
  const sorted = [...players].sort((a, b) => a.order_index - b.order_index);
  const activeIdx = game.current_player_index;
  const active = sorted[activeIdx];
  const dartsInVisit = activeVisitThrows.length;
  const finished = game.status === "finished" && victoryStats != null;
  const solo = sorted.length === 1;

  const scoringSettings = {
    ...defaultSettings(game.mode),
    ...game.settings,
    startingScore: game.settings.startingScore as 301 | 501,
  };
  const visitApply =
    dartsInVisit > 0 && active
      ? applyVisit(
          active.score_at_visit_start,
          activeVisitThrows,
          scoringSettings
        )
      : null;
  const visitBust = Boolean(visitApply?.bust);
  const checkoutWon = Boolean(visitApply?.legWon);
  const singleMatch =
    !record.tournamentContext && scoringSettings.legsToWin <= 1;
  const willFinishMatch =
    checkoutWon &&
    active != null &&
    active.legs_won + 1 >= scoringSettings.legsToWin;
  const endScopeMatch = singleMatch || willFinishMatch;
  const showVictoryConfirm =
    checkoutWon &&
    game.status === "active" &&
    !victoryStats &&
    !victoryConfirmDismissed;
  const visitComplete =
    dartsInVisit >= 3 ||
    Boolean(active?.awaiting_visit_end) ||
    (checkoutWon && !victoryConfirmDismissed);
  const visitReady = visitComplete;
  const scoringLocked =
    showVictoryConfirm || victoryStats != null || visitComplete;
  scoringLockedRef.current = scoringLocked;
  visitReadyRef.current = visitReady;

  const checkoutRemaining =
    visitApply && !visitApply.bust
      ? visitApply.remaining
      : (active?.remaining_score ?? 0);
  const dartsLeftInVisit = Math.max(0, 3 - dartsInVisit);
  const finishHint =
    game.status === "active" &&
    !finished &&
    !visitBust &&
    !checkoutWon &&
    scoringSettings.doubleOut &&
    dartsLeftInVisit > 0
      ? formatCheckoutHint(checkoutRemaining, dartsLeftInVisit)
      : null;

  const displayPlayers: PlayerDisplay[] = sorted.map((p) => {
    const isActive = p.order_index === activeIdx;
    return {
      id: p.id,
      name: (p.users?.first_name ?? p.users?.username ?? "Игрок")
        .toUpperCase()
        .slice(0, 12),
      remaining: p.remaining_score,
      visitScore: p.visit_score,
      visitStartScore: p.score_at_visit_start,
      showVisitChip: isActive && !visitBust,
      bust: isActive && visitBust,
      ppr: p.ppr ?? 0,
      active: isActive,
    };
  });

  const visitChips = visitThrowSummary(activeVisitThrows);

  const syncHint =
    record.syncStatus === "failed"
      ? "Нет сети — игра сохранена, отправим позже"
      : record.syncStatus === "synced"
        ? null
        : finished
          ? "Сохраняем на сервер…"
          : null;

  const autoBannerMode =
    autoPhase === "calibrate" && autoCalibProgress
      ? ("calibrating" as const)
      : handoffLeft != null
        ? ("countdown" as const)
        : awaitingRemoval
          ? ("removal" as const)
          : autoCorrecting
            ? ("correcting" as const)
            : ("listening" as const);

  return (
    <div className={styles.gameScreen} data-game-screen>
      {!nativeLidar &&
      autoPhase === "calibrate" &&
      autoStream &&
      (autoMlFailed || autoCalibProgress == null) ? (
        <AutoScoreCalibrate
          stream={autoStream}
          onCancel={stopAutoScore}
          onConfirm={(calib) => {
            setAutoCalib(calib);
            setAutoMl(false);
            setAutoCorrecting(false);
            setAutoPhase("active");
            hapticImpact("medium");
          }}
        />
      ) : null}

      {!nativeLidar &&
      autoStream &&
      (autoPhase === "calibrate" || autoPhase === "active") ? (
        <AutoScoreEngine
          stream={autoStream}
          calibration={autoCalib}
          preferMl={!autoMlFailed}
          waitForRemoval={awaitingRemoval && autoMl}
          enabled={
            autoPhase === "active" &&
            !scoringLocked &&
            !autoCorrecting &&
            !finished &&
            handoffLeft == null &&
            !awaitingRemoval
          }
          onDetect={onAutoDetect}
          onMlUnavailable={() => {
            setAutoMlFailed(true);
            setAutoMl(false);
            setAutoCalibProgress(null);
          }}
          onMlEvent={(e) => {
            if (e.type === "calibProgress") {
              setAutoCalibProgress(
                `Калибровка ${e.locked ?? 0}/${e.need ?? 10}`
              );
              return;
            }
            if (e.type === "ready") {
              setAutoMl(true);
              setAutoCalibProgress(null);
              setAutoPhase("active");
              hapticImpact("medium");
              return;
            }
            if (e.type === "waitRemoval") {
              setAwaitingRemoval(true);
              return;
            }
            if (e.type === "boardCleared") {
              setAwaitingRemoval(false);
              hapticImpact("light");
              startHandoffCountdownRef.current();
            }
          }}
        />
      ) : null}

      <div className={styles.gameTopStrip}>
        <GameHeader
          mode={game.mode}
          round={game.current_round}
          leg={game.current_leg}
          legsToWin={scoringSettings.legsToWin}
          showLegCounter={!singleMatch}
          tournament={
            record.tournamentContext
              ? {
                  name: record.tournamentContext.name,
                  subtitle: formatTournamentHeaderSubtitle(
                    record.tournamentContext.stage,
                    game.mode,
                    scoringSettings.legsToWin
                  ),
                }
              : null
          }
          removablePlayers={
            !finished &&
            !record.tournamentContext &&
            sorted.length > 1
              ? sorted.map((p) => ({
                  userId: p.user_id,
                  name:
                    p.users?.first_name ??
                    p.users?.username ??
                    `Игрок ${p.user_id}`,
                }))
              : []
          }
          onRemovePlayer={onRemovePlayer}
          onRestart={onRestart}
          onLeave={onLeave}
          disabled={finished}
          finishHint={finishHint}
          autoScore={
            finished
              ? null
              : {
                  active: autoPhase !== "off",
                  onToggle: onToggleAutoScore,
                }
          }
          tv={
            clubTvEnabled && !record.tournamentContext
              ? {
                  code: tvCode,
                  display: tvPublicDisplay(),
                }
              : null
          }
          visitSlot={
            !finished ? (
              <HeaderVisitChips
                visitScore={active?.visit_score ?? 0}
                throws={visitChips}
                dartsThrownInVisit={dartsInVisit}
                bust={visitBust}
              />
            ) : undefined
          }
        />

        {(autoPhase === "active" ||
          (autoPhase === "calibrate" && Boolean(autoCalibProgress))) &&
        !finished ? (
          <AutoScoreBanner
            mode={autoBannerMode}
            secondsLeft={handoffLeft ?? undefined}
            lidar={nativeLidar}
            detail={
              autoBannerMode === "calibrating" ? autoCalibProgress : null
            }
            onStop={stopAutoScore}
          />
        ) : null}

        {autoCamError ? (
          <p className={styles.syncHint} role="alert">
            {autoCamError}
          </p>
        ) : null}

        {syncHint ? (
          <p className={styles.syncHint} role="status">
            {syncHint}
          </p>
        ) : null}

        {!finished && (
          <VisitBar
            key={active?.id ?? "visit"}
            visitScore={active?.visit_score ?? 0}
            throws={visitChips}
            dartsThrownInVisit={dartsInVisit}
            bust={visitBust}
          />
        )}

        <PlayerScoreboard players={displayPlayers} />
      </div>

      {!finished ? (
        <ScoringKeypad
          onThrow={onThrow}
          onUndo={onUndo}
          onNextPlayer={onNextPlayer}
          visitReady={visitReady}
          scoringLocked={scoringLocked}
          solo={solo}
        />
      ) : null}

      {!finished ? (
        <GameAchievements
          active={activeAchievements}
          onRemove={removeAchievement}
        />
      ) : null}

      {pendingRemove ? (
        <GameConfirmOverlay
          title={`Убрать ${pendingRemove.name} из игры?`}
          confirmLabel="Убрать"
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => void confirmRemovePlayer()}
        />
      ) : null}

      {showVictoryConfirm ? (
        <GameVictoryConfirmOverlay
          singleMatch={endScopeMatch}
          onCancel={() => {
            hapticImpact("light");
            setVictoryConfirmDismissed(true);
          }}
          onConfirm={onVictoryConfirm}
        />
      ) : null}

      {victoryStats ? (
        <GameVictoryOverlay
          snapshot={victoryStats.snapshot}
          record={victoryStats}
          endScopeMatch={endScopeMatch}
          matchFinished={victoryStats.snapshot.game.status === "finished"}
          busy={victoryBusy}
          onDone={goHome}
          onPlayAgain={() => void onVictoryPlayAgain()}
          onContinue={() => setVictoryStats(null)}
          playAgainLabel={
            record.tournamentContext ? "К турниру →" : "Играть еще →"
          }
        />
      ) : null}
    </div>
  );
}
