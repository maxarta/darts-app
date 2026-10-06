"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api/client";
import type { AchievementId } from "@/lib/game/achievements";
import type { LocalGameRecord } from "@/lib/game/local/types";
import { resolveStoredPhotoUrl } from "@/lib/telegram/user-photo";
import {
  writeTvLive,
  type TvLivePayload,
} from "@/lib/tournament/tv-live";

const PUBLISH_INTERVAL_MS = 800;

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
    visitThrows: snap.activeVisitThrows,
    achievements,
    players: [...snap.players]
      .sort((a, b) => a.order_index - b.order_index)
      .map((p) => ({
        userId: p.user_id,
        name: (p.users?.first_name ?? p.users?.username ?? String(p.user_id))
          .toUpperCase()
          .slice(0, 16),
        photoUrl: resolveStoredPhotoUrl(
          p.user_id,
          photoByUser.get(p.user_id)
        ),
        remaining: p.remaining_score,
        legsWon: p.legs_won,
        visitScore: p.visit_score,
        dartsThrown: p.darts_thrown,
        ppr: p.ppr ?? 0,
        active: p.order_index === activeIdx,
      })),
  };
}

/** Publishes live game state to the API so `/tv` on another device can poll it. */
export function usePublishTvLive(
  record: LocalGameRecord | null,
  achievements: AchievementId[]
) {
  const tournamentId = record?.tournamentContext?.tournamentId ?? null;
  const channelId = record?.meta.channelId ?? "";
  const lastSentRef = useRef("");
  const achievementsRef = useRef(achievements);
  achievementsRef.current = achievements;
  const recordRef = useRef(record);
  recordRef.current = record;

  useEffect(() => {
    if (!tournamentId) return;

    let cancelled = false;

    const publish = () => {
      const current = recordRef.current;
      if (!current || cancelled) return;
      const payload = buildPayload(current, achievementsRef.current);
      const key = JSON.stringify({
        ...payload,
        updatedAt: 0,
      });
      if (key === lastSentRef.current) return;
      lastSentRef.current = key;

      // Same-browser shortcut; TV on another device reads via API.
      writeTvLive(channelId, tournamentId, payload);

      void apiFetch<{ live: TvLivePayload | null }>(
        `/api/tournaments/${encodeURIComponent(tournamentId)}/live`,
        {
          method: "POST",
          body: JSON.stringify({ live: payload }),
        }
      ).catch(() => {
        /* keep trying on next tick */
        lastSentRef.current = "";
      });
    };

    publish();
    const id = window.setInterval(publish, PUBLISH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tournamentId, channelId, record, achievements]);
}
