"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  finishRuleToDoubleOut,
  UNLIMITED_ROUNDS,
  type ScoringRule,
} from "@/lib/darts/rules";
import { type ChannelMember } from "@/lib/channel/members";
import {
  buildPlayerMetas,
  createAndSaveLocalGame,
} from "@/lib/game/local/create";
import { readLastRoster, writeLastRoster } from "@/lib/app-mode";
import { loadChannelMembers } from "@/lib/offline/members-service";
import { useSession } from "@/components/SessionProvider";
import { AppBackButton } from "@/components/AppBackButton";
import { PlayerRosterSection } from "./PlayerRosterSection";
import { SegmentedControl } from "./SegmentedControl";
import styles from "./newGame.module.css";

const MAX_PLAYERS = 6;

function resolveInitialSelection(
  channelId: string,
  members: ChannelMember[],
  sessionUserId: number | undefined
): number[] {
  const known = new Set(members.map((m) => m.user_id));
  if (sessionUserId) known.add(sessionUserId);

  const saved = readLastRoster(channelId);
  if (saved && saved.length > 0) {
    const restored = saved.filter((id) => known.has(id)).slice(0, MAX_PLAYERS);
    if (restored.length > 0) return restored;
  }

  return sessionUserId ? [sessionUserId] : [];
}

export function NewGameScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const modeParam = params.get("mode");
  const { channel, session } = useSession();
  const channelId = params.get("channelId") ?? channel?.id ?? "";

  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [rosterReady, setRosterReady] = useState(false);
  const [mode, setMode] = useState<"501" | "301">(
    modeParam === "301" ? "301" : "501"
  );
  const [startRule, setStartRule] = useState<ScoringRule>("straight");
  const [finishRule, setFinishRule] = useState<ScoringRule>("double");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reptileMsg, setReptileMsg] = useState(false);

  useEffect(() => {
    if (modeParam === "301" || modeParam === "501") setMode(modeParam);
  }, [modeParam]);

  useEffect(() => {
    if (!channelId) {
      setMembersLoading(false);
      setRosterReady(false);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    setRosterReady(false);
    loadChannelMembers(channelId)
      .then((list) => {
        if (cancelled) return;
        setMembers(list);
        setSelected(
          resolveInitialSelection(channelId, list, session?.user.id)
        );
        setRosterReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
        setSelected(
          resolveInitialSelection(channelId, [], session?.user.id)
        );
        setRosterReady(true);
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, session?.user.id]);

  useEffect(() => {
    if (!channelId || !rosterReady) return;
    writeLastRoster(channelId, selected);
  }, [channelId, selected, rosterReady]);

  const onSelectedChange = (next: number[]) => {
    setSelected(next);
    if (channelId) writeLastRoster(channelId, next);
  };

  const channelPickerList = useMemo(() => {
    if (!session?.user.id) return members;
    if (members.some((m) => m.user_id === session.user.id)) return members;
    return [
      {
        user_id: session.user.id,
        users: {
          first_name: session.user.first_name,
          username: session.user.username ?? null,
          photo_url: session.user.photo_url ?? null,
        },
      },
      ...members,
    ];
  }, [members, session]);

  const start = async () => {
    if (selected.length < 1) {
      setError("Выберите хотя бы одного игрока");
      return;
    }
    if (!channelId) {
      setError("Канал не найден. Откройте приложение из группы.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      writeLastRoster(channelId, selected);
      const gameId = await createAndSaveLocalGame({
        channelId,
        mode,
        playerIds: selected,
        players: buildPlayerMetas(selected, channelPickerList),
        createdBy: session?.user.id ?? 1,
        settings: {
          maxRounds: UNLIMITED_ROUNDS,
          legsToWin: 1,
          doubleOut: finishRuleToDoubleOut(finishRule),
          startRule,
          finishRule,
        },
      });
      router.push(`/game/${gameId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setLoading(false);
    }
  };

  return (
    <div className={styles.screen} data-new-game-screen>
      <div className={styles.scroll}>
        <section className={styles.modeBlock} aria-label="Режим игры">
          <div className={styles.pageNav}>
            <Suspense fallback={null}>
              <AppBackButton tone="light" />
            </Suspense>
          </div>
          <h1 className={styles.modeTitle}>{mode}</h1>
        </section>

        <section className={styles.ruleBlock}>
          <p className={styles.ruleLabel}>Начинаем</p>
          <SegmentedControl
            name="start-rule"
            value={startRule}
            onChange={setStartRule}
          />
        </section>

        <section className={styles.ruleBlock}>
          <p className={styles.ruleLabel}>Заканчиваем</p>
          <SegmentedControl
            name="finish-rule"
            value={finishRule}
            onChange={setFinishRule}
          />
        </section>

        {reptileMsg && (
          <p className={styles.reptileBanner} role="alert">
            Свыше 6 человек играют только рептилоиды 🖖
          </p>
        )}

        {error && (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        )}

        {channelId ? (
          <PlayerRosterSection
            channelId={channelId}
            members={members}
            membersLoading={membersLoading}
            selected={selected}
            sessionUser={session?.user}
            maxSelected={MAX_PLAYERS}
            onSelectedChange={onSelectedChange}
            onMembersChange={setMembers}
            onMaxReached={() => setReptileMsg(true)}
            selectedTitle="Кто играет?"
            rosterTitle="Игроки"
          />
        ) : (
          <p className={styles.emptyHint}>Загрузка клуба…</p>
        )}
      </div>

      <div className={styles.startBar}>
        <button
          type="button"
          className={styles.startBtn}
          disabled={loading || selected.length < 1}
          onClick={() => void start()}
        >
          {loading ? "Создание…" : "Начать игру"}
        </button>
      </div>
    </div>
  );
}
