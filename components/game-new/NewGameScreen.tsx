"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import {
  finishRuleToDoubleOut,
  type ScoringRule,
} from "@/lib/darts/rules";
import {
  buildPlayerMetas,
  createAndSaveLocalGame,
} from "@/lib/game/local/create";
import { useTelegram } from "@/components/TelegramProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PlayerAvatar } from "./PlayerAvatar";
import { SegmentedControl } from "./SegmentedControl";
import styles from "./newGame.module.css";

const MAX_PLAYERS = 6;

type MemberUser = {
  first_name: string;
  username: string | null;
  photo_url: string | null;
};

export type ChannelMember = {
  user_id: number;
  users: MemberUser | MemberUser[] | null;
};

function resolveUser(member: ChannelMember): MemberUser | null {
  const u = member.users;
  if (!u) return null;
  return Array.isArray(u) ? (u[0] ?? null) : u;
}

function displayName(user: MemberUser | null, userId: number): string {
  if (!user) return String(userId);
  return user.username ?? user.first_name ?? String(userId);
}

function photoFor(
  userId: number,
  user: MemberUser | null,
  session: { id: number; photo_url?: string } | undefined
): string | null {
  if (userId === session?.id && session.photo_url) return session.photo_url;
  return user?.photo_url ?? null;
}

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

  const maxRounds = mode === "301" ? 15 : 20;

  useEffect(() => {
    if (modeParam === "301" || modeParam === "501") setMode(modeParam);
  }, [modeParam]);

  useEffect(() => {
    if (!channelId) {
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    apiFetch<{ members: ChannelMember[] }>(`/api/channels/${channelId}/members`)
      .then((d) => setMembers(d.members))
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

  const selectedRoster = useMemo(() => {
    const ids = selected;
    return ids.map((userId) => {
      const member = members.find((m) => m.user_id === userId);
      const user = member ? resolveUser(member) : null;
      if (userId === session?.user.id && session) {
        return {
          userId,
          name: displayName(
            {
              first_name: session.user.first_name,
              username: session.user.username ?? null,
              photo_url: session.user.photo_url ?? user?.photo_url ?? null,
            },
            userId
          ),
          photoUrl: photoFor(userId, user, session.user),
        };
      }
      return {
        userId,
        name: displayName(user, userId),
        photoUrl: photoFor(userId, user, session?.user),
      };
    });
  }, [selected, members, session]);

  const togglePlayer = useCallback((id: number) => {
    setReptileMsg(false);
    setError(null);

    if (selected.includes(id)) {
      setSelected((prev) => prev.filter((x) => x !== id));
      return;
    }

    if (selected.length >= MAX_PLAYERS) {
      setReptileMsg(true);
      return;
    }

    setSelected((prev) => [...prev, id]);
  }, [selected]);

  const start = async () => {
    if (selected.length < 1) {
      setError("Выберите хотя бы одного игрока");
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
          maxRounds,
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
          <div className={styles.roundsRow}>
            <Image
              src="/game-new/rounds-icon.svg"
              alt=""
              width={50}
              height={12}
              className={styles.roundsIcon}
            />
            <span className={styles.roundsLabel}>
              {maxRounds} {maxRounds === 15 ? "раундов" : "раундов"}
            </span>
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

        <section className={styles.playersCard} aria-label="Кто играет">
          <h2 className={styles.sectionTitle}>Кто играет?</h2>
          <div className={styles.avatarGrid}>
            {selectedRoster.length === 0 ? (
              <p className={styles.emptyHint}>Выберите игроков ниже</p>
            ) : (
              selectedRoster.map((p) => (
                <PlayerAvatar
                  key={p.userId}
                  name={p.name}
                  photoUrl={p.photoUrl}
                  size="play"
                  onClick={() => togglePlayer(p.userId)}
                />
              ))
            )}
          </div>
        </section>

        <section className={styles.channelSection} aria-label="Участники канала">
          <h2 className={styles.channelTitle}>Участники канала</h2>
          {membersLoading ? (
            <LoadingSpinner className={styles.channelLoading} label="" />
          ) : channelPickerList.length === 0 ? (
            <p className={styles.emptyHint}>
              Нет игроков в реестре. Участники должны один раз открыть апп из
              канала.
            </p>
          ) : (
            <div className={styles.avatarGridChannel}>
              {channelPickerList.map((m) => {
                const user = resolveUser(m);
                const name = displayName(user, m.user_id);
                const isSelected = selected.includes(m.user_id);
                return (
                  <PlayerAvatar
                    key={m.user_id}
                    name={name}
                    photoUrl={photoFor(m.user_id, user, session?.user)}
                    selected={isSelected}
                    onClick={() => togglePlayer(m.user_id)}
                  />
                );
              })}
            </div>
          )}
        </section>
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
