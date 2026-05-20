"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api/client";
import {
  type ChannelMember,
  displayName,
  photoFor,
  resolveUser,
} from "@/lib/channel/members";
import { generateTournamentName } from "@/lib/tournament/name";
import {
  KENNY_THEME_COLOR,
  normalizeTournamentVariant,
  TOURNAMENT_VARIANT_LABEL,
  type TournamentVariant,
} from "@/lib/tournament/variant";
import {
  TOURNAMENT_LEGS_OPTIONS,
  type TournamentLegsToWin,
} from "@/lib/tournament/settings";
import { useTelegram } from "@/components/TelegramProvider";
import { OptionSegmented } from "@/components/game-new/OptionSegmented";
import { PlayerAvatar } from "@/components/game-new/PlayerAvatar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import styles from "@/components/game-new/newGame.module.css";

const PLAYOFF_OPTIONS = [
  { value: 4 as const, label: "Топ-4" },
  { value: 8 as const, label: "Топ-8" },
];

export function NewTournamentScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { channel, session, isChannelAdmin, ready } = useTelegram();
  const channelId = params.get("channelId") ?? channel?.id ?? "";
  const variant: TournamentVariant = normalizeTournamentVariant(
    params.get("variant")
  );

  const tournamentName = useMemo(() => generateTournamentName(), []);

  useEffect(() => {
    if (!ready) return;
    if (variant === "kenny" && !isChannelAdmin && channelId) {
      router.replace(`/?channelId=${encodeURIComponent(channelId)}`);
    }
  }, [variant, isChannelAdmin, channelId, router, ready]);

  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [playoffSize, setPlayoffSize] = useState<4 | 8>(4);
  const [legsToWin, setLegsToWin] = useState<TournamentLegsToWin>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) {
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    apiFetch<{ members: ChannelMember[] }>(`/api/channels/${channelId}/members`)
      .then((d) => setMembers(d.members))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Ошибка загрузки")
      )
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
    return selected.map((userId) => {
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
    setError(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const create = async () => {
    if (!channelId) {
      setError("Канал не выбран. Откройте приложение из канала.");
      return;
    }
    const participantIds = [...new Set(selected)];
    if (participantIds.length < 3) {
      setError("Минимум 3 участника для турнира");
      return;
    }
    if (participantIds.length < playoffSize) {
      setError(`Для плей-офф топ-${playoffSize} нужно минимум ${playoffSize} игроков`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ tournament: { id: string } }>(
        "/api/tournaments",
        {
          method: "POST",
          body: JSON.stringify({
            channelId,
            name: tournamentName,
            participantIds,
            playoffSize,
            legsToWin,
            variant,
          }),
        }
      );
      if (!data.tournament?.id) {
        throw new Error("Турнир создан без данных — попробуйте снова");
      }
      const q = new URLSearchParams({ channelId });
      if (variant === "kenny") q.set("variant", "kenny");
      router.push(`/tournament/${data.tournament.id}?${q.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setLoading(false);
    }
  };

  return (
    <div
      className={styles.screen}
      data-tournament-screen
      {...(variant === "kenny" ? { "data-tournament-kenny": "" } : {})}
      style={
        variant === "kenny"
          ? ({
              background: KENNY_THEME_COLOR,
              ["--ng-bg" as string]: KENNY_THEME_COLOR,
            } as CSSProperties)
          : undefined
      }
    >
      <div className={styles.scroll}>
        <section className={styles.modeBlock} aria-label="Турнир">
          <h1 className={styles.tournamentModeTitle}>
            {variant === "kenny"
              ? TOURNAMENT_VARIANT_LABEL.kenny
              : tournamentName}
          </h1>
          {variant === "kenny" && (
            <p className={styles.tournamentModeSubtitle}>{tournamentName}</p>
          )}
        </section>

        <section className={styles.ruleBlock}>
          <p className={styles.ruleLabel}>Победа</p>
          <OptionSegmented
            name="legs-to-win"
            value={legsToWin}
            options={TOURNAMENT_LEGS_OPTIONS}
            onChange={setLegsToWin}
          />
        </section>

        <section className={styles.ruleBlock}>
          <p className={styles.ruleLabel}>Плей-офф</p>
          <OptionSegmented
            name="playoff-size"
            value={playoffSize}
            options={PLAYOFF_OPTIONS}
            onChange={setPlayoffSize}
          />
        </section>

        {error && (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        )}

        <section className={styles.playersCard} aria-label="Участники турнира">
          <h2 className={styles.sectionTitle}>Участники</h2>
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
          disabled={loading || !channelId || selected.length < 3}
          onClick={() => void create()}
        >
          {loading ? "Создание…" : "Создать турнир"}
        </button>
      </div>
    </div>
  );
}
