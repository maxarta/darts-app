"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import type { ChannelMember } from "@/lib/channel/members";
import { compressImageToDataUrl } from "@/lib/channel/compress-image";
import {
  createChannelPlayerOfflineFirst,
  deleteChannelPlayerOfflineFirst,
  updateChannelPlayerOfflineFirst,
} from "@/lib/offline/members-service";
import { useBodyScrollLock } from "@/lib/ui/use-body-scroll-lock";
import styles from "./playerEditSheet.module.css";

type Props = {
  open: boolean;
  channelId: string;
  /** null = create new player */
  player: {
    userId: number;
    name: string;
    photoUrl: string | null;
  } | null;
  canDelete: boolean;
  onToggleSelect?: () => void;
  onClose: () => void;
  onSaved: (member: ChannelMember) => void;
  onDeleted: (userId: number) => void;
};

export function PlayerEditSheet({
  open,
  channelId,
  player,
  canDelete,
  onToggleSelect,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const isCreate = player == null;
  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setName(player?.name ?? "");
    setPhotoUrl(player?.photoUrl ?? null);
    setError(null);
    setBusy(false);
  }, [open, player]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useBodyScrollLock(open);

  if (!open || !mounted) return null;

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isCreate) {
        const member = await createChannelPlayerOfflineFirst(
          channelId,
          name,
          photoUrl
        );
        onSaved(member);
        onClose();
        return;
      }

      const member = await updateChannelPlayerOfflineFirst(
        channelId,
        player.userId,
        { name, photo_url: photoUrl }
      );
      onSaved(member);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!player || !canDelete) return;
    if (!window.confirm(`Удалить «${player.name}» из списка?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteChannelPlayerOfflineFirst(channelId, player.userId);
      onDeleted(player.userId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotoUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка фото");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className={styles.backdrop}
      data-player-edit-sheet
      role="presentation"
      onClick={onClose}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden />
        <h2 id={titleId} className={styles.title}>
          {isCreate ? "Новый игрок" : "Игрок"}
        </h2>

        <form className={styles.form} onSubmit={(e) => void save(e)}>
          <button
            type="button"
            className={styles.photoBtn}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Сделать или выбрать фото"
          >
            {photoUrl ? (
              <img src={photoUrl} alt="" className={styles.photoImg} />
            ) : (
              <span className={styles.photoPlaceholder}>Фото</span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className={styles.fileInput}
            onChange={(e) => void pickPhoto(e.target.files?.[0] ?? null)}
          />

          <label className={styles.label}>
            Имя
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя игрока"
              maxLength={40}
              autoFocus
              disabled={busy}
            />
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primary}
              disabled={busy || !name.trim()}
            >
              {busy ? "…" : isCreate ? "Добавить" : "Сохранить"}
            </button>
            {!isCreate && onToggleSelect && (
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => {
                  onToggleSelect();
                  onClose();
                }}
              >
                Убрать из состава
              </button>
            )}
            {!isCreate && canDelete && (
              <button
                type="button"
                className={styles.danger}
                disabled={busy}
                onClick={() => void remove()}
              >
                Удалить
              </button>
            )}
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={onClose}
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
