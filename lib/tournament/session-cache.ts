const PREFIX = "baskr:tournament:";

export function tournamentCacheKey(tournamentId: string) {
  return `${PREFIX}${tournamentId}`;
}

export function readTournamentCache<T>(tournamentId: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(tournamentCacheKey(tournamentId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeTournamentCache<T>(tournamentId: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(tournamentCacheKey(tournamentId), JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function clearTournamentCache(tournamentId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(tournamentCacheKey(tournamentId));
  } catch {
    /* ignore */
  }
}

function celebrateFinalKey(tournamentId: string) {
  return `${PREFIX}${tournamentId}:celebrate-final`;
}

export function markCelebrateFinal(tournamentId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(celebrateFinalKey(tournamentId), "1");
  } catch {
    /* quota */
  }
}

export function readCelebrateFinal(tournamentId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(celebrateFinalKey(tournamentId)) === "1";
  } catch {
    return false;
  }
}

export function clearCelebrateFinal(tournamentId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(celebrateFinalKey(tournamentId));
  } catch {
    /* ignore */
  }
}
