"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { apiFetch } from "@/lib/api/client";
import { displayName, type MemberUser } from "@/lib/channel/members";
import { resolveStoredPhotoUrl } from "@/lib/telegram/user-photo";
import {
  buildPlayoffDisplay,
  getPlayoffBracketRounds,
  getPlayoffRoundCount,
  getPlayoffRoundTitle,
} from "@/lib/tournament/playoff-display";
import {
  gameSettingsForTournament,
  parseTournamentSettings,
} from "@/lib/tournament/settings";
import {
  buildPlayerMetas,
  createAndSaveLocalGame,
} from "@/lib/game/local/create";
import { useTelegram } from "@/components/TelegramProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { roundRobinWinnerId } from "@/lib/tournament/round-robin";
import { stableRoundRobinOrder } from "@/lib/tournament/stable-match-order";
import {
  clearCelebrateFinal,
  clearTournamentCache,
  markCelebrateFinal,
  readCelebrateFinal,
  readTournamentCache,
  writeTournamentCache,
} from "@/lib/tournament/session-cache";
import { getLocalGame } from "@/lib/game/local/store";
import { getGameWinnerIds } from "@/lib/stats/player-stats";
import {
  KENNY_THEME_COLOR,
  normalizeTournamentVariant,
} from "@/lib/tournament/variant";
import { formatGameDate } from "@/components/stats/gameArchiveModel";
import { CollapsibleSection } from "./CollapsibleSection";
import { MatchupCard, type BracketPlayer } from "./MatchupCard";
import { FinalStageCard } from "./FinalStageCard";
import { PlayoffBracket } from "./PlayoffBracket";
import {
  RoundRobinDrawPanel,
  type RoundRobinMatchRow,
} from "./RoundRobinDrawPanel";
import styles from "./tournament.module.css";

type Participant = {
  user_id: number;
  users: MemberUser | MemberUser[] | null;
};

type Standing = {
  userId: number;
  name: string;
  points: number;
  legsDiff: number;
};

type TournamentData = {
  tournament: {
    id: string;
    name: string;
    status: string;
    mode: string;
    variant?: string;
    playoff_size: number;
    channel_id: string;
    created_at?: string;
    settings?: unknown;
  };
  standings: Standing[];
  roundRobinMatches: Array<{
    id: string;
    player1_id: number;
    player2_id: number;
    game_id: string | null;
    played: boolean;
    points_p1: number | null;
    points_p2: number | null;
  }>;
  playoffMatches: Array<{
    id: string;
    round: number;
    slot: number;
    player1_id: number | null;
    player2_id: number | null;
    game_id: string | null;
    winner_id: number | null;
  }>;
  participants: Participant[];
};

function resolveUser(
  p: Participant
): { first_name: string; username: string | null; photo_url: string | null } | null {
  const u = p.users;
  if (!u) return null;
  return Array.isArray(u) ? (u[0] ?? null) : u;
}

const STATUS_LABEL: Record<string, string> = {
  round_robin: "Круговой этап",
  playoff: "Плей-офф",
  finished: "Завершён",
  draft: "Черновик",
};

type SectionOpenState = { rr: boolean; playoff: boolean };

function sectionsStorageKey(tournamentId: string) {
  return `darts:tournament:${tournamentId}:sections`;
}

function readStoredSections(tournamentId: string): SectionOpenState {
  if (typeof window === "undefined") {
    return { rr: false, playoff: false };
  }
  try {
    const raw = sessionStorage.getItem(sectionsStorageKey(tournamentId));
    if (!raw) return { rr: false, playoff: false };
    const parsed = JSON.parse(raw) as Partial<SectionOpenState>;
    return { rr: Boolean(parsed.rr), playoff: Boolean(parsed.playoff) };
  } catch {
    return { rr: false, playoff: false };
  }
}

function writeStoredSections(tournamentId: string, state: SectionOpenState) {
  try {
    sessionStorage.setItem(
      sectionsStorageKey(tournamentId),
      JSON.stringify(state)
    );
  } catch {
    /* quota / private mode */
  }
}

type Props = {
  tournamentId: string;
};

function tournamentScreenShellProps(isKenny: boolean) {
  return {
    className: styles.screen,
    "data-tournament-screen": true,
    ...(isKenny ? { "data-tournament-kenny": "" } : {}),
    style: isKenny
      ? ({
          background: KENNY_THEME_COLOR,
          ["--ng-bg" as string]: KENNY_THEME_COLOR,
        } as CSSProperties)
      : undefined,
  };
}

