"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api/client";
import { type ChannelMember } from "@/lib/channel/members";
import {
  loadChannelMembers,
  syncPendingMembers,
} from "@/lib/offline/members-service";
import { isOnline } from "@/lib/game/sync/client";
import { generateTournamentName } from "@/lib/tournament/name";
import {
  KENNY_THEME_COLOR,
  normalizeTournamentVariant,
  TOURNAMENT_VARIANT_LABEL,
  type TournamentVariant,
} from "@/lib/tournament/variant";
import { useTelegram } from "@/components/TelegramProvider";
import { AppBackButton } from "@/components/AppBackButton";
import { PlayerRosterSection } from "@/components/game-new/PlayerRosterSection";
import styles from "@/components/game-new/newGame.module.css";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) {
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    loadChannelMembers(channelId)
      .then((list) => setMembers(list))
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

  const create = async () => {
    if (!channelId) {
      setError("Клуб не найден");
      return;
    }
    const participantIds = [...new Set(selected)];
    if (participantIds.length < 3) {
      setError("Минимум 3 участника для турнира");
      return;
    }
    if (!isOnline()) {
      setError("Нужен интернет, чтобы создать турнир");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await syncPendingMembers();
      const data = await apiFetch<{ tournament: { id: string } }>(
        "/api/tournaments",
        {
          method: "POST",
          body: JSON.stringify({
            channelId,
            name: tournamentName,
            participantIds,
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
          <div className={styles.pageNav}>
            <Suspense fallback={null}>
              <AppBackButton tone="light" />
            </Suspense>
          </div>
          <h1 className={styles.tournamentModeTitle}>
            {variant === "kenny"
              ? TOURNAMENT_VARIANT_LABEL.kenny
              : tournamentName}
          </h1>
          {variant === "kenny" && (
            <p className={styles.tournamentModeSubtitle}>{tournamentName}</p>
          )}
          <p className={styles.tournamentModeSubtitle}>
            Жеребьёвка на пары · до 2 побед · при нечёте — пропуск раунда
          </p>
        </section>

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
            onSelectedChange={setSelected}
            onMembersChange={setMembers}
            selectedTitle="Участники"
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
          disabled={loading || !channelId || selected.length < 3}
          onClick={() => void create()}
        >
          {loading ? "Создание…" : "Создать турнир"}
        </button>
      </div>
    </div>
  );
}
