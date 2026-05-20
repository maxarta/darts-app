"use client";

export function getInitData(): string {
  if (typeof window === "undefined") return "";
  try {
    // Dynamic require avoids SSR window access from @twa-dev/sdk
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WebApp = require("@twa-dev/sdk").default;
    return WebApp.initData || "";
  } catch {
    return "";
  }
}

function devHeaders(): Record<string, string> {
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    return { "x-dev-auth": "local" };
  }
  return {};
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": getInitData(),
      ...devHeaders(),
      ...options.headers,
    },
  });

  const text = await res.text();
  let data: { error?: string } = {};
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string };
    } catch {
      if (
        typeof window !== "undefined" &&
        window.location.hostname === "localhost" &&
        res.status === 403 &&
        !res.ok
      ) {
        throw new Error(
          "Порт 5000 занят AirPlay на Mac — откройте http://localhost:5001 (npm run dev)"
        );
      }
      throw new Error(
        res.ok
          ? "Некорректный ответ сервера"
          : `Ошибка сервера (${res.status}). Проверьте переменные на Vercel.`
      );
    }
  }

  if (!res.ok) {
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "localhost" &&
      res.status === 403 &&
      !text
    ) {
      throw new Error(
        "Порт 5000 занят AirPlay на Mac — откройте http://localhost:5001 (npm run dev)"
      );
    }
    const serverMessage =
      typeof data.error === "string" && data.error.length > 0
        ? data.error
        : res.status === 500
          ? "Ошибка сервера. Проверьте Supabase и BOT_TOKEN на Vercel."
          : "Request failed";
    throw new Error(serverMessage);
  }
  return data as T;
}
