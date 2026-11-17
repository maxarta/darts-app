import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { installButtonHaptics } from "@/lib/haptic";
import "@/app/globals.css";
import "@/src/fonts.css";

installButtonHaptics();

/** Loopback EmbeddedWeb had orphaned SW bugs. Everywhere else (Safari PWA,
 *  club phone WKWebView on artdart) must keep the service worker so the UI
 *  opens from cache instead of re-downloading. */
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
    // Register once, update quietly. Do NOT hard-reload on controllerchange —
    // that made every SW bump feel like a cold start.
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
    void navigator.serviceWorker.ready.then((reg) => {
      void reg.update();
      window.setInterval(() => void reg.update(), 30 * 60_000);
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
