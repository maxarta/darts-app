"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api/client";
import { isGuestMode } from "@/lib/app-mode";
import type { AchievementId } from "@/lib/game/achievements";
import type { LocalGameRecord } from "@/lib/game/local/types";
import {
  channelBoardKey,
  tournamentBoardKey,
} from "@/lib/tournament/tv-board-key";
import {
  isCustomClubPhoto,
  resolveStoredPhotoUrl,
  telegramAvatarPath,
} from "@/lib/telegram/user-photo";
import {
  writeTvLive,
  type TvLivePayload,
} from "@/lib/tournament/tv-live";

const PUBLISH_INTERVAL_MS = 1_000;

/** Keep TV payloads small — never ship base64 club photos over the wire. */
function playerPhotoUrl(
  userId: number,
  fromMeta: string | null | undefined
): string {
  const resolved = resolveStoredPhotoUrl(userId, fromMeta);
  if (resolved && !isCustomClubPhoto(resolved)) return resolved;
  return telegramAvatarPath(userId);
}

function buildPayload(
  record: LocalGameRecord,
  achievements: AchievementId[]
): TvLivePayload {
  const snap = record.snapshot;
  const settings = snap.game.settings;
  const activeIdx = snap.game.current_player_index;
  const photoByUser = new Map(
    (record.meta.players ?? []).map((p) => [p.userId, p.photoUrl ?? null])
  );

  return {
    updatedAt: Date.now(),
    phase: snap.game.status === "finished" ? "idle" : "playing",
    matchId: record.meta.tournamentMatchId,
    stage: record.tournamentContext?.stage ?? null,
    mode: snap.game.mode === "301" ? "301" : "501",
    currentRound: snap.game.current_round,
    currentLeg: snap.game.current_leg,
    legsToWin: settings.legsToWin ?? 1,
    doubleOut: settings.doubleOut !== false,
    visitThrows: snap.activeVisitThrows,
    achievements,
    players: [...snap.players]
      .sort((a, b) => a.order_index - b.order_index)
      .map((p) => ({
        userId: p.user_id,
        name: (p.users?.first_name ?? p.users?.username ?? String(p.user_id))
          .toUpperCase()
          .slice(0, 16),
        photoUrl: playerPhotoUrl(p.user_id, photoByUser.get(p.user_id)),
        remaining: p.remaining_score,
        visitStartScore: p.score_at_visit_start,
        legsWon: p.legs_won,
        visitScore: p.visit_score,
        dartsThrown: p.darts_thrown,
        ppr: p.ppr ?? 0,
        active: p.order_index === activeIdx,
      })),
  };
}

function idlePayload(matchId: string | null): TvLivePayload {
  return {
    updatedAt: Date.now(),
    phase: "idle",
    matchId,
    stage: null,
    mode: "501",
    currentRound: 1,
    currentLeg: 1,
    legsToWin: 1,
    doubleOut: true,
    visitThrows: [],
    achievements: [],
    players: [],
  };
}

/** Local Vite shares prod Supabase — never overwrite the live club TV board. */
function canPublishRemoteTv(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

/**
 * Publishes live game state for TV.
 * Extended club only — temporary (guest) games never publish.
 * Dev/localhost only writes localStorage so local TV works without
 * stomping the production channel board.
 */
export function usePublishTvLive(
  record: LocalGameRecord | null,
  achievements: AchievementId[]
) {
  const tournamentId = record?.tournamentContext?.tournamentId ?? null;
  const gameId = record?.id ?? null;
  const channelId = record?.meta.channelId ?? "";
  const title =
    record?.tournamentContext?.name ??
    (record?.snapshot.game.mode === "301" ? "301" : "501");
  const lastSentRef = useRef("");
  const achievementsRef = useRef(achievements);
  achievementsRef.current = achievements;
  const recordRef = useRef(record);
  recordRef.current = record;

  useEffect(() => {
    // Temporary games stay local — no TV board.
    if (isGuestMode()) return;

    // Free games publish to the channel session board so rematch / roster
    // changes keep the same TV code without re-pairing.
    const boardKey = tournamentId
      ? tournamentBoardKey(tournamentId)
      : channelId
        ? channelBoardKey(channelId)
        : null;
    if (!boardKey) return;

    let cancelled = false;
    const publishRemote = canPublishRemoteTv();

    const post = (payload: TvLivePayload) => {
      writeTvLive(channelId, boardKey, payload);

      if (!publishRemote) return;

      if (tournamentId) {
        void apiFetch<{ live: TvLivePayload | null }>(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/live`,
          {
            method: "POST",
            body: JSON.stringify({ live: payload }),
          }
        ).catch(() => {
          lastSentRef.current = "";
        });
      }

      void apiFetch<{ live: TvLivePayload | null }>(
        `/api/tv/boards/${encodeURIComponent(boardKey)}`,
        {
          method: "POST",
          body: JSON.stringify({
            live: payload,
            channelId: channelId || undefined,
            title,
          }),
        }
      ).catch(() => {
        lastSentRef.current = "";
      });
    };

    const publish = () => {
      const current = recordRef.current;
      if (!current || cancelled) return;

      if (current.snapshot.game.status === "finished") {
        const idle = idlePayload(current.meta.tournamentMatchId);
        post(idle);
        lastSentRef.current = "";
        return;
      }

      const payload = buildPayload(current, achievementsRef.current);
      const key = JSON.stringify({ ...payload, updatedAt: 0 });
      lastSentRef.current = key;
      post(payload);
    };

    publish();
    const id = window.setInterval(publish, PUBLISH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tournamentId, gameId, channelId, title, record, achievements]);
}
