"use client";

function authHeaders(): Record<string, string> {
  return { "x-web-auth": "local" };
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
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
          ? "Ошибка сервера. Проверьте Supabase на Vercel."
          : "Request failed";
    throw new Error(serverMessage);
  }
  return data as T;
}