export function TournamentScreen({ tournamentId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelId = searchParams.get("channelId") ?? "";
  const variantFromUrl = searchParams.get("variant");
  const { session } = useTelegram();

  const [data, setData] = useState<TournamentData | null>(() =>
    readTournamentCache<TournamentData>(tournamentId)
  );
  const [error, setError] = useState<string | null>(null);
  const [playoffLoading, setPlayoffLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [finishLoading, setFinishLoading] = useState(false);
  const [matchLoading, setMatchLoading] = useState<string | null>(null);
  const [rrOpen, setRrOpen] = useState(false);
  const [playoffOpen, setPlayoffOpen] = useState(false);
  const [sectionsReady, setSectionsReady] = useState(false);
  const [rrDrawBusy, setRrDrawBusy] = useState(false);
  const [celebrateFinal, setCelebrateFinal] = useState(() =>
    readCelebrateFinal(tournamentId)
  );
  const [finalLocalWinnerId, setFinalLocalWinnerId] = useState<number | null>(
    null
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const finalCardRef = useRef<HTMLElement>(null);
  const championSaluteRef = useRef<HTMLDivElement>(null);
  const finishBtnRef = useRef<HTMLButtonElement>(null);
  const archiveStatusRef = useRef<HTMLDivElement>(null);
  const autoScrollLockedRef = useRef(false);
  const didAutoScrollRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const rrMatchOrderRef = useRef<string[]>([]);
  const prevStatusRef = useRef<string | null>(null);

  const applyTournamentData = useCallback((next: TournamentData) => {
    return {
      ...next,
      roundRobinMatches: stableRoundRobinOrder(
        next.roundRobinMatches,
        rrMatchOrderRef
      ),
    };
  }, []);

  useEffect(() => {
    const cached = readTournamentCache<TournamentData>(tournamentId);
    setData(cached ? applyTournamentData(cached) : null);
    setError(null);

    const stored = readStoredSections(tournamentId);
    setRrOpen(stored.rr);
    setPlayoffOpen(stored.playoff);
    prevStatusRef.current = null;
    rrMatchOrderRef.current = [];
    autoScrollLockedRef.current = false;
    didAutoScrollRef.current = false;
    programmaticScrollRef.current = false;
    setSectionsReady(true);
  }, [tournamentId, applyTournamentData]);

  useEffect(() => {
    if (!sectionsReady) return;
    writeStoredSections(tournamentId, { rr: rrOpen, playoff: playoffOpen });
  }, [tournamentId, rrOpen, playoffOpen, sectionsReady]);

  useEffect(() => {
    if (searchParams.get("celebrate") === "final") {
      markCelebrateFinal(tournamentId);
      setCelebrateFinal(true);
      const q = new URLSearchParams(searchParams.toString());
      q.delete("celebrate");
      const suffix = q.toString() ? `?${q.toString()}` : "";
      router.replace(`/tournament/${tournamentId}${suffix}`, { scroll: false });
    } else if (readCelebrateFinal(tournamentId)) {
      setCelebrateFinal(true);
    }
  }, [searchParams, tournamentId, router]);

  const handleDrawn = useCallback((matches: RoundRobinMatchRow[]) => {
    rrMatchOrderRef.current = matches.map((m) => m.id);
    setData((prev) =>
      prev
        ? {
            ...prev,
            roundRobinMatches: stableRoundRobinOrder(matches, rrMatchOrderRef),
          }
        : prev
    );
    setRrOpen(true);
    setRrDrawBusy(false);
  }, []);

  const playoffSize = (data?.tournament.playoff_size === 8 ? 8 : 4) as 4 | 8;

  const load = useCallback(() => {
    if (!tournamentId) return;
    apiFetch<TournamentData>(`/api/tournaments/${tournamentId}`)
      .then((next) => {
        writeTournamentCache(tournamentId, next);
        setData(applyTournamentData(next));
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Ошибка загрузки")
      );
  }, [tournamentId, applyTournamentData]);

  useEffect(() => {
    if (!readCelebrateFinal(tournamentId)) return;
    load();
  }, [tournamentId, load]);

  useEffect(() => {
    if (rrDrawBusy) return;
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load, rrDrawBusy]);

  const playoffDisplay = useMemo(() => {
    if (!data) return [];
    return buildPlayoffDisplay(playoffSize, data.playoffMatches);
  }, [data, playoffSize]);

  const totalPlayoffRounds = getPlayoffRoundCount(playoffSize);
  const playoffBracketRounds = useMemo(
    () => getPlayoffBracketRounds(playoffSize),
    [playoffSize]
  );

  const finalMatch = useMemo(() => {
    const finals = playoffDisplay.filter((m) => m.round === totalPlayoffRounds);
    return finals.sort((a, b) => a.slot - b.slot)[0] ?? null;
  }, [playoffDisplay, totalPlayoffRounds]);

  const finalDbMatch = useMemo(() => {
    if (!data) return null;
    return (
      data.playoffMatches.find((m) => m.round === totalPlayoffRounds) ?? null
    );
  }, [data, totalPlayoffRounds]);

  useEffect(() => {
    const gameId = finalDbMatch?.game_id ?? finalMatch?.game_id;
    if (!gameId) {
      setFinalLocalWinnerId(null);
      return;
    }
    let cancelled = false;
    void getLocalGame(gameId).then((record) => {
      if (cancelled || !record || record.snapshot.game.status !== "finished") {
        if (!cancelled) setFinalLocalWinnerId(null);
        return;
      }
      const ids = getGameWinnerIds({
        id: record.id,
        mode: record.meta.mode,
        settings: record.meta.settings,
        current_round: record.snapshot.game.current_round,
        game_players: record.snapshot.players.map((p) => ({
          user_id: p.user_id,
          legs_won: p.legs_won,
          remaining_score: p.remaining_score,
          darts_thrown: p.darts_thrown,
        })),
      });
      const winner = ids.values().next().value ?? null;
      if (!cancelled) setFinalLocalWinnerId(winner);
    });
    return () => {
      cancelled = true;
    };
  }, [finalDbMatch?.game_id, finalMatch?.game_id]);

  const finalWinnerId =
    finalDbMatch?.winner_id ??
    finalMatch?.winner_id ??
    finalLocalWinnerId;
  const finalDecided = finalWinnerId != null;

  useEffect(() => {
    if (!finalDecided || !readCelebrateFinal(tournamentId)) return;
    setCelebrateFinal(true);
  }, [finalDecided, tournamentId]);

  const scrollToFinal = useCallback(() => {
    programmaticScrollRef.current = true;
    (finishBtnRef.current ?? archiveStatusRef.current)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
    finalCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 1000);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const lockAutoScroll = () => {
      if (programmaticScrollRef.current) return;
      autoScrollLockedRef.current = true;
    };

    el.addEventListener("scroll", lockAutoScroll, { passive: true });
    el.addEventListener("wheel", lockAutoScroll, { passive: true });
    el.addEventListener("touchmove", lockAutoScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", lockAutoScroll);
      el.removeEventListener("wheel", lockAutoScroll);
      el.removeEventListener("touchmove", lockAutoScroll);
    };
  }, [data]);

  useEffect(() => {
    if (!finalDecided) return;
    const shouldAutoScroll =
      celebrateFinal || data?.tournament.status === "finished";
    if (!shouldAutoScroll) return;
    if (autoScrollLockedRef.current || didAutoScrollRef.current) return;

    didAutoScrollRef.current = true;
    const frame = requestAnimationFrame(() => {
      scrollToFinal();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    celebrateFinal,
    finalDecided,
    data?.tournament.status,
    scrollToFinal,
  ]);

  const playerMap = useMemo(() => {
    const map = new Map<number, BracketPlayer>();
    if (!data) return map;
    for (const p of data.participants) {
      const user = resolveUser(p);
      map.set(p.user_id, {
        userId: p.user_id,
        name: displayName(user, p.user_id),
        photoUrl: resolveStoredPhotoUrl(p.user_id, user?.photo_url),
      });
    }
    return map;
  }, [data]);

  const player = useCallback(
    (id: number | null): BracketPlayer | null => {
      if (id == null) return null;
      return (
        playerMap.get(id) ?? {
          userId: id,
          name: String(id),
          photoUrl: resolveStoredPhotoUrl(id, null),
        }
      );
    },
    [playerMap]
  );

  useEffect(() => {
    if (!data) return;
    const status = data.tournament.status;
    const prev = prevStatusRef.current;
    if (prev === status) return;

    if (prev === null && (status === "playoff" || status === "finished")) {
      setPlayoffOpen(true);
    } else if (
      prev === "round_robin" &&
      (status === "playoff" || status === "finished")
    ) {
      setRrOpen(false);
      setPlayoffOpen(true);
    }

    prevStatusRef.current = status;
  }, [data?.tournament.status]);

  const startMatch = async (matchId: string, type: "rr" | "playoff") => {
    if (matchId.startsWith("preview-") || !data) return;
    if (data.tournament.status === "finished") return;
    setMatchLoading(matchId);
    try {
      const rrMatch = data.roundRobinMatches.find((m) => m.id === matchId);
      const poMatch = data.playoffMatches.find((m) => m.id === matchId);
      const match = type === "rr" ? rrMatch : poMatch;
      if (!match) throw new Error("Матч не найден");

      const playerIds = [match.player1_id, match.player2_id].filter(
        (id): id is number => id != null
      );

      if (playerIds.length < 2) {
        throw new Error("Оба игрока должны быть в матче");
      }

      const tournamentSettings = parseTournamentSettings(data.tournament.settings);
      const mode = data.tournament.mode === "301" ? "301" : "501";
      const totalPlayoffRounds = getPlayoffRoundCount(playoffSize);
      const isFinalMatch =
        type === "playoff" && poMatch?.round === totalPlayoffRounds;
      const stage =
        type === "rr"
          ? "Круговой этап"
          : getPlayoffRoundTitle(poMatch?.round ?? 1, totalPlayoffRounds);

      const participantsForMeta = data.participants.map((p) => ({
        user_id: p.user_id,
        users: resolveUser(p),
      }));

      const gameId = await createAndSaveLocalGame({
        channelId: channelId || data.tournament.channel_id,
        mode,
        playerIds,
        players: buildPlayerMetas(playerIds, participantsForMeta),
        createdBy: session?.user.id ?? 1,
        settings: gameSettingsForTournament(mode, tournamentSettings, {
          final: isFinalMatch,
        }),
        tournamentMatchId: matchId,
        tournamentMatchType: type,
        tournamentContext: {
          tournamentId: data.tournament.id,
          name: data.tournament.name,
          stage,
          variant: normalizeTournamentVariant(
            data.tournament.variant ?? variantFromUrl
          ),
        },
      });

      router.push(`/game/${gameId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setMatchLoading(null);
    }
  };

  const startPlayoff = async () => {
    setPlayoffLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/tournaments/${tournamentId}/playoff`, {
        method: "POST",
      });
      setRrOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPlayoffLoading(false);
    }
  };

  const goHome = () => {
    clearCelebrateFinal(tournamentId);
    clearTournamentCache(tournamentId);
    const home = channelId
      ? `/?channelId=${encodeURIComponent(channelId)}`
      : "/";
    router.push(home);
  };

  const completeTournament = async () => {
    if (!data) return;

    const ok = window.confirm(
      "Завершить турнир? Он сохранится в архиве и будет доступен всем участникам канала."
    );
    if (!ok) return;

    setFinishLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/tournaments/${tournamentId}/finish`, {
        method: "POST",
      });
      goHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось завершить");
      setFinishLoading(false);
    }
  };

  const removeTournament = async () => {
    const ok = window.confirm(
      `Удалить турнир «${data?.tournament.name}»? Все матчи и результаты будут потеряны.`
    );
    if (!ok) return;
    setDeleteLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/tournaments/${tournamentId}`, { method: "DELETE" });
      clearTournamentCache(tournamentId);
      const home = channelId
        ? `/?channelId=${encodeURIComponent(channelId)}`
        : "/";
      router.push(home);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить");
      setDeleteLoading(false);
    }
  };

  const isKenny =
    normalizeTournamentVariant(
      data?.tournament.variant ?? variantFromUrl
    ) === "kenny";

  if (error && !data) {
    return (
      <div {...tournamentScreenShellProps(isKenny)}>
        <p className={styles.errorBanner}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div {...tournamentScreenShellProps(isKenny)}>
        <LoadingSpinner label="Загрузка…" className={styles.loading} />
      </div>
    );
  }

  const needsDraw =
    data.tournament.status === "round_robin" &&
    data.roundRobinMatches.length === 0;

  const rrPlayed = data.roundRobinMatches.filter((m) => m.played).length;
  const rrTotal = data.roundRobinMatches.length;
  const rrDone = rrTotal > 0 && rrPlayed === rrTotal;
  const playoffBracketMatches = playoffDisplay.filter(
    (m) => m.round < totalPlayoffRounds
  );
  const playoffPlayed = playoffBracketMatches.filter((m) => m.winner_id).length;
  const playoffTotal = playoffBracketMatches.length;
  const playoffMeta = `${playoffPlayed}/${playoffTotal} матчей`;

  const { legsToWin } = parseTournamentSettings(data.tournament.settings);
  const isFinished = data.tournament.status === "finished";
  const canCompleteTournament =
    data.tournament.status === "playoff" && finalDecided;
  const showArchivedStatus = isFinished && finalDecided;
  const showCelebration =
    finalDecided && (celebrateFinal || isFinished);
  const tournamentDateLabel = data.tournament.created_at
    ? formatGameDate(data.tournament.created_at)
    : null;

  return (
    <div {...tournamentScreenShellProps(isKenny)}>
      <div ref={scrollContainerRef} className={styles.scroll}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            {isKenny ? (
              <Image
                src="/game/kenny.svg"
                alt="Kenny Pub"
                width={473}
                height={191}
                className={styles.kennyLogo}
                priority
              />
            ) : null}
            <h1 className={styles.title}>{data.tournament.name}</h1>
            <p className={styles.status}>
              {STATUS_LABEL[data.tournament.status] ?? data.tournament.status}
              {" · "}
              501 · топ-{data.tournament.playoff_size} · до {legsToWin}{" "}
              {legsToWin === 1 ? "победы" : "побед"}
            </p>
          </div>
        </header>

        {error && (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        )}

        {(needsDraw || data.roundRobinMatches.length > 0) && (
          <CollapsibleSection
            title="Круговой этап"
            meta={
              needsDraw
                ? "Жеребьёвка"
                : `${rrPlayed}/${rrTotal} матчей сыграно`
            }
            open={needsDraw || rrOpen}
            onToggle={() => setRrOpen((v) => !v)}
          >
            {needsDraw ? (
              <RoundRobinDrawPanel
                tournamentId={tournamentId}
                player={player}
                onDrawn={handleDrawn}
                onPhaseChange={(phase) =>
                  setRrDrawBusy(phase === "spinning" || phase === "revealing")
                }
              />
            ) : (
            <div className={styles.rrGrid}>
              {data.roundRobinMatches.map((m) => {
                const p1 = player(m.player1_id);
                const p2 = player(m.player2_id);
                const score =
                  m.played && m.points_p1 != null && m.points_p2 != null
                    ? `${m.points_p1} : ${m.points_p2}`
                    : null;
                const winnerId = roundRobinWinnerId(m);
                const canPlay = !m.played && !m.game_id;

                return (
                  <MatchupCard
                    key={m.id}
                    player1={p1}
                    player2={p2}
                    played={m.played}
                    scoreLabel={score}
                    gameId={m.game_id}
                    roundRobinComplete
                    winnerUserId={winnerId}
                    canPlay={canPlay && matchLoading !== m.id}
                    onPlay={
                      canPlay ? () => void startMatch(m.id, "rr") : undefined
                    }
                  />
                );
              })}
            </div>
            )}
          </CollapsibleSection>
        )}

        {data.tournament.status === "round_robin" && rrDone && (
          <button
            type="button"
            className={styles.playoffCta}
            disabled={playoffLoading}
            onClick={() => void startPlayoff()}
          >
            {playoffLoading
              ? "Запуск…"
              : `Начать плей-офф (топ-${data.tournament.playoff_size})`}
          </button>
        )}

        <CollapsibleSection
          title="Плей-офф"
          meta={playoffMeta}
          open={playoffOpen}
          onToggle={() => setPlayoffOpen((v) => !v)}
          className={styles.playoffCard}
        >
          <PlayoffBracket
            rounds={playoffBracketRounds}
            totalRounds={totalPlayoffRounds}
            matches={playoffDisplay}
            player={player}
            matchLoading={matchLoading}
            layout="stack"
            onPlay={(id) => void startMatch(id, "playoff")}
          />
        </CollapsibleSection>

        <FinalStageCard
          ref={finalCardRef}
          match={
            finalMatch && finalWinnerId != null
              ? { ...finalMatch, winner_id: finalWinnerId }
              : finalMatch
          }
          player={player}
          matchLoading={matchLoading}
          onPlay={(id) => void startMatch(id, "playoff")}
          showKennyPrize={isKenny}
          confettiVariant={isKenny ? "kenny" : "default"}
          celebrating={showCelebration}
          championSaluteRef={championSaluteRef}
        />

        {canCompleteTournament ? (
          <button
            ref={finishBtnRef}
            type="button"
            className={styles.finishTournamentBtn}
            disabled={finishLoading}
            onClick={() => void completeTournament()}
          >
            {finishLoading ? "Завершение…" : "Завершить турнир"}
          </button>
        ) : showArchivedStatus ? (
          <div
            ref={archiveStatusRef}
            className={styles.tournamentCompletedBanner}
            role="status"
          >
            <p className={styles.tournamentCompletedTitle}>Турнир завершён</p>
            {tournamentDateLabel ? (
              <p className={styles.tournamentCompletedDate}>
                {tournamentDateLabel}
              </p>
            ) : null}
          </div>
        ) : null}

        <footer className={styles.tournamentFooter}>
          {!isFinished ? (
            <button
              type="button"
              className={styles.deleteTournamentBtn}
              disabled={deleteLoading}
              onClick={() => void removeTournament()}
            >
              {deleteLoading ? "Удаление…" : "Удалить турнир"}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
