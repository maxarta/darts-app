"use client";

import { useEffect } from "react";

/**
 * Lock background scroll while a modal is open.
 * Avoid position:fixed on body — it breaks Telegram/iOS after navigation.
 */
export function useBodyScrollLock(locked = true) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [locked]);
}
