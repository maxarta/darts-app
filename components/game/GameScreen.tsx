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
import { useTelegram } from "@/components/TelegramProvider";
import { syncPendingMembers } from "@/lib/offline/members-service";
import { createAndSaveLocalGame } from "@/lib/game/local/create";
import { hapticImpact } from "@/lib/haptic";
import { gameBoardKey } from "@/lib/tournament/tv-board-key";
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
import styles from "./game.module.css";

export function GameScreen({ gameId }: { gameId: string }) {
  const router = useRouter();
  const { appMode, channel } = useTelegram();
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

  // Free-game TV code (club / extended only — never temporary guest games)
  useEffect(() => {
    if (!record || record.tournamentContext || !clubTvEnabled) {
      setTvCode(null);
      return;
    }
    const boardKey = gameBoardKey(record.id);
    const channelId = record.meta.channelId ?? channel?.id ?? "";
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
    record?.id,
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

  const onThrow = (input: ThrowInput) => {
    const prev = recordRef.current;
    if (!prev) return;
    const next = localGameThrow(prev, input);
    if (!next) return;
    void persist(next);
  };

  const onUndo = () => {
    const prev = recordRef.current;
    if (!prev) return;
    const next = localGameUndo(prev);
    if (!next) return;
    void persist(next);
  };

  const onNextPlayer = () => {
    const prev = recordRef.current;
    if (!prev) return;
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
        // Re-open checkout confirm if the player dismissed it by mistake.
        setVictoryConfirmDismissed(false);
        return;
      }
    }
    const next = localGameEndVisit(prev);
    if (!next) return;
    void persist(next);
  };

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

  return (
    <div className={styles.gameScreen} data-game-screen>
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
