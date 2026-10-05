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
import { loadChannelMembers } from "@/lib/offline/members-service";
import { useTelegram } from "@/components/TelegramProvider";
import { AppBackButton } from "@/components/AppBackButton";
import { PlayerRosterSection } from "./PlayerRosterSection";
import { SegmentedControl } from "./SegmentedControl";
import styles from "./newGame.module.css";

const MAX_PLAYERS = 6;

export function NewGameScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const modeParam = params.get("mode");
  const { channel, session } = useTelegram();
  const channelId = params.get("channelId") ?? channel?.id ?? "";

  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
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
      return;
    }
    setMembersLoading(true);
    loadChannelMembers(channelId)
      .then((list) => setMembers(list))
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setMembersLoading(false));
  }, [channelId]);

  useEffect(() => {
    if (session?.user.id) {
      setSelected((prev) =>
        prev.length === 0 ? [session.user.id] : prev
      );
    }
  }, [session?.user.id]);

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
            onSelectedChange={setSelected}
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
