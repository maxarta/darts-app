import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "@/app/globals.css";
import "@/src/fonts.css";

/** Pull new PWA bundles so club phones don't stay on a stale cache (old «Правила», no TV). */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
