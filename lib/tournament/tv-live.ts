import type { ThrowInput } from "@/lib/darts/rules";
import type { AchievementId } from "@/lib/game/achievements";

export type TvLivePlayer = {
  userId: number;
  name: string;
  photoUrl: string | null;
  remaining: number;
  legsWon: number;
  visitScore: number;
  dartsThrown: number;
  ppr: number;
  active: boolean;
};

export type TvLivePhase = "idle" | "upcoming" | "playing";

export type TvLivePayload = {
  updatedAt: number;
  phase: TvLivePhase;
  matchId: string | null;
  stage: string | null;
  mode: "301" | "501";
  currentRound: number;
  currentLeg: number;
  legsToWin: number;
  players: TvLivePlayer[];
  visitThrows: ThrowInput[];
  /** Recently unlocked achievement stickers for the TV board. */
  achievements: AchievementId[];
};

export const TV_LIVE_STALE_MS = 45_000;

const LIVE_KEY_PREFIX = "darts.tv.live.v1:";
const ACTIVE_KEY_PREFIX = "darts.tv.active.v1:";
export const TV_LIVE_EVENT = "darts-tv-live";

export function isTvLiveFresh(live: TvLivePayload | null | undefined): boolean {
  if (!live?.updatedAt) return false;
  return Date.now() - live.updatedAt < TV_LIVE_STALE_MS;
}

/** Production web app host — what to type on a TV browser. */
export const TV_PUBLIC_ORIGIN = "https://project-lxy5p.vercel.app";

/** Same as the app URL, just `/tv` (+ tournament). */
export function tvPath(channelId: string, tournamentId?: string): string {
  if (tournamentId) return `/tv/${encodeURIComponent(tournamentId)}`;
  const q = new URLSearchParams();
  if (channelId) q.set("channelId", channelId);
  const s = q.toString();
  return s ? `/tv?${s}` : "/tv";
}

/**
 * Absolute TV address for entering on another device (TV browser).
 * Always uses the public host — not localhost.
 */
export function tvPublicUrl(tournamentId: string): string {
  if (!tournamentId) return `${TV_PUBLIC_ORIGIN}/tv`;
  return `${TV_PUBLIC_ORIGIN}/tv/${encodeURIComponent(tournamentId)}`;
}


function liveKey(tournamentId: string) {
  return `${LIVE_KEY_PREFIX}${tournamentId}`;
}

function activeKey(channelId: string) {
  return `${ACTIVE_KEY_PREFIX}${channelId}`;
}

export function readTvLive(tournamentId: string): TvLivePayload | null {
  if (typeof localStorage === "undefined" || !tournamentId) return null;
  try {
    const raw = localStorage.getItem(liveKey(tournamentId));
    if (!raw) return null;
    return JSON.parse(raw) as TvLivePayload;
  } catch {
    return null;
  }
}

export function writeTvLive(
  channelId: string,
  tournamentId: string,
  live: TvLivePayload
): void {
  if (typeof localStorage === "undefined" || !tournamentId) return;
  try {
    localStorage.setItem(liveKey(tournamentId), JSON.stringify(live));
    if (channelId) {
      localStorage.setItem(activeKey(channelId), tournamentId);
    }
    window.dispatchEvent(
      new CustomEvent(TV_LIVE_EVENT, { detail: { tournamentId, channelId } })
    );
  } catch {
    /* private mode / quota */
  }
}

export function readActiveTvTournamentId(channelId: string): string | null {
  if (typeof localStorage === "undefined" || !channelId) return null;
  try {
    return localStorage.getItem(activeKey(channelId));
  } catch {
    return null;
  }
}

/** Remember which tournament the club TV should show. */
export function setActiveTvTournament(
  channelId: string,
  tournamentId: string
): void {
  if (typeof localStorage === "undefined" || !channelId || !tournamentId) {
    return;
  }
  try {
    localStorage.setItem(activeKey(channelId), tournamentId);
  } catch {
    /* private mode */
  }
}
