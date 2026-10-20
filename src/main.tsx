import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { installButtonHaptics } from "@/lib/haptic";
import "@/app/globals.css";
import "@/src/fonts.css";

installButtonHaptics();

/** Native iOS shell + local Vite share a fixed origin; an orphaned PWA SW
 *  can serve HTML for /logo.svg and /home/trophy.png (broken «?» icons) and
 *  interfere with TV POSTs. Kill it there. Production club phones still update. */
function isEmbedOrLocalOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host === "127.0.0.1" || host === "localhost") return true;
  return Boolean(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).DartsNative?.isNative ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkit?.messageHandlers?.dartsNative
  );
}

if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  if (isEmbedOrLocalOrigin()) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
    if (typeof caches !== "undefined") {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
  } else {
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    void navigator.serviceWorker.ready.then((reg) => {
      void reg.update();
      window.setInterval(() => void reg.update(), 30_000);
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
