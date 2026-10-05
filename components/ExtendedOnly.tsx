"use client";

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useTelegram } from "@/components/TelegramProvider";

/** Redirects guest sessions away from club-only screens. */
export function ExtendedOnly({ children }: { children: ReactNode }) {
  const { ready, appMode } = useTelegram();
  if (!ready) return null;
  if (appMode !== "extended") return <Navigate to="/" replace />;
  return <>{children}</>;
}
