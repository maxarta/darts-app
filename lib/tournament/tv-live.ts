import type { ThrowInput } from "@/lib/darts/rules";
import type { AchievementId } from "@/lib/game/achievements";

export type TvLivePlayer = {
  userId: number;
  name: string;
  photoUrl: string | null;
  remaining: number;
  /** Score at the start of the current visit (strikethrough in UI). */
  visitStartScore: number;
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

/** How long a non-playing live payload stays relevant. */
export const TV_LIVE_STALE_MS = 120_000;

/**
 * Playing boards must not drop to "upcoming" just because nobody threw.
 * Only idle/finished payloads expire quickly.
 */
export function isTvLiveFresh(live: TvLivePayload | null | undefined): boolean {
  if (!live?.updatedAt) return false;
  if (live.phase === "playing" && live.players.length > 0) {
    return Date.now() - live.updatedAt < 30 * 60_000;
  }
  return Date.now() - live.updatedAt < TV_LIVE_STALE_MS;
}

/** Prefer an in-progress board even if a fresher idle snapshot races in. */
export function pickTvLive(
  a: TvLivePayload | null | undefined,
  b: TvLivePayload | null | undefined
): TvLivePayload | null {
  const candidates = [a, b].filter((x): x is TvLivePayload => Boolean(x));
  if (candidates.length === 0) return null;
  const playing = candidates
    .filter((x) => x.phase === "playing" && x.players.length > 0)
    .sort((x, y) => (y.updatedAt ?? 0) - (x.updatedAt ?? 0));
  if (playing[0] && isTvLiveFresh(playing[0])) return playing[0];
  const fresh = candidates
    .filter((x) => isTvLiveFresh(x))
    .sort((x, y) => (y.updatedAt ?? 0) - (x.updatedAt ?? 0));
  return fresh[0] ?? null;
}

/** Production host for TV board (artdart). */
export const TV_PUBLIC_ORIGIN = "https://artdart.vercel.app";
export const TV_PUBLIC_HOST = "artdart.vercel.app";

/** Same as the app URL, just `/tv` (+ tournament for same-device). */
export function tvPath(channelId: string, tournamentId?: string): string {
  if (tournamentId) return `/tv/${encodeURIComponent(tournamentId)}`;
  const q = new URLSearchParams();
  if (channelId) q.set("channelId", channelId);
  const s = q.toString();
  return s ? `/tv?${s}` : "/tv";
}

/** Absolute TV entry URL — type this on the TV, then enter the 4-digit code. */
export function tvPublicUrl(): string {
  return `${TV_PUBLIC_ORIGIN}/tv`;
}

/** What to type on a TV (no https://). */
export function tvPublicDisplay(): string {
  return `${TV_PUBLIC_HOST}/tv`;
}

const LIVE_KEY_PREFIX = "darts.tv.live.v1:";
const ACTIVE_KEY_PREFIX = "darts.tv.active.v1:";
export const TV_LIVE_EVENT = "darts-tv-live";

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
