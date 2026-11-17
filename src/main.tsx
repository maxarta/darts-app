import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { installButtonHaptics } from "@/lib/haptic";
import "@/app/globals.css";
import "@/src/fonts.css";

installButtonHaptics();

/** Only the loopback EmbeddedWeb origin had orphaned SW bugs (HTML for images).
 *  Native shell on artdart.vercel.app must KEEP the service worker so the club
 *  phone opens from cache instead of re-downloading the SPA every launch. */
function isLoopbackOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "127.0.0.1" || host === "localhost";
}

if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  if (isLoopbackOrigin()) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
    if (typeof caches !== "undefined") {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
  } else {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    void navigator.serviceWorker.ready.then((reg) => {
      void reg.update();
      // Occasional check is enough — 30s hammered the phone on every open.
      window.setInterval(() => void reg.update(), 15 * 60_000);
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
