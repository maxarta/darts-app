export const TV_CODE_LENGTH = 4;

/** Digits only, exactly 4 chars (0000–9999). */
export function normalizeTvCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, TV_CODE_LENGTH);
}

export function isValidTvCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}

export function generateTvCode(random: () => number = Math.random): string {
  const n = Math.floor(random() * 10_000);
  return String(n).padStart(TV_CODE_LENGTH, "0");
}

export function readTvCodeFromSettings(settings: unknown): string | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as { tvCode?: unknown }).tvCode;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const code = String(Math.trunc(raw)).padStart(TV_CODE_LENGTH, "0");
    return isValidTvCode(code) ? code : null;
  }
  if (typeof raw !== "string") return null;
  const code = normalizeTvCode(raw);
  return isValidTvCode(code) ? code : null;
}
