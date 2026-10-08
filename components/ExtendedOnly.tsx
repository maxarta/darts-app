"use client";

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "@/components/SessionProvider";

/** Redirects guest sessions away from club-only screens. */
export function ExtendedOnly({ children }: { children: ReactNode }) {
  const { ready, appMode } = useSession();
  if (!ready) return null;
  if (appMode !== "extended") return <Navigate to="/" replace />;
  return <>{children}</>;
}
