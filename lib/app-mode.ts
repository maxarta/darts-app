/** Guest (temp) vs extended (club) app access. */

export type AppMode = "guest" | "extended";

const MODE_KEY = "darts.app-mode.v1";
const GUEST_CHANNEL_KEY = "darts.guest-channel-id.v1";
const LAST_ROSTER_KEY = "darts.last-roster.v1";

export type LastRoster = {
  channelId: string;
  selectedIds: number[];
};

function readExtendedAccessCode(): string {
  const fromVite =
    typeof import.meta !== "undefined"
      ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
          ?.VITE_EXTENDED_ACCESS_CODE
      : undefined;
  const fromProcess =
    typeof process !== "undefined"
      ? process.env.VITE_EXTENDED_ACCESS_CODE ||
        process.env.NEXT_PUBLIC_EXTENDED_ACCESS_CODE
      : undefined;
  return (fromVite || fromProcess || "polyana").trim();
}

export function getAppMode(): AppMode {
  if (typeof localStorage === "undefined") return "guest";
  try {
    return localStorage.getItem(MODE_KEY) === "extended" ? "extended" : "guest";
  } catch {
    return "guest";
  }
}

export function setAppMode(mode: AppMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* private mode */
  }
}

export function isGuestMode(): boolean {
  return getAppMode() === "guest";
}

export function isExtendedMode(): boolean {
  return getAppMode() === "extended";
}

export function getGuestChannelId(): string {
  if (typeof localStorage === "undefined") return "guest-local";
  try {
    const existing = localStorage.getItem(GUEST_CHANNEL_KEY);
    if (existing) return existing;
    const id = `guest-${crypto.randomUUID()}`;
    localStorage.setItem(GUEST_CHANNEL_KEY, id);
    return id;
  } catch {
    return "guest-local";
  }
}

export function tryUnlockExtended(code: string): boolean {
  const expected = readExtendedAccessCode();
  if (!expected || code.trim() !== expected) return false;
  setAppMode("extended");
  return true;
}

export function lockToGuest(): void {
  setAppMode("guest");
}

export function readLastRoster(channelId: string): number[] | null {
  if (typeof localStorage === "undefined" || !channelId) return null;
  try {
    const keyed = localStorage.getItem(`${LAST_ROSTER_KEY}:${channelId}`);
    if (keyed) {
      const ids = JSON.parse(keyed) as unknown;
      if (!Array.isArray(ids)) return null;
      return ids.filter((id): id is number => Number.isFinite(id));
    }
    // Legacy single-slot format
    const raw = localStorage.getItem(LAST_ROSTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastRoster;
    if (parsed.channelId !== channelId) return null;
    if (!Array.isArray(parsed.selectedIds)) return null;
    return parsed.selectedIds.filter((id) => Number.isFinite(id));
  } catch {
    return null;
  }
}

export function writeLastRoster(
  channelId: string,
  selectedIds: number[]
): void {
  if (typeof localStorage === "undefined" || !channelId) return;
  try {
    const ids = [...new Set(selectedIds)];
    localStorage.setItem(
      `${LAST_ROSTER_KEY}:${channelId}`,
      JSON.stringify(ids)
    );
  } catch {
    /* private mode */
  }
}
