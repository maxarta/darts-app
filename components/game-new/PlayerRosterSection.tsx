"use client";

import { useCallback, useMemo, useState } from "react";
import {
  type ChannelMember,
  displayName,
  photoFor,
  resolveUser,
} from "@/lib/channel/members";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerEditSheet } from "./PlayerEditSheet";
import styles from "./newGame.module.css";

type SessionUser = {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
};

type Props = {
  channelId: string;
  members: ChannelMember[];
  membersLoading: boolean;
  selected: number[];
  sessionUser?: SessionUser;
  maxSelected?: number;
  onSelectedChange: (ids: number[]) => void;
  onMembersChange: (members: ChannelMember[]) => void;
  onMaxReached?: () => void;
  selectedTitle?: string;
  rosterTitle?: string;
};

export function PlayerRosterSection({
  channelId,
  members,
  membersLoading,
  selected,
  sessionUser,
  maxSelected,
  onSelectedChange,
  onMembersChange,
  onMaxReached,
  selectedTitle = "Кто играет?",
  rosterTitle = "Игроки",
}: Props) {
  const [editingId, setEditingId] = useState<number | null | "new">(null);

  const roster = useMemo(() => {
    if (!sessionUser?.id) return members;
    if (members.some((m) => m.user_id === sessionUser.id)) return members;
    return [
      {
        user_id: sessionUser.id,
        users: {
          first_name: sessionUser.first_name,
          username: sessionUser.username ?? null,
          photo_url: sessionUser.photo_url ?? null,
        },
      },
      ...members,
    ];
  }, [members, sessionUser]);

  const selectedRoster = useMemo(() => {
    return selected.map((userId) => {
      const member = roster.find((m) => m.user_id === userId);
      const user = member ? resolveUser(member) : null;
      return {
        userId,
        name: displayName(user, userId),
        photoUrl: photoFor(userId, user, sessionUser),
      };
    });
  }, [selected, roster, sessionUser]);

  const editingPlayer = useMemo(() => {
    if (editingId == null || editingId === "new") return null;
    const m = roster.find((x) => x.user_id === editingId);
    const user = m ? resolveUser(m) : null;
    return {
      userId: editingId,
      name: displayName(user, editingId),
      photoUrl: photoFor(editingId, user, sessionUser) || null,
    };
  }, [editingId, roster, sessionUser]);

  const toggleSelect = useCallback(
    (id: number) => {
      if (selected.includes(id)) {
        onSelectedChange(selected.filter((x) => x !== id));
        return;
      }
      if (maxSelected != null && selected.length >= maxSelected) {
        onMaxReached?.();
        return;
      }
      onSelectedChange([...selected, id]);
    },
    [selected, maxSelected, onSelectedChange, onMaxReached]
  );

  const upsertMember = useCallback(
    (member: ChannelMember) => {
      onMembersChange(
        members.some((m) => m.user_id === member.user_id)
          ? members.map((m) => (m.user_id === member.user_id ? member : m))
          : [member, ...members]
      );
      if (!selected.includes(member.user_id)) {
        if (maxSelected == null || selected.length < maxSelected) {
          onSelectedChange([...selected, member.user_id]);
        }
      }
    },
    [members, selected, maxSelected, onMembersChange, onSelectedChange]
  );

  const removeMember = useCallback(
    (userId: number) => {
      onMembersChange(members.filter((m) => m.user_id !== userId));
      onSelectedChange(selected.filter((id) => id !== userId));
    },
    [members, selected, onMembersChange, onSelectedChange]
  );

  return (
    <>
      <section className={styles.playersCard} aria-label={selectedTitle}>
        <h2 className={styles.sectionTitle}>{selectedTitle}</h2>
        <div className={styles.avatarGrid}>
          {selectedRoster.length === 0 ? (
            <p className={styles.emptyHint}>Добавьте игроков ниже</p>
          ) : (
            selectedRoster.map((p) => (
              <PlayerAvatar
                key={p.userId}
                name={p.name}
                photoUrl={p.photoUrl}
                size="play"
                onClick={() => setEditingId(p.userId)}
              />
            ))
          )}
        </div>
      </section>

      <section className={styles.channelSection} aria-label={rosterTitle}>
        <h2 className={styles.channelTitle}>{rosterTitle}</h2>
        {membersLoading ? (
          <LoadingSpinner className={styles.channelLoading} label="" />
        ) : (
          <div className={styles.avatarGridChannel}>
            <button
              type="button"
              className={styles.addPlayerCell}
              onClick={() => setEditingId("new")}
              aria-label="Добавить игрока"
            >
              <span className={styles.addPlayerCircle} aria-hidden>
                +
              </span>
              <span className={styles.avatarName}>Добавить</span>
            </button>
            {roster.length === 0 ? (
              <p className={styles.emptyHint}>
                Добавьте игроков вручную — имя и фото
              </p>
            ) : (
              roster.map((m) => {
                const user = resolveUser(m);
                const name = displayName(user, m.user_id);
                const isSelected = selected.includes(m.user_id);
                return (
                  <PlayerAvatar
                    key={m.user_id}
                    name={name}
                    photoUrl={photoFor(m.user_id, user, sessionUser)}
                    selected={isSelected}
                    onClick={() => toggleSelect(m.user_id)}
                  />
                );
              })
            )}
          </div>
        )}
      </section>

      <PlayerEditSheet
        open={editingId !== null}
        channelId={channelId}
        player={editingId === "new" ? null : editingPlayer}
        canDelete={
          editingPlayer != null && editingPlayer.userId !== sessionUser?.id
        }
        onToggleSelect={
          editingPlayer
            ? () => {
                onSelectedChange(
                  selected.filter((id) => id !== editingPlayer.userId)
                );
              }
            : undefined
        }
        onClose={() => setEditingId(null)}
        onSaved={upsertMember}
        onDeleted={removeMember}
      />
    </>
  );
}
