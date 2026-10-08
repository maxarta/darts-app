"use client";

import { resolveBackPath } from "@/lib/navigation/back-path";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import styles from "./appBackButton.module.css";

type Props = {
  tone?: "auto" | "dark" | "light";
  className?: string;
};

/** OS-style back chevron, aligned with the page title. */
export function AppBackButton({ tone = "auto", className }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = resolveBackPath(pathname, searchParams);

  const onClick = useCallback(() => {
    if (!target || target === "game_menu") return;
    if (target === "history_back") {
      router.back();
      return;
    }
    router.push(target);
  }, [router, target]);

  if (!target || target === "game_menu") {
    return null;
  }

  return (
    <button
      type="button"
      className={[styles.backArrow, styles[`tone_${tone}`], className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      aria-label="Назад"
    >
      <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden>
        <path
          d="M10.5 1.5 2 10l8.5 8.5"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
